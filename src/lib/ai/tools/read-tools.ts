import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import {
  getAccessibleProjectIds,
  getDirectReportIds,
  getManagedProjectIds,
} from "@/lib/access-control";
import {
  eachDate,
  formatDayLabel,
  formatWeekdayLabel,
  isWeekend,
  PERIOD_KEYS,
  type PeriodKey,
  resolvePeriod,
} from "@/lib/ai/periods";
import type {
  JsonSchemaObject,
  SummaryDaySlice,
  SummaryProjectSlice,
} from "@/lib/ai/types";
import {
  AzureDevOpsError,
  createAzureDevOpsClient,
} from "@/lib/azure-devops/client";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import {
  activeTimer,
  project,
  projectMember,
  timeEntry,
  timesheet,
  user,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { formatDuration, getWeekPeriod } from "@/lib/utils";
import type { AgentTool, ToolContext } from "./types";

const periodEnum = z.enum(PERIOD_KEYS as [PeriodKey, ...PeriodKey[]]);

const periodParameters: JsonSchemaObject = {
  type: "object",
  properties: {
    period: {
      type: "string",
      enum: PERIOD_KEYS,
      description:
        "Período desejado. Use 'custom' junto de from/to para intervalos específicos.",
    },
    from: { type: "string", description: "Data inicial YYYY-MM-DD" },
    to: { type: "string", description: "Data final YYYY-MM-DD" },
  },
};

const periodArgsSchema = z.object({
  period: periodEnum.optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

type PeriodArgs = z.infer<typeof periodArgsSchema>;

/** Tools without parameters still receive an object from the model. */
const emptyArgsSchema = z.object({});
type EmptyArgs = z.infer<typeof emptyArgsSchema>;

// ─── Shared data helpers ─────────────────────────────────────────────

interface EntryRow {
  id: string;
  date: string;
  description: string;
  duration: number;
  billable: boolean;
  azureWorkItemId: number | null;
  timesheetStatus: string | null;
  project: { id: string; name: string; code: string; color: string } | null;
}

async function fetchEntries(
  userId: string,
  from: string,
  to: string,
  projectId?: string,
): Promise<EntryRow[]> {
  const conditions = [
    eq(timeEntry.userId, userId),
    isNull(timeEntry.deletedAt),
    gte(timeEntry.date, from),
    lte(timeEntry.date, to),
  ];

  if (projectId) conditions.push(eq(timeEntry.projectId, projectId));

  const rows = await db.query.timeEntry.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      date: true,
      description: true,
      duration: true,
      billable: true,
      azureWorkItemId: true,
    },
    with: {
      project: { columns: { id: true, name: true, code: true, color: true } },
      timesheet: { columns: { status: true } },
    },
    orderBy: [desc(timeEntry.date), desc(timeEntry.createdAt)],
    limit: 500,
  });

  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    description: row.description,
    duration: row.duration,
    billable: row.billable,
    azureWorkItemId: row.azureWorkItemId,
    timesheetStatus: row.timesheet?.status ?? null,
    project: row.project ?? null,
  }));
}

/** Daily target in minutes derived from the user's weekly capacity. */
function dailyTargetMinutes(weeklyCapacityHours: number): number {
  return Math.round((weeklyCapacityHours / 5) * 60);
}

