import { and, eq, gte, inArray, isNull, like, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activeTimer,
  allocation,
  project,
  projectMember,
  timeEntry,
} from "@/lib/db/schema";
import {
  buildPhaseCode,
  ensureUniqueCode,
  getNextPhaseNumber,
  getPhaseLineageId,
  type ProjectPhaseLineage,
  pickCurrentPhase,
  summarizePhaseBudget,
} from "@/lib/projects/phases";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";
import { getWeekPeriod } from "@/lib/utils";
import type { CreateProjectPhaseInput } from "@/lib/validations/project-phase.schema";

// ─── Types ─────────────────────────────────────────────────────────────────────

export type StartPhaseErrorCode =
  | "PROJECT_NOT_FOUND"
  | "NOT_LATEST_PHASE"
  | "START_DATE_IN_FUTURE"
  | "CODE_TAKEN";

export class StartPhaseError extends Error {
  constructor(
    readonly code: StartPhaseErrorCode,
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "StartPhaseError";
  }
}

// ─── Queries ───────────────────────────────────────────────────────────────────

const lineageColumns = {
  id: true,
  name: true,
  code: true,
  phase: true,
  phaseRootId: true,
  status: true,
  color: true,
  budget: true,
  startDate: true,
  endDate: true,
  createdAt: true,
} as const;

function lineageFilter(lineageId: string) {
  return or(eq(project.id, lineageId), eq(project.phaseRootId, lineageId));
}

async function sumConsumedMinutes(
  projectIds: string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();

  const rows = await db
    .select({
      projectId: timeEntry.projectId,
      minutes: sql<number>`coalesce(sum(${timeEntry.duration}), 0)::int`,
    })
    .from(timeEntry)
    .where(
      and(
        inArray(timeEntry.projectId, projectIds),
        isNull(timeEntry.deletedAt),
      ),
    )
    .groupBy(timeEntry.projectId);

  return new Map(rows.map((row) => [row.projectId, Number(row.minutes)]));
}

/**
 * Every phase of the lineage `projectId` belongs to, oldest first, each with
 * its own budget consumption. `accessibleProjectIds` null means "sees all".
 */
export async function getProjectPhaseLineage(
  projectId: string,
  accessibleProjectIds: readonly string[] | null,
): Promise<ProjectPhaseLineage | null> {
  const found = await db.query.project.findFirst({
    where: eq(project.id, projectId),
    columns: { id: true, phaseRootId: true },
  });
  if (!found) return null;

  const lineageId = getPhaseLineageId(found);
  const rows = await db.query.project.findMany({
    where: lineageFilter(lineageId),
    columns: lineageColumns,
    orderBy: (table, { asc }) => [asc(table.phase), asc(table.createdAt)],
  });

  const consumed = await sumConsumedMinutes(rows.map((row) => row.id));
  const current = pickCurrentPhase(rows);
  const accessible = accessibleProjectIds
    ? new Set(accessibleProjectIds)
    : null;

  return {
    lineageId,
    currentPhaseId: current?.id ?? null,
    nextPhase: getNextPhaseNumber(rows),
    phases: rows.map((row) => {
      const usage = summarizePhaseBudget(row.budget, consumed.get(row.id) ?? 0);
      return {
        id: row.id,
        name: row.name,
        code: row.code,
        phase: row.phase,
        status: row.status,
        color: row.color,
        budgetHours: usage.budgetHours,
        consumedHours: usage.consumedHours,
        usageRatio: usage.usageRatio,
        startDate: row.startDate,
        endDate: row.endDate,
        isCurrent: row.id === current?.id,
        accessible: !accessible || accessible.has(row.id),
      };
    }),
  };
}

// ─── Commands ──────────────────────────────────────────────────────────────────

/**
 * Starts the next phase of a project, atomically:
 *  1. closes (archives) the source phase — it keeps every hour already logged;
 *  2. creates the new phase as the active project, inheriting client, Azure
 *     DevOps link, manager, scope and (optionally) the team;
 *  3. hands over what is still in flight for the new phase's team: running
 *     timers and planned allocations from the start week on.
 */
