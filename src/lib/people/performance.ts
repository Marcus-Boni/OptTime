import { endOfISOWeek, format, startOfISOWeek, subDays } from "date-fns";
import { and, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { type ActorContext, buildScopedUserWhere } from "@/lib/access-control";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { buildCommitAuthorCandidates } from "@/lib/azure-devops/commit-author";
import { db } from "@/lib/db";
import {
  azureDevopsConfig,
  project,
  projectMember,
  timeEntry,
  timesheet,
  user,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { getWeekPeriod } from "@/lib/utils";
import type { AzureDevOpsAssignedWorkItem } from "@/types/azure-devops";
import type {
  PeoplePerformanceAlert,
  PeoplePerformanceCommitSnapshot,
  PeoplePerformanceHealth,
  PeoplePerformanceProjectSnapshot,
  PeoplePerformanceResponse,
  PeoplePerformanceUserRow,
  PeoplePerformanceWorkItemSnapshot,
} from "@/types/people-performance";

type UserProject = {
  id: string;
  name: string;
  color: string;
  source: string;
  azureProjectId: string | null;
};

type TimeEntryRecord = {
  userId: string;
  projectId: string;
  duration: number;
  date: string;
  billable: boolean;
};

type TimesheetRecord = {
  userId: string;
  status: string;
};

type AzureConfigRecord = {
  userId: string;
  organizationUrl: string;
  pat: string;
  commitAuthor: string | null;
};

const STALE_ITEM_DAYS = 7;
const MAX_WORK_ITEMS = 80;
const MAX_COMMITS = 30;
const USER_CONCURRENCY = 3;

function normalizeNumber(value: number) {
  return Number(value.toFixed(1));
}

function getOrCreateMapEntry<TKey, TValue>(
  map: Map<TKey, TValue>,
  key: TKey,
  createValue: () => TValue,
) {
  const existing = map.get(key);
  if (existing) {
    return existing;
  }

  const nextValue = createValue();
  map.set(key, nextValue);
  return nextValue;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function isWorkItemBlocked(item: AzureDevOpsAssignedWorkItem) {
  const state = item.state.toLowerCase();
  const tags = item.tags?.join(" ").toLowerCase() ?? "";

  return (
    state.includes("blocked") ||
    state.includes("imped") ||
    tags.includes("blocked") ||
    tags.includes("imped")
  );
}

function isWorkItemUnestimated(item: AzureDevOpsAssignedWorkItem) {
  return (
    item.originalEstimate == null &&
    item.remainingWork == null &&
    item.completedWork == null
  );
}

/**
 * Estados terminais que nunca devem ser computados como backlog ativo.
 * Serve como segunda camada de filtragem além da WIQL, cobrindo variações
 * regionais e customizações de processo (ex: "Cancelado", "Cancelad").
 */
const TERMINAL_STATES = new Set([
  "done",
  "completed",
  "closed",
  "removed",
  "canceled",
  "cancelado",
  "resolved",
]);

function isTerminalState(state: string): boolean {
  return TERMINAL_STATES.has(state.toLowerCase().trim());
}

/**
 * Deriva as horas restantes de um work item.
 *
 * Prioridade:
 * 1. remainingWork (campo direto — Tasks e PBIs com tracking explícito)
 * 2. originalEstimate - completedWork (tracking parcial)
 * 3. originalEstimate sozinho quando completedWork é undefined/null
 *    (PBIs onde o trabalho ainda não foi iniciado e não há tasks filhas)
 * 4. 0 — sem estimativa alguma
 */
function getDerivedRemainingHours(item: AzureDevOpsAssignedWorkItem): number {
  if (typeof item.remainingWork === "number") {
    return Math.max(item.remainingWork, 0);
  }

  if (typeof item.originalEstimate === "number") {
    const completed = item.completedWork ?? 0;
    return Math.max(item.originalEstimate - completed, 0);
  }

  return 0;
}

function computeHealthStatus(
  integrationStatus: PeoplePerformanceUserRow["integration"]["status"],
  score: number,
): PeoplePerformanceHealth {
  if (integrationStatus !== "connected") {
    return "offline";
  }

  if (score >= 85) return "excellent";
  if (score >= 70) return "stable";
  if (score >= 50) return "attention";
  return "critical";
}

/**
 * Calcula o score de performance (0–100).
 *
 * Nota: commits foram intencionalmente excluídos do cálculo pois muitos
 * colaboradores realizam trabalho válido sem commitar (design, gestão,
 * QA, documentação etc.). Os dados de commits são ainda coletados e
 * exibidos no painel individual como contexto técnico adicional.
 *
 * Pesos:
 *   50% Utilização de capacidade semanal
 *   25% Cobertura de estimativas no backlog ativo
 *   15% Frescor do backlog (itens atualizados recentemente)
 *   10% Fluxo operacional (itens bloqueados / acumulo)
 */
function computePerformanceScore(input: {
  integrationStatus: PeoplePerformanceUserRow["integration"]["status"];
  utilizationPercent: number;
  activeItems: number;
  itemsWithoutEstimate: number;
  staleItems: number;
  blockedItems: number;
}): number {
  const utilizationScore = clamp(input.utilizationPercent, 0, 100) * 0.5;
  const planningScore =
    (input.activeItems === 0
      ? 100
      : ((input.activeItems - input.itemsWithoutEstimate) / input.activeItems) *
        100) * 0.25;
  const freshnessScore =
    (input.activeItems === 0
      ? 100
      : ((input.activeItems - input.staleItems) / input.activeItems) * 100) *
    0.15;
  const flowScore =
    (input.activeItems === 0
      ? 85
      : clamp(
          100 -
            input.blockedItems * 18 -
            Math.max(input.activeItems - 10, 0) * 4,
          0,
          100,
        )) * 0.1;

  const baseScore =
    utilizationScore + planningScore + freshnessScore + flowScore;

  if (input.integrationStatus !== "connected") {
    // Sem Azure: só a utilização + fração do planejamento são observáveis.
    return Math.round(clamp(utilizationScore + planningScore * 0.25, 0, 55));
  }

  return Math.round(clamp(baseScore, 0, 100));
}

function buildAlert(
  id: string,
  level: PeoplePerformanceAlert["level"],
  label: string,
  detail: string,
): PeoplePerformanceAlert {
  return { id, level, label, detail };
}

function buildHighlights(input: {
  utilizationPercent: number;
  activeItems: number;
  itemsWithoutEstimate: number;
  alerts: PeoplePerformanceAlert[];
}) {
  const primary =
    input.activeItems > 0
      ? `${input.activeItems} item(ns) ativo(s) no Azure DevOps`
      : "Sem backlog ativo no Azure DevOps";

  const secondary =
    input.alerts[0]?.detail ??
    `${input.utilizationPercent}% da capacidade semanal utilizada`;

  if (input.itemsWithoutEstimate > 0 && input.alerts.length === 0) {
    return {
      primary,
      secondary: `${input.itemsWithoutEstimate} item(ns) sem estimativa precisam de refinamento`,
    };
  }

  return { primary, secondary };
}

async function mapWithConcurrency<TInput, TOutput>(
  items: TInput[],
  concurrency: number,
  mapper: (item: TInput, index: number) => Promise<TOutput>,
) {
  const results = new Array<TOutput>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (true) {
      const currentIndex = nextIndex;
      nextIndex += 1;

      if (currentIndex >= items.length) {
        return;
      }

      results[currentIndex] = await mapper(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

export async function getPeoplePerformance(
  actor: ActorContext,
): Promise<PeoplePerformanceResponse> {
  const today = new Date();
  const todayIso = format(today, "yyyy-MM-dd");
  const weekStart = format(startOfISOWeek(today), "yyyy-MM-dd");
  const weekEnd = format(endOfISOWeek(today), "yyyy-MM-dd");
  const last30DaysStart = format(subDays(today, 29), "yyyy-MM-dd");
  const staleCutoff = subDays(today, STALE_ITEM_DAYS);
  const currentWeekPeriod = getWeekPeriod(today);

  const scopedUserWhere = await buildScopedUserWhere(actor);

  const usersQuery = db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      role: user.role,
      department: user.department,
      isActive: user.isActive,
      weeklyCapacity: user.weeklyCapacity,
    })
    .from(user)
    .orderBy(user.name);

  const scopedUsers = scopedUserWhere
    ? await usersQuery.where(scopedUserWhere)
    : await usersQuery;

  if (scopedUsers.length === 0) {
    return {
      generatedAt: new Date().toISOString(),
      period: {
        today: todayIso,
        weekStart,
        weekEnd,
        last30DaysStart,
      },
      summary: {
        monitoredUsers: 0,
        connectedUsers: 0,
        usersWithAlerts: 0,
        usersWithoutAzure: 0,
        activeItems: 0,
        remainingHours: 0,
        loggedThisWeekMinutes: 0,
        commits30d: 0,
        pendingTimesheets: 0,
        averagePerformanceScore: 0,
      },
      users: [],
    };
  }

  const userIds = scopedUsers.map((person) => person.id);

  const [
    activeProjects,
    memberships,
    azureConfigs,
    recentEntries,
    currentTimesheets,
  ] = await Promise.all([
    db.query.project.findMany({
      where: eq(project.status, "active"),
      columns: {
        id: true,
        name: true,
        color: true,
        source: true,
        azureProjectId: true,
        managerId: true,
      },
    }),
    db.query.projectMember.findMany({
      where: inArray(projectMember.userId, userIds),
      columns: {
        userId: true,
        projectId: true,
      },
    }),
    db
      .select({
        userId: azureDevopsConfig.userId,
        organizationUrl: azureDevopsConfig.organizationUrl,
        pat: azureDevopsConfig.pat,
        commitAuthor: azureDevopsConfig.commitAuthor,
      })
      .from(azureDevopsConfig)
      .where(inArray(azureDevopsConfig.userId, userIds)),
    db
      .select({
        userId: timeEntry.userId,
        projectId: timeEntry.projectId,
        duration: timeEntry.duration,
        date: timeEntry.date,
        billable: timeEntry.billable,
      })
      .from(timeEntry)
      .where(
        and(
          inArray(timeEntry.userId, userIds),
          gte(timeEntry.date, last30DaysStart),
          lte(timeEntry.date, todayIso),
          sql`${timeEntry.deletedAt} IS NULL`,
        ),
      ),
    db
      .select({
        userId: timesheet.userId,
        status: timesheet.status,
      })
      .from(timesheet)
      .where(
        and(
          inArray(timesheet.userId, userIds),
          eq(timesheet.period, currentWeekPeriod),
        ),
      ),
  ]);

  const projectById = new Map(
    activeProjects.map((currentProject) => [currentProject.id, currentProject]),
  );

  const userProjectsMap = new Map<string, UserProject[]>();

  for (const person of scopedUsers) {
    const assigned = new Map<string, UserProject>();

    for (const membership of memberships) {
      if (membership.userId !== person.id) {
        continue;
      }

      const linkedProject = projectById.get(membership.projectId);
      if (!linkedProject) {
        continue;
      }

      assigned.set(linkedProject.id, linkedProject);
    }

    for (const managedProject of activeProjects) {
      if (managedProject.managerId === person.id) {
        assigned.set(managedProject.id, managedProject);
      }
    }

    userProjectsMap.set(person.id, [...assigned.values()]);
  }

  const azureConfigMap = new Map<string, AzureConfigRecord>(
    azureConfigs.map((config) => [config.userId, config]),
  );

  const entriesByUser = new Map<string, TimeEntryRecord[]>();
  for (const entry of recentEntries) {
    const bucket = getOrCreateMapEntry(entriesByUser, entry.userId, () => []);
    bucket.push(entry);
  }

  const timesheetByUser = new Map<string, TimesheetRecord>(
    currentTimesheets.map((currentTimesheet) => [
      currentTimesheet.userId,
      currentTimesheet,
    ]),
  );

  const rows = await mapWithConcurrency(
    scopedUsers,
    USER_CONCURRENCY,
    async (person) => {
      const assignedProjects = userProjectsMap.get(person.id) ?? [];
      const azureProjects = assignedProjects.filter(
        (currentProject) =>
          currentProject.source === "azure-devops" ||
          currentProject.azureProjectId !== null,
      );
      const config = azureConfigMap.get(person.id);
      const timeEntries = entriesByUser.get(person.id) ?? [];
      const logged30dMinutes = timeEntries.reduce(
        (sum, entry) => sum + entry.duration,
        0,
      );
      const loggedThisWeekMinutes = timeEntries
        .filter((entry) => entry.date >= weekStart)
        .reduce((sum, entry) => sum + entry.duration, 0);

      const perProjectLocalMinutes = new Map<string, number>();
      for (const entry of timeEntries) {
        perProjectLocalMinutes.set(
          entry.projectId,
          (perProjectLocalMinutes.get(entry.projectId) ?? 0) + entry.duration,
        );
      }

      const integrationStatus: PeoplePerformanceUserRow["integration"]["status"] =
        !config ? "missing" : decrypt(config.pat) ? "connected" : "invalid";

      const alerts: PeoplePerformanceAlert[] = [];
      const topWorkItems: PeoplePerformanceWorkItemSnapshot[] = [];
      const recentCommits: PeoplePerformanceCommitSnapshot[] = [];
      const projectSnapshots: PeoplePerformanceProjectSnapshot[] = [];

      let activeItems = 0;
      let staleItems = 0;
      let blockedItems = 0;
      let itemsWithoutEstimate = 0;
      let remainingHours = 0;
      let completedHours = 0;
      let commits30d = 0;
      let linkedCommits30d = 0;
      let lastActivityAt: string | null = null;
      let analyzedProjects = 0;

      if (!config) {
        alerts.push(
          buildAlert(
            "missing-config",
            "warning",
            "Integração Azure não configurada",
            "Este colaborador ainda não conectou a conta do Azure DevOps na plataforma.",
          ),
        );
      } else {
        const pat = decrypt(config.pat);

        if (!pat) {
          alerts.push(
            buildAlert(
              "invalid-pat",
              "critical",
              "PAT inválido ou indisponível",
              "Não foi possível descriptografar o token salvo. O colaborador precisa reconectar a integração.",
            ),
          );
        } else if (azureProjects.length === 0) {
          alerts.push(
            buildAlert(
              "no-projects",
              "info",
              "Sem projetos Azure vinculados",
              "Não há projetos ativos vinculados ao Azure DevOps para este colaborador dentro da plataforma.",
            ),
          );
        } else {
          const client = createAzureDevOpsClient(config.organizationUrl, pat);
          const authorCandidates = buildCommitAuthorCandidates({
            configuredAuthor: config.commitAuthor,
            userEmail: person.email,
            userName: person.name,
          });
          const projectRefs = azureProjects.map(
            (currentProject) =>
              currentProject.azureProjectId ?? currentProject.name,
          );
          analyzedProjects = projectRefs.length;

          const [workItemResults, commitResults] = await Promise.all([
            Promise.allSettled(
              projectRefs.map((projectRef) =>
                client.getAssignedWorkItems(projectRef, MAX_WORK_ITEMS),
              ),
            ),
            authorCandidates.length === 0
              ? Promise.resolve([])
              : Promise.allSettled(
                  projectRefs.map((projectRef) =>
                    client.getRecentCommits(projectRef, {
                      authorCandidates,
                      fromDate: last30DaysStart,
                      toDate: todayIso,
                      top: MAX_COMMITS,
                    }),
                  ),
                ),
          ]);

          const workItemsMap = new Map<number, AzureDevOpsAssignedWorkItem>();
          let workItemFailures = 0;

          for (const result of workItemResults) {
            if (result.status === "rejected") {
              workItemFailures += 1;
              continue;
            }

            for (const item of result.value) {
              workItemsMap.set(item.id, item);
            }
          }

          const commitsMap = new Map<string, PeoplePerformanceCommitSnapshot>();
          let commitFailures = 0;

          for (const result of commitResults) {
            if (result.status === "rejected") {
              commitFailures += 1;
              continue;
            }

            for (const commit of result.value) {
              commitsMap.set(commit.id, {
                id: commit.id,
                message: commit.message,
                projectName: commit.projectName,
                repositoryName: commit.repositoryName,
                timestamp: commit.timestamp,
                branch: commit.branch,
                linkedWorkItems: commit.workItemIds.length,
              });
            }
          }

          const projectMetrics = new Map<
            string,
            Omit<
              PeoplePerformanceProjectSnapshot,
              "id" | "name" | "color" | "source"
            >
          >();

          for (const currentProject of assignedProjects) {
            projectMetrics.set(currentProject.name, {
              activeItems: 0,
              staleItems: 0,
              itemsWithoutEstimate: 0,
              remainingHours: 0,
              loggedMinutes30d:
                perProjectLocalMinutes.get(currentProject.id) ?? 0,
              commits30d: 0,
            });
          }

          for (const item of workItemsMap.values()) {
            // Segunda camada de segurança: exclui estados terminais que
            // possam ter escapado da WIQL (ex: variações customizadas de processo).
            if (isTerminalState(item.state)) {
              continue;
            }

            const stale =
              item.changedDate != null &&
              new Date(item.changedDate).getTime() < staleCutoff.getTime();
            const blocked = isWorkItemBlocked(item);
            const unestimated = isWorkItemUnestimated(item);
            const derivedRemaining = getDerivedRemainingHours(item);

            activeItems += 1;
            staleItems += stale ? 1 : 0;
            blockedItems += blocked ? 1 : 0;
            itemsWithoutEstimate += unestimated ? 1 : 0;
            remainingHours += derivedRemaining;
            completedHours += item.completedWork ?? 0;

            const metricBucket = getOrCreateMapEntry(
              projectMetrics,
              item.projectName,
              () => ({
                activeItems: 0,
                staleItems: 0,
                itemsWithoutEstimate: 0,
                remainingHours: 0,
                loggedMinutes30d: 0,
                commits30d: 0,
              }),
            );
            metricBucket.activeItems += 1;
            metricBucket.staleItems += stale ? 1 : 0;
            metricBucket.itemsWithoutEstimate += unestimated ? 1 : 0;
            metricBucket.remainingHours += derivedRemaining;

            topWorkItems.push({
              id: item.id,
              title: item.title,
              type: item.type,
              state: item.state,
              projectName: item.projectName,
              changedAt: item.changedDate ?? null,
              createdAt: item.createdDate ?? null,
              remainingWork:
                typeof item.remainingWork === "number"
                  ? item.remainingWork
                  : null,
              originalEstimate:
                typeof item.originalEstimate === "number"
                  ? item.originalEstimate
                  : null,
              priority:
                typeof item.priority === "number" ? item.priority : null,
              url: item.url,
              stale,
              blocked,
              unestimated,
            });

            const candidateActivity =
              item.changedDate ?? item.createdDate ?? null;
            if (
              candidateActivity &&
              (!lastActivityAt ||
                new Date(candidateActivity).getTime() >
                  new Date(lastActivityAt).getTime())
            ) {
              lastActivityAt = candidateActivity;
            }
          }

          for (const commit of commitsMap.values()) {
            commits30d += 1;
            linkedCommits30d += commit.linkedWorkItems > 0 ? 1 : 0;
            recentCommits.push(commit);

            const metricBucket = getOrCreateMapEntry(
              projectMetrics,
              commit.projectName,
              () => ({
                activeItems: 0,
                staleItems: 0,
                itemsWithoutEstimate: 0,
                remainingHours: 0,
                loggedMinutes30d: 0,
                commits30d: 0,
              }),
            );
            metricBucket.commits30d += 1;

            if (
              !lastActivityAt ||
              new Date(commit.timestamp).getTime() >
                new Date(lastActivityAt).getTime()
            ) {
              lastActivityAt = commit.timestamp;
            }
          }

          for (const currentProject of assignedProjects) {
            const metrics = projectMetrics.get(currentProject.name);
            if (!metrics) {
              continue;
            }

            projectSnapshots.push({
              id: currentProject.id,
              name: currentProject.name,
              color: currentProject.color,
              source: currentProject.source,
              activeItems: metrics.activeItems,
              staleItems: metrics.staleItems,
              itemsWithoutEstimate: metrics.itemsWithoutEstimate,
              remainingHours: normalizeNumber(metrics.remainingHours),
              loggedMinutes30d: metrics.loggedMinutes30d,
              commits30d: metrics.commits30d,
            });
          }

          if (workItemFailures > 0) {
            alerts.push(
              buildAlert(
                "azure-workitems-partial",
                "warning",
                "Cobertura parcial de backlog",
                `${workItemFailures} projeto(s) não puderam ser consultados no Azure DevOps com este PAT.`,
              ),
            );
          }

          if (commitFailures > 0) {
            alerts.push(
              buildAlert(
                "azure-commits-partial",
                "warning",
                "Cobertura parcial de commits",
                `${commitFailures} projeto(s) não retornaram commits para este colaborador no período analisado.`,
              ),
            );
          }
        }
      }

      const timesheetStatus = timesheetByUser.get(person.id)?.status ?? null;
      const utilizationPercent =
        person.weeklyCapacity > 0
          ? Math.round(
              (loggedThisWeekMinutes / (person.weeklyCapacity * 60)) * 100,
            )
          : 0;

      const lastLoggedAt =
        timeEntries
          .map((entry) => entry.date)
          .sort((left, right) => right.localeCompare(left))[0] ?? null;

      if (
        lastLoggedAt &&
        (!lastActivityAt ||
          new Date(lastLoggedAt).getTime() > new Date(lastActivityAt).getTime())
      ) {
        lastActivityAt = lastLoggedAt;
      }

      if (!person.isActive) {
        alerts.push(
          buildAlert(
            "inactive-user",
            "info",
            "Usuário inativo",
            "O colaborador está desativado na plataforma, então os indicadores servem apenas como histórico.",
          ),
        );
      }

      if (loggedThisWeekMinutes === 0) {
        alerts.push(
          buildAlert(
            "no-hours-week",
            "warning",
            "Sem horas lançadas na semana",
            "Nenhum apontamento foi registrado no período semanal atual.",
          ),
        );
      }

      if (
        timesheetStatus &&
        timesheetStatus !== "approved" &&
        timesheetStatus !== "submitted"
      ) {
        alerts.push(
          buildAlert(
            "timesheet-open",
            "warning",
            "Timesheet ainda não enviado",
            "A folha semanal continua aberta e precisa ser submetida para aprovação.",
          ),
        );
      }

      if (itemsWithoutEstimate > 0) {
        alerts.push(
          buildAlert(
            "unestimated-items",
            "warning",
            "Itens sem estimativa",
            `${itemsWithoutEstimate} item(ns) ativo(s) não possuem estimativa clara de esforço.`,
          ),
        );
      }

      if (staleItems > 0) {
        alerts.push(
          buildAlert(
            "stale-items",
            staleItems >= 3 ? "critical" : "warning",
            "Itens sem atualização recente",
            `${staleItems} item(ns) estão há ${STALE_ITEM_DAYS}+ dias sem mudança visível.`,
          ),
        );
      }

      if (blockedItems > 0) {
        alerts.push(
          buildAlert(
            "blocked-items",
            "critical",
            "Itens bloqueados",
            `${blockedItems} item(ns) sinalizam bloqueio ou impedimento no Azure DevOps.`,
          ),
        );
      }


      topWorkItems.sort((left, right) => {
        const leftStaleScore = Number(right.stale) - Number(left.stale);
        if (leftStaleScore !== 0) {
          return leftStaleScore;
        }

        return (left.priority ?? 99) - (right.priority ?? 99);
      });

      recentCommits.sort(
        (left, right) =>
          new Date(right.timestamp).getTime() -
          new Date(left.timestamp).getTime(),
      );

      projectSnapshots.sort((left, right) => {
        if (right.activeItems !== left.activeItems) {
          return right.activeItems - left.activeItems;
        }

        return right.loggedMinutes30d - left.loggedMinutes30d;
      });

      const performanceScore = computePerformanceScore({
        integrationStatus,
        utilizationPercent,
        activeItems,
        itemsWithoutEstimate,
        staleItems,
        blockedItems,
      });
      const health = computeHealthStatus(integrationStatus, performanceScore);
      const highlights = buildHighlights({
        utilizationPercent,
        activeItems,
        itemsWithoutEstimate,
        alerts,
      });

      return {
        user: person,
        integration: {
          status: integrationStatus,
          organizationUrl: config?.organizationUrl ?? null,
          commitAuthor: config?.commitAuthor ?? null,
          analyzedProjects,
        },
        metrics: {
          assignedProjects: assignedProjects.length,
          azureProjects: azureProjects.length,
          activeItems,
          staleItems,
          blockedItems,
          itemsWithoutEstimate,
          remainingHours: normalizeNumber(remainingHours),
          completedHours: normalizeNumber(completedHours),
          loggedThisWeekMinutes,
          logged30dMinutes,
          utilizationPercent,
          commits30d,
          linkedCommits30d,
          lastActivityAt,
          performanceScore,
          health,
          timesheetStatus,
        },
        highlights,
        alerts: alerts.sort((left, right) => {
          const severityOrder = {
            critical: 0,
            warning: 1,
            info: 2,
            success: 3,
          } as const;

          return severityOrder[left.level] - severityOrder[right.level];
        }),
        projects: projectSnapshots.slice(0, 6),
        topWorkItems: topWorkItems.slice(0, 8),
        recentCommits: recentCommits.slice(0, 8),
      } satisfies PeoplePerformanceUserRow;
    },
  );

  rows.sort((left, right) => {
    if (right.metrics.performanceScore !== left.metrics.performanceScore) {
      return right.metrics.performanceScore - left.metrics.performanceScore;
    }

    return left.user.name.localeCompare(right.user.name, "pt-BR");
  });

  const summary = rows.reduce(
    (acc, row) => {
      acc.monitoredUsers += 1;
      acc.connectedUsers += row.integration.status === "connected" ? 1 : 0;
      acc.usersWithoutAzure += row.integration.status !== "connected" ? 1 : 0;
      acc.usersWithAlerts += row.alerts.length > 0 ? 1 : 0;
      acc.activeItems += row.metrics.activeItems;
      acc.remainingHours += row.metrics.remainingHours;
      acc.loggedThisWeekMinutes += row.metrics.loggedThisWeekMinutes;
      acc.commits30d += row.metrics.commits30d;
      acc.pendingTimesheets +=
        row.metrics.timesheetStatus &&
        row.metrics.timesheetStatus !== "approved" &&
        row.metrics.timesheetStatus !== "submitted"
          ? 1
          : 0;
      acc.averagePerformanceScore += row.metrics.performanceScore;
      return acc;
    },
    {
      monitoredUsers: 0,
      connectedUsers: 0,
      usersWithAlerts: 0,
      usersWithoutAzure: 0,
      activeItems: 0,
      remainingHours: 0,
      loggedThisWeekMinutes: 0,
      commits30d: 0,
      pendingTimesheets: 0,
      averagePerformanceScore: 0,
    },
  );

  summary.remainingHours = normalizeNumber(summary.remainingHours);
  summary.averagePerformanceScore =
    summary.monitoredUsers > 0
      ? Math.round(summary.averagePerformanceScore / summary.monitoredUsers)
      : 0;

  return {
    generatedAt: new Date().toISOString(),
    period: {
      today: todayIso,
      weekStart,
      weekEnd,
      last30DaysStart,
    },
    summary,
    users: rows,
  };
}