function buildProjectSlices(
  entries: EntryRow[],
  totalMinutes: number,
): SummaryProjectSlice[] {
  const byProject = new Map<string, SummaryProjectSlice>();

  for (const entry of entries) {
    if (!entry.project) continue;
    const existing = byProject.get(entry.project.id);

    if (existing) {
      existing.minutes += entry.duration;
      continue;
    }

    byProject.set(entry.project.id, {
      projectId: entry.project.id,
      name: entry.project.name,
      code: entry.project.code,
      color: entry.project.color,
      minutes: entry.duration,
      percentage: 0,
    });
  }

  return [...byProject.values()]
    .map((slice) => ({
      ...slice,
      percentage:
        totalMinutes > 0 ? Math.round((slice.minutes / totalMinutes) * 100) : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

function buildDaySlices(
  entries: EntryRow[],
  from: string,
  to: string,
): SummaryDaySlice[] {
  const minutesByDate = new Map<string, number>();
  for (const entry of entries) {
    minutesByDate.set(
      entry.date,
      (minutesByDate.get(entry.date) ?? 0) + entry.duration,
    );
  }

  return eachDate(from, to).map((date) => ({
    date,
    weekday: formatWeekdayLabel(date),
    minutes: minutesByDate.get(date) ?? 0,
    isWeekend: isWeekend(date),
  }));
}

/** Projects the user is actually allowed to log time against. */
export async function listLoggableProjects(ctx: ToolContext) {
  const [memberships, accessibleIds] = await Promise.all([
    db.query.projectMember.findMany({
      where: eq(projectMember.userId, ctx.actor.userId),
      columns: { projectId: true },
    }),
    getAccessibleProjectIds(ctx.actor),
  ]);

  const memberProjectIds = new Set(memberships.map((m) => m.projectId));

  const rows = await db.query.project.findMany({
    where: eq(project.status, "active"),
    columns: { id: true, name: true, code: true, color: true },
    orderBy: (table, { asc }) => [asc(table.name)],
  });

  const allowed =
    accessibleIds === null
      ? rows
      : rows.filter(
          (row) =>
            accessibleIds.includes(row.id) || memberProjectIds.has(row.id),
        );

  return allowed.map((row) => ({
    ...row,
    isMember: memberProjectIds.has(row.id),
  }));
}

/** Fuzzy match a free-text project reference against the allowed projects. */
export function matchProject<
  T extends { id: string; name: string; code: string },
>(reference: string | undefined | null, projects: T[]): T | null {
  if (!reference) return null;
  const needle = reference.trim().toLowerCase();
  if (!needle) return null;

  const byId = projects.find((p) => p.id === reference);
  if (byId) return byId;

  const exact = projects.find(
    (p) => p.name.toLowerCase() === needle || p.code.toLowerCase() === needle,
  );
  if (exact) return exact;

  const partial = projects.find(
    (p) =>
      p.name.toLowerCase().includes(needle) ||
      p.code.toLowerCase().includes(needle) ||
      needle.includes(p.name.toLowerCase()) ||
      needle.includes(p.code.toLowerCase()),
  );

  return partial ?? null;
}

// ─── Tool: get_work_summary ──────────────────────────────────────────

const workSummaryArgsSchema = periodArgsSchema.extend({
  projectId: z.string().optional(),
});

export const getWorkSummaryTool: AgentTool<
  z.infer<typeof workSummaryArgsSchema>
> = {
  name: "get_work_summary",
  description:
    "Retorna o total de horas registradas pelo usuário em um período, com quebra por projeto e por dia, comparação com a meta de capacidade e split faturável. Use sempre que perguntarem quantas horas foram feitas, produtividade, distribuição por projeto ou comparação com a meta.",
  parameters: {
    type: "object",
    properties: {
      ...periodParameters.properties,
      projectId: {
        type: "string",
        description: "Filtra o resumo por um projeto específico (opcional).",
      },
    },
  },
  schema: workSummaryArgsSchema,
  label: (args) =>
    `Consultando suas horas (${resolvePeriodLabelSafe(args.period)})`,
  async execute(args, ctx) {
    const range = resolvePeriod(
      args.period,
      ctx.user.today,
      args.from,
      args.to,
    );
    const entries = await fetchEntries(
      ctx.user.userId,
      range.from,
      range.to,
      args.projectId,
    );

    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
    const billableMinutes = entries
      .filter((e) => e.billable)
      .reduce((sum, e) => sum + e.duration, 0);
    const projects = buildProjectSlices(entries, totalMinutes);
    const days = buildDaySlices(entries, range.from, range.to);
    const targetMinutes =
      range.businessDays * dailyTargetMinutes(ctx.user.weeklyCapacityHours);

    ctx.emitCard({
      kind: "work_summary",
      title: "Resumo de horas",
      periodLabel: range.label,
      from: range.from,
      to: range.to,
      totalMinutes,
      billableMinutes,
      targetMinutes,
      entryCount: entries.length,
      projects,
      days,
    });

    return {
      label: `Horas de ${range.label}: ${formatDuration(totalMinutes)}`,
      data: {
        period: range.label,
        from: range.from,
        to: range.to,
        totalFormatted: formatDuration(totalMinutes),
        totalMinutes,
        billableMinutes,
        nonBillableMinutes: totalMinutes - billableMinutes,
        targetMinutes,
        balanceMinutes: totalMinutes - targetMinutes,
        entryCount: entries.length,
        businessDays: range.businessDays,
        byProject: projects.slice(0, 8).map((p) => ({
          name: p.name,
          code: p.code,
          formatted: formatDuration(p.minutes),
          percentage: p.percentage,
        })),
        byDay: days
          .filter((d) => !d.isWeekend || d.minutes > 0)
          .map((d) => ({
            date: d.date,
            weekday: d.weekday,
            formatted: formatDuration(d.minutes),
          })),
      },
    };
  },
};

function resolvePeriodLabelSafe(period: PeriodKey | undefined): string {
  switch (period) {
    case "today":
      return "hoje";
    case "yesterday":
      return "ontem";
    case "last_week":
      return "semana passada";
    case "this_month":
      return "este mês";
    case "last_month":
      return "mês passado";
    case "last_7_days":
      return "últimos 7 dias";
    case "last_30_days":
      return "últimos 30 dias";
    case "custom":
      return "período personalizado";
    default:
      return "esta semana";
  }
}

// ─── Tool: list_time_entries ─────────────────────────────────────────

const listEntriesArgsSchema = periodArgsSchema.extend({
  projectId: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});

export const listTimeEntriesTool: AgentTool<
  z.infer<typeof listEntriesArgsSchema>
> = {
  name: "list_time_entries",
  description:
    "Lista os lançamentos de tempo do usuário em um período, com projeto, descrição, duração e se estão travados por timesheet submetido. Use quando pedirem para ver, revisar, conferir ou auditar os lançamentos.",
  parameters: {
    type: "object",
    properties: {
      ...periodParameters.properties,
      projectId: { type: "string", description: "Filtra por projeto." },
      limit: {
        type: "integer",
        description: "Máximo de lançamentos retornados (padrão 15).",
      },
    },
  },
  schema: listEntriesArgsSchema,
  label: () => "Buscando seus lançamentos",
  async execute(args, ctx) {
    const range = resolvePeriod(
      args.period,
      ctx.user.today,
      args.from,
      args.to,
    );
    const limit = args.limit ?? 15;
    const entries = (
      await fetchEntries(ctx.user.userId, range.from, range.to, args.projectId)
    ).slice(0, limit);

    ctx.emitCard({
      kind: "entries_list",
      title: `Lançamentos — ${range.label}`,
      entries: entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        description: entry.description,
        minutes: entry.duration,
        projectName: entry.project?.name ?? "Projeto removido",
        projectColor: entry.project?.color ?? "#737373",
        billable: entry.billable,
        azureWorkItemId: entry.azureWorkItemId,
        locked:
          entry.timesheetStatus === "submitted" ||
          entry.timesheetStatus === "approved",
      })),
    });

    return {
      label: `${entries.length} lançamento(s) em ${range.label}`,
      data: {
        period: range.label,
        count: entries.length,
        entries: entries.map((entry) => ({
          date: entry.date,
          project: entry.project?.name ?? null,
          description: entry.description,
          duration: formatDuration(entry.duration),
          billable: entry.billable,
          workItem: entry.azureWorkItemId,
          locked:
            entry.timesheetStatus === "submitted" ||
            entry.timesheetStatus === "approved",
        })),
      },
    };
  },
};

// ─── Tool: get_timesheet_status ──────────────────────────────────────

const timesheetArgsSchema = z.object({
  period: z.enum(["this_week", "last_week"]).optional(),
});

export const getTimesheetStatusTool: AgentTool<
  z.infer<typeof timesheetArgsSchema>
> = {
  name: "get_timesheet_status",
  description:
    "Retorna a situação do timesheet semanal do usuário: status (aberto, submetido, aprovado, rejeitado), total de horas, dias incompletos abaixo da meta, motivo de rejeição e se já pode ser submetido. Use para dúvidas sobre submissão, aprovação, pendências ou 'posso enviar minha semana?'.",
  parameters: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["this_week", "last_week"],
        description: "Semana consultada. Padrão: this_week.",
      },
    },
  },
  schema: timesheetArgsSchema,
  label: (args) =>
    args.period === "last_week"
      ? "Verificando o timesheet da semana passada"
      : "Verificando seu timesheet da semana",
  async execute(args, ctx) {
    const range = resolvePeriod(args.period ?? "this_week", ctx.user.today);
    const period = getWeekPeriod(range.from);

    const [sheet, entries] = await Promise.all([
      db.query.timesheet.findFirst({
        where: and(
          eq(timesheet.userId, ctx.user.userId),
          eq(timesheet.period, period),
        ),
        columns: { status: true, rejectionReason: true },
      }),
      fetchEntries(ctx.user.userId, range.from, range.to),
    ]);

    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);
    const status = (sheet?.status ?? "open") as
      | "open"
      | "submitted"
      | "approved"
      | "rejected";
    const target = dailyTargetMinutes(ctx.user.weeklyCapacityHours);
    const days = buildDaySlices(entries, range.from, range.to);

    const incompleteDays = days
      .filter(
        (day) =>
          !day.isWeekend && day.date <= ctx.user.today && day.minutes < target,
      )
      .map((day) => ({
        date: day.date,
        weekday: day.weekday,
        minutes: day.minutes,
      }));

    const canSubmit =
      (status === "open" || status === "rejected") && entries.length > 0;

    ctx.emitCard({
      kind: "timesheet_status",
      period,
      periodLabel: `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`,
      status,
      totalMinutes,
      targetMinutes: ctx.user.weeklyCapacityHours * 60,
      from: range.from,
      to: range.to,
      rejectionReason: sheet?.rejectionReason ?? null,
      incompleteDays,
      canSubmit,
    });

    return {
      label: `Timesheet ${period}: ${status}`,
      data: {
        period,
        status,
        totalFormatted: formatDuration(totalMinutes),
        targetFormatted: formatDuration(ctx.user.weeklyCapacityHours * 60),
        entryCount: entries.length,
        canSubmit,
        rejectionReason: sheet?.rejectionReason ?? null,
        incompleteDays: incompleteDays.map((day) => ({
          date: day.date,
          weekday: day.weekday,
          registered: formatDuration(day.minutes),
        })),
      },
    };
  },
};