export async function startNextProjectPhase(
  sourceProjectId: string,
  input: CreateProjectPhaseInput,
): Promise<{ id: string; phase: number; previousPhaseId: string }> {
  if (input.startDate > todayInAppTimeZone()) {
    throw new StartPhaseError(
      "START_DATE_IN_FUTURE",
      "A nova fase passa a receber horas assim que é criada. Use a data de hoje ou uma data passada.",
      400,
    );
  }

  return db.transaction(async (tx) => {
    // Lock the source row so two managers cannot open the same phase twice.
    const [source] = await tx
      .select()
      .from(project)
      .where(eq(project.id, sourceProjectId))
      .for("update");

    if (!source) {
      throw new StartPhaseError(
        "PROJECT_NOT_FOUND",
        "Projeto não encontrado.",
        404,
      );
    }

    const lineageId = getPhaseLineageId(source);
    const lineage = await tx.query.project.findMany({
      where: lineageFilter(lineageId),
      columns: { id: true, phase: true },
    });

    const nextPhase = getNextPhaseNumber(lineage);
    if (source.phase !== nextPhase - 1) {
      throw new StartPhaseError(
        "NOT_LATEST_PHASE",
        `Este projeto já tem a Fase ${nextPhase - 1}. Abra a fase mais recente para iniciar a próxima.`,
        409,
      );
    }

    const desiredCode = input.code || buildPhaseCode(source.code, nextPhase);
    const takenCodes = await tx.query.project.findMany({
      where: like(project.code, `${desiredCode.slice(0, 17)}%`),
      columns: { code: true },
    });
    const takenSet = new Set(takenCodes.map((item) => item.code));
    if (input.code && takenSet.has(input.code)) {
      throw new StartPhaseError(
        "CODE_TAKEN",
        `O código ${input.code} já está em uso por outro projeto.`,
        409,
      );
    }
    const code = ensureUniqueCode(desiredCode, takenSet);

    // Close the source phase first: the partial unique index allows a single
    // active project per Azure DevOps project.
    await tx
      .update(project)
      .set({
        status: "archived",
        endDate:
          source.endDate ?? closingDateFor(source.startDate, input.startDate),
      })
      .where(eq(project.id, source.id));

    const newProjectId = crypto.randomUUID();
    await tx.insert(project).values({
      id: newProjectId,
      name: input.name,
      code,
      description: input.description ?? source.description,
      clientName: source.clientName,
      color: source.color,
      status: "active",
      billable: source.billable,
      budget: input.budget,
      source: source.source,
      azureProjectId: source.azureProjectId,
      azureProjectUrl: source.azureProjectUrl,
      imageUrl: source.imageUrl,
      managerId: source.managerId,
      scopeId: source.scopeId,
      currentStage: null,
      commercialName: source.commercialName,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      integrationKey: source.integrationKey,
      phase: nextPhase,
      phaseRootId: lineageId,
    });

    const sourceMembers = input.copyMembers
      ? await tx.query.projectMember.findMany({
          where: eq(projectMember.projectId, source.id),
          columns: { userId: true },
        })
      : [];
    const memberIds = new Set(sourceMembers.map((member) => member.userId));
    if (source.managerId) memberIds.add(source.managerId);

    if (memberIds.size > 0) {
      await tx.insert(projectMember).values(
        [...memberIds].map((userId) => ({
          id: crypto.randomUUID(),
          projectId: newProjectId,
          userId,
        })),
      );
    }

    // In-flight work follows only the people who are on the new phase; anyone
    // left out keeps their timer and plan on the closed phase.
    const handoverUserIds = [...memberIds];
    if (handoverUserIds.length > 0) {
      await tx
        .update(activeTimer)
        .set({ projectId: newProjectId })
        .where(
          and(
            eq(activeTimer.projectId, source.id),
            inArray(activeTimer.userId, handoverUserIds),
          ),
        );

      const handoverWeek = [
        getWeekPeriod(input.startDate),
        getWeekPeriod(todayInAppTimeZone()),
      ].sort()[1] as string;
      await tx
        .update(allocation)
        .set({ projectId: newProjectId })
        .where(
          and(
            eq(allocation.projectId, source.id),
            inArray(allocation.userId, handoverUserIds),
            gte(allocation.week, handoverWeek),
          ),
        );
    }

    return { id: newProjectId, phase: nextPhase, previousPhaseId: source.id };
  });
}

/** The closed phase ends the day before the next one starts, never before it began. */
function closingDateFor(
  previousStartDate: string | null,
  nextStartDate: string,
): string {
  const dayBefore = shiftDay(nextStartDate, -1);
  return previousStartDate && dayBefore < previousStartDate
    ? previousStartDate
    : dayBefore;
}