// ─── Tool: list_projects ─────────────────────────────────────────────

const listProjectsArgsSchema = z.object({
  query: z.string().optional(),
});

export const listProjectsTool: AgentTool<
  z.infer<typeof listProjectsArgsSchema>
> = {
  name: "list_projects",
  description:
    "Lista os projetos ativos em que o usuário pode lançar horas, com código, cor e horas dedicadas nos últimos 30 dias. Use antes de propor um lançamento quando o projeto estiver ambíguo.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Filtro por nome ou código do projeto.",
      },
    },
  },
  schema: listProjectsArgsSchema,
  label: () => "Listando seus projetos",
  async execute(args, ctx) {
    const projects = await listLoggableProjects(ctx);
    const range = resolvePeriod("last_30_days", ctx.user.today);
    const entries = await fetchEntries(ctx.user.userId, range.from, range.to);

    const minutesByProject = new Map<string, number>();
    for (const entry of entries) {
      if (!entry.project) continue;
      minutesByProject.set(
        entry.project.id,
        (minutesByProject.get(entry.project.id) ?? 0) + entry.duration,
      );
    }

    const needle = args.query?.trim().toLowerCase();
    const filtered = needle
      ? projects.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) ||
            p.code.toLowerCase().includes(needle),
        )
      : projects;

    const enriched = filtered
      .map((p) => ({
        ...p,
        minutesLast30Days: minutesByProject.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.minutesLast30Days - a.minutesLast30Days)
      .slice(0, 25);

    ctx.emitCard({ kind: "projects", projects: enriched });

    return {
      label: `${enriched.length} projeto(s) disponível(is)`,
      data: {
        count: enriched.length,
        projects: enriched.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          isMember: p.isMember,
          last30Days: formatDuration(p.minutesLast30Days),
        })),
      },
    };
  },
};

// ─── Tool: get_active_timer ──────────────────────────────────────────

export const getActiveTimerTool: AgentTool<EmptyArgs> = {
  name: "get_active_timer",
  description:
    "Retorna o timer em execução do usuário (projeto, descrição, tempo decorrido e se está pausado). Use quando perguntarem sobre o cronômetro atual.",
  parameters: { type: "object", properties: {} },
  schema: emptyArgsSchema,
  label: () => "Verificando seu timer ativo",
  async execute(_args, ctx) {
    const timer = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, ctx.user.userId),
      with: {
        project: { columns: { id: true, name: true, color: true } },
      },
    });

    if (!timer) {
      ctx.emitCard({
        kind: "timer",
        running: false,
        projectName: null,
        projectColor: null,
        description: null,
        elapsedMinutes: 0,
        paused: false,
      });

      return { label: "Nenhum timer ativo", data: { running: false } };
    }

    const elapsedMs = timer.pausedAt
      ? timer.accumulatedMs
      : timer.accumulatedMs + (Date.now() - timer.startedAt.getTime());
    const elapsedMinutes = Math.floor(elapsedMs / 60_000);

    ctx.emitCard({
      kind: "timer",
      running: true,
      projectName: timer.project?.name ?? null,
      projectColor: timer.project?.color ?? null,
      description: timer.description || null,
      elapsedMinutes,
      paused: Boolean(timer.pausedAt),
    });

    return {
      label: `Timer ativo — ${formatDuration(elapsedMinutes)}`,
      data: {
        running: true,
        paused: Boolean(timer.pausedAt),
        project: timer.project?.name ?? null,
        description: timer.description,
        elapsed: formatDuration(elapsedMinutes),
      },
    };
  },
};

// ─── Tool: get_pending_approvals (manager/admin) ─────────────────────

export const getPendingApprovalsTool: AgentTool<EmptyArgs> = {
  name: "get_pending_approvals",
  description:
    "Lista os timesheets submetidos aguardando aprovação dentro do escopo do gestor. Use para 'o que preciso aprovar?' ou 'tenho pendências da equipe?'.",
  parameters: { type: "object", properties: {} },
  schema: emptyArgsSchema,
  roles: ["manager", "admin"],
  label: () => "Buscando aprovações pendentes",
  async execute(_args, ctx) {
    const scopedIds = await resolveScopedUserIds(ctx);

    const conditions = [eq(timesheet.status, "submitted")];
    if (scopedIds !== null) {
      if (scopedIds.length === 0) {
        ctx.emitCard({ kind: "approvals", items: [] });
        return { label: "Nenhuma aprovação pendente", data: { count: 0 } };
      }
      conditions.push(inArray(timesheet.userId, scopedIds));
    }

    const pending = await db.query.timesheet.findMany({
      where: and(...conditions),
      columns: {
        id: true,
        period: true,
        totalMinutes: true,
        submittedAt: true,
      },
      with: { user: { columns: { name: true } } },
      orderBy: (table, { asc }) => [asc(table.submittedAt)],
      limit: 25,
    });

    const items = pending.map((sheet) => ({
      id: sheet.id,
      userName: sheet.user?.name ?? "Colaborador",
      period: sheet.period,
      totalMinutes: sheet.totalMinutes,
      submittedAt: sheet.submittedAt?.toISOString() ?? null,
    }));

    ctx.emitCard({ kind: "approvals", items });

    return {
      label: `${items.length} timesheet(s) aguardando aprovação`,
      data: {
        count: items.length,
        items: items.map((item) => ({
          user: item.userName,
          period: item.period,
          total: formatDuration(item.totalMinutes),
        })),
      },
    };
  },
};

/** null = every user (admin), otherwise the manager's scope. */
export async function resolveScopedUserIds(
  ctx: ToolContext,
): Promise<string[] | null> {
  if (ctx.actor.role === "admin") return null;

  const [directReports, managedProjectIds] = await Promise.all([
    getDirectReportIds(ctx.actor.userId),
    getManagedProjectIds(ctx.actor),
  ]);

  const ids = new Set(directReports);

  if (managedProjectIds && managedProjectIds.length > 0) {
    const members = await db.query.projectMember.findMany({
      where: inArray(projectMember.projectId, managedProjectIds),
      columns: { userId: true },
    });
    for (const member of members) ids.add(member.userId);
  }

  return [...ids];
}

// ─── Tool: get_team_overview (manager/admin) ─────────────────────────

export const getTeamOverviewTool: AgentTool<PeriodArgs> = {
  name: "get_team_overview",
  description:
    "Retorna as horas registradas por cada pessoa da equipe do gestor em um período, com meta individual e status do timesheet. Use para acompanhar carga de trabalho, quem está atrasado ou visão consolidada da equipe.",
  parameters: periodParameters,
  schema: periodArgsSchema,
  roles: ["manager", "admin"],
  label: () => "Consultando as horas da equipe",
  async execute(args, ctx) {
    const range = resolvePeriod(
      args.period,
      ctx.user.today,
      args.from,
      args.to,
    );
    const scopedIds = await resolveScopedUserIds(ctx);

    const members = await db.query.user.findMany({
      where:
        scopedIds === null
          ? eq(user.isActive, true)
          : scopedIds.length > 0
            ? and(eq(user.isActive, true), inArray(user.id, scopedIds))
            : eq(user.id, "__none__"),
      columns: { id: true, name: true, weeklyCapacity: true },
      limit: 60,
    });

    if (members.length === 0) {
      ctx.emitCard({
        kind: "team_overview",
        periodLabel: range.label,
        from: range.from,
        to: range.to,
        members: [],
      });
      return { label: "Nenhum colaborador no escopo", data: { count: 0 } };
    }

    const memberIds = members.map((m) => m.id);
    const period = getWeekPeriod(range.from);

    const [entries, sheets] = await Promise.all([
      db
        .select({
          userId: timeEntry.userId,
          duration: timeEntry.duration,
        })
        .from(timeEntry)
        .where(
          and(
            inArray(timeEntry.userId, memberIds),
            gte(timeEntry.date, range.from),
            lte(timeEntry.date, range.to),
            isNull(timeEntry.deletedAt),
          ),
        ),
      db.query.timesheet.findMany({
        where: and(
          inArray(timesheet.userId, memberIds),
          eq(timesheet.period, period),
        ),
        columns: { userId: true, status: true },
      }),
    ]);

    const minutesByUser = new Map<string, number>();
    for (const entry of entries) {
      minutesByUser.set(
        entry.userId,
        (minutesByUser.get(entry.userId) ?? 0) + entry.duration,
      );
    }

    const statusByUser = new Map(sheets.map((s) => [s.userId, s.status]));

    const rows = members
      .map((member) => ({
        userId: member.id,
        name: member.name,
        minutes: minutesByUser.get(member.id) ?? 0,
        targetMinutes:
          range.businessDays * dailyTargetMinutes(member.weeklyCapacity ?? 40),
        timesheetStatus: statusByUser.get(member.id) ?? "open",
      }))
      .sort((a, b) => b.minutes - a.minutes);

    ctx.emitCard({
      kind: "team_overview",
      periodLabel: range.label,
      from: range.from,
      to: range.to,
      members: rows,
    });

    return {
      label: `Equipe — ${rows.length} pessoa(s) em ${range.label}`,
      data: {
        period: range.label,
        members: rows.map((row) => ({
          name: row.name,
          registered: formatDuration(row.minutes),
          target: formatDuration(row.targetMinutes),
          timesheet: row.timesheetStatus,
        })),
      },
    };
  },
};

// ─── Tool: search_work_items ─────────────────────────────────────────

const searchWorkItemsArgsSchema = z.object({
  query: z.string().min(1),
  projectId: z.string().optional(),
});

export const searchWorkItemsTool: AgentTool<
  z.infer<typeof searchWorkItemsArgsSchema>
> = {
  name: "search_work_items",
  description:
    "Busca work items no Azure DevOps por ID (#123) ou por título. Use quando o usuário mencionar uma task/bug/story e quiser vincular horas a ela.",
  parameters: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "ID numérico ou parte do título do work item.",
      },
      projectId: {
        type: "string",
        description:
          "Projeto do Time Tracker usado para localizar o work item.",
      },
    },
    required: ["query"],
  },
  schema: searchWorkItemsArgsSchema,
  label: (args) => `Buscando work items "${args.query}"`,
  async execute(args, ctx) {
    const config = await findAzureDevopsConfigByUserId(ctx.user.userId);
    if (!config) {
      return {
        label: "Integração Azure DevOps não configurada",
        data: {
          error:
            "Integração com Azure DevOps não configurada. O usuário precisa configurá-la em Configurações > Integrações.",
        },
      };
    }

    const projects = await listLoggableProjects(ctx);
    const target = matchProject(args.projectId, projects) ?? projects[0];

    if (!target) {
      return {
        label: "Nenhum projeto disponível",
        data: { error: "Usuário não possui projetos ativos." },
      };
    }

    const projectRow = await db.query.project.findFirst({
      where: eq(project.id, target.id),
      columns: { name: true, azureProjectId: true },
    });

    const projectRef =
      projectRow?.azureProjectId || projectRow?.name || target.name;

    try {
      const pat = decrypt(config.pat);
      if (!pat) {
        return {
          label: "PAT inválido",
          data: { error: "Token do Azure DevOps inválido ou expirado." },
        };
      }

      const client = createAzureDevOpsClient(config.organizationUrl, pat);
      const items = await client.searchWorkItems(projectRef, args.query, 8);

      const mapped = items.map((item) => ({
        id: item.id,
        title: item.title,
        type: String(item.type),
        state: String(item.state),
        url: `${config.organizationUrl.replace(/\/$/, "")}/_workitems/edit/${item.id}`,
      }));

      ctx.emitCard({ kind: "work_items", query: args.query, items: mapped });

      return {
        label: `${mapped.length} work item(s) encontrado(s)`,
        data: {
          count: mapped.length,
          items: mapped.map((item) => ({
            id: item.id,
            title: item.title,
            type: item.type,
            state: item.state,
          })),
        },
      };
    } catch (error: unknown) {
      console.error("[TimeBot search_work_items]:", error);
      return {
        label: "Falha ao consultar o Azure DevOps",
        data: {
          error:
            error instanceof AzureDevOpsError
              ? error.message
              : "Não foi possível consultar o Azure DevOps agora.",
        },
      };
    }
  },
};

export const READ_TOOLS = [
  getWorkSummaryTool,
  listTimeEntriesTool,
  getTimesheetStatusTool,
  listProjectsTool,
  getActiveTimerTool,
  getPendingApprovalsTool,
  getTeamOverviewTool,
  searchWorkItemsTool,
];
