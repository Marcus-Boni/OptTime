/**
 * AI Operator — action tools beyond the basic time-entry flow.
 *
 * Every tool here follows the same contract as the rest of the registry: it
 * validates and resolves everything server-side, then emits a confirmation
 * action. Nothing in this file writes to the database.
 */

import { and, desc, eq, gte, ilike, inArray, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { canManageProject, getDirectReportIds } from "@/lib/access-control";
import { resolveDurationMinutes } from "@/lib/ai/duration";
import {
  formatDayLabel,
  PERIOD_KEYS,
  type PeriodKey,
  resolvePeriod,
} from "@/lib/ai/periods";
import type {
  NotifyAudience,
  ReportFormat,
  ReportKind,
  ReportScope,
} from "@/lib/ai/types";
import { db } from "@/lib/db";
import {
  activeTimer,
  project,
  projectMember,
  timeEntry,
  timesheet,
  user,
} from "@/lib/db/schema";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { getTimesheetStatusLabel } from "@/lib/timesheet-status";
import { formatDuration, formatLocalDate, parseLocalDate } from "@/lib/utils";
import {
  listLoggableProjects,
  matchProject,
  resolveScopedUserIds,
} from "./read-tools";
import type { AgentTool, ToolContext } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts YYYY-MM-DD or the relative keywords the model likes to emit. */
function resolveDate(raw: string | undefined, today: string): string {
  if (!raw) return today;
  const value = raw.trim().toLowerCase();

  if (DATE_PATTERN.test(value)) return value;
  if (value === "hoje" || value === "today") return today;
  if (value === "ontem" || value === "yesterday") {
    return formatLocalDate(
      new Date(parseLocalDate(today).getTime() - 86_400_000),
    );
  }
  if (value === "anteontem") {
    return formatLocalDate(
      new Date(parseLocalDate(today).getTime() - 2 * 86_400_000),
    );
  }

  return today;
}

interface EntryCandidate {
  id: string;
  date: string;
  description: string;
  duration: number;
  billable: boolean;
  projectName: string | null;
  projectColor: string | null;
}

/**
 * Finds the entry the user is talking about. The model never sees internal ids,
 * so entries are addressed the way people describe them: a day, maybe a
 * project, maybe a few words from the description.
 */
async function findEntryCandidates(
  ctx: ToolContext,
  args: { date?: string; project?: string; match?: string },
): Promise<{ date: string; candidates: EntryCandidate[] }> {
  const date = resolveDate(args.date, ctx.user.today);
  const projects = await listLoggableProjects(ctx);
  const matched = matchProject(args.project, projects);

  const conditions = [
    eq(timeEntry.userId, ctx.user.userId),
    eq(timeEntry.date, date),
    isNull(timeEntry.deletedAt),
  ];

  if (matched) {
    conditions.push(eq(timeEntry.projectId, matched.id));
  }

  if (args.match?.trim()) {
    conditions.push(ilike(timeEntry.description, `%${args.match.trim()}%`));
  }

  const rows = await db.query.timeEntry.findMany({
    where: and(...conditions),
    columns: {
      id: true,
      date: true,
      description: true,
      duration: true,
      billable: true,
    },
    with: { project: { columns: { name: true, color: true } } },
    orderBy: [desc(timeEntry.createdAt)],
    limit: 10,
  });

  return {
    date,
    candidates: rows.map((row) => ({
      id: row.id,
      date: row.date,
      description: row.description,
      duration: row.duration,
      billable: row.billable,
      projectName: row.project?.name ?? null,
      projectColor: row.project?.color ?? null,
    })),
  };
}

/** Compact list handed back to the model when the reference is ambiguous. */
function toAmbiguityPayload(candidates: EntryCandidate[]) {
  return candidates.map((item) => ({
    project: item.projectName,
    description: item.description,
    duration: formatDuration(item.duration),
  }));
}

async function lockWarning(
  ctx: ToolContext,
  date: string,
): Promise<string | null> {
  const lock = await getWeeklyTimesheetStatusForDate(ctx.user.userId, date);
  if (lock.locked && lock.status) {
    return `A semana de ${formatDayLabel(date)} já foi ${getTimesheetStatusLabel(lock.status)} — não é possível editar.`;
  }
  return null;
}

// ─── Tool: prepare_time_entry_update ─────────────────────────────────

const updateEntryArgsSchema = z.object({
  date: z.string().optional(),
  project: z.string().optional(),
  match: z.string().optional(),
  newDurationMinutes: z.number().int().positive().optional(),
  newDurationText: z.string().optional(),
  newDescription: z.string().optional(),
  billable: z.boolean().optional(),
});

export const prepareTimeEntryUpdateTool: AgentTool<
  z.infer<typeof updateEntryArgsSchema>
> = {
  name: "prepare_time_entry_update",
  description:
    "Prepara a edição de um lançamento já existente (duração, descrição ou faturamento), exibindo um cartão antes/depois para confirmação. Identifique o lançamento pela data e, se precisar, pelo projeto ou por palavras da descrição. NÃO grava nada sozinho.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Data do lançamento (YYYY-MM-DD, 'hoje' ou 'ontem').",
      },
      project: { type: "string", description: "Projeto do lançamento." },
      match: {
        type: "string",
        description: "Trecho da descrição para localizar o lançamento.",
      },
      newDurationMinutes: {
        type: "integer",
        description: "Nova duração total em minutos.",
      },
      newDurationText: {
        type: "string",
        description: "Nova duração como o usuário escreveu, ex.: '3h30'.",
      },
      newDescription: { type: "string", description: "Nova descrição." },
      billable: { type: "boolean", description: "Novo valor de faturável." },
    },
  },
  schema: updateEntryArgsSchema,
  actionKind: "update_time_entry",
  label: () => "Localizando o lançamento",
  async execute(args, ctx) {
    const { date, candidates } = await findEntryCandidates(ctx, args);

    if (candidates.length === 0) {
      return {
        label: "Nenhum lançamento encontrado",
        data: {
          status: "not_found",
          date,
          note: `Não encontrei lançamento em ${formatDayLabel(date)} com esses critérios. Peça mais detalhes ao usuário.`,
        },
      };
    }

    if (candidates.length > 1) {
      return {
        label: `${candidates.length} lançamentos possíveis`,
        data: {
          status: "ambiguous",
          date,
          candidates: toAmbiguityPayload(candidates),
          note: "Mais de um lançamento corresponde. Pergunte ao usuário qual deles, citando projeto e duração.",
        },
      };
    }

    const entry = candidates[0];
    if (!entry) {
      return {
        label: "Nenhum lançamento encontrado",
        data: { status: "not_found", date },
      };
    }

    const nextDuration = resolveDurationMinutes(
      args.newDurationMinutes,
      args.newDurationText,
      entry.duration,
    );
    const nextDescription = args.newDescription?.trim() || entry.description;
    const nextBillable = args.billable ?? entry.billable;

    const unchanged =
      nextDuration === entry.duration &&
      nextDescription === entry.description &&
      nextBillable === entry.billable;

    if (unchanged) {
      return {
        label: "Nada a alterar",
        data: {
          status: "no_changes",
          note: "Os novos valores são iguais aos atuais. Pergunte o que deve mudar.",
        },
      };
    }

    ctx.emitAction({
      kind: "update_time_entry",
      entryId: entry.id,
      projectName: entry.projectName,
      projectColor: entry.projectColor,
      date: entry.date,
      current: {
        description: entry.description,
        durationMinutes: entry.duration,
        billable: entry.billable,
      },
      next: {
        description: nextDescription,
        durationMinutes: nextDuration,
        billable: nextBillable,
      },
      warning: await lockWarning(ctx, entry.date),
    });

    return {
      label: `Edição preparada — ${formatDuration(nextDuration)}`,
      data: {
        status: "awaiting_confirmation",
        from: formatDuration(entry.duration),
        to: formatDuration(nextDuration),
        note: "Cartão de confirmação exibido. Não afirme que a edição foi salva.",
      },
    };
  },
};

// ─── Tool: prepare_time_entry_delete ─────────────────────────────────

const deleteEntryArgsSchema = z.object({
  date: z.string().optional(),
  project: z.string().optional(),
  match: z.string().optional(),
});

export const prepareTimeEntryDeleteTool: AgentTool<
  z.infer<typeof deleteEntryArgsSchema>
> = {
  name: "prepare_time_entry_delete",
  description:
    "Prepara a exclusão de um lançamento, exibindo um cartão de confirmação. Identifique o lançamento pela data e, se precisar, pelo projeto ou por palavras da descrição. NÃO exclui nada sozinho.",
  parameters: {
    type: "object",
    properties: {
      date: {
        type: "string",
        description: "Data do lançamento (YYYY-MM-DD, 'hoje' ou 'ontem').",
      },
      project: { type: "string", description: "Projeto do lançamento." },
      match: {
        type: "string",
        description: "Trecho da descrição para localizar o lançamento.",
      },
    },
  },
  schema: deleteEntryArgsSchema,
  actionKind: "delete_time_entry",
  label: () => "Localizando o lançamento",
  async execute(args, ctx) {
    const { date, candidates } = await findEntryCandidates(ctx, args);

    if (candidates.length === 0) {
      return {
        label: "Nenhum lançamento encontrado",
        data: {
          status: "not_found",
          date,
          note: `Não encontrei lançamento em ${formatDayLabel(date)} com esses critérios.`,
        },
      };
    }

    if (candidates.length > 1) {
      return {
        label: `${candidates.length} lançamentos possíveis`,
        data: {
          status: "ambiguous",
          date,
          candidates: toAmbiguityPayload(candidates),
          note: "Mais de um lançamento corresponde. Confirme com o usuário qual excluir antes de preparar a ação.",
        },
      };
    }

    const entry = candidates[0];
    if (!entry) {
      return {
        label: "Nenhum lançamento encontrado",
        data: { status: "not_found", date },
      };
    }

    ctx.emitAction({
      kind: "delete_time_entry",
      entryId: entry.id,
      projectName: entry.projectName,
      projectColor: entry.projectColor,
      description: entry.description,
      date: entry.date,
      durationMinutes: entry.duration,
      warning: await lockWarning(ctx, entry.date),
    });

    return {
      label: `Exclusão preparada — ${formatDuration(entry.duration)}`,
      data: {
        status: "awaiting_confirmation",
        entry: {
          project: entry.projectName,
          description: entry.description,
          duration: formatDuration(entry.duration),
        },
        note: "Cartão de confirmação exibido. Não afirme que o lançamento foi excluído.",
      },
    };
  },
};

// ─── Tools: prepare_timer_pause / prepare_timer_resume ───────────────

const emptyArgsSchema = z.object({});
type EmptyArgs = z.infer<typeof emptyArgsSchema>;

async function loadRunningTimer(ctx: ToolContext) {
  return db.query.activeTimer.findFirst({
    where: eq(activeTimer.userId, ctx.user.userId),
    with: { project: { columns: { name: true } } },
  });
}

function elapsedMinutesOf(timer: {
  accumulatedMs: number;
  startedAt: Date;
  pausedAt: Date | null;
}): number {
  const elapsedMs = timer.pausedAt
    ? timer.accumulatedMs
    : timer.accumulatedMs + (Date.now() - timer.startedAt.getTime());
  return Math.max(0, Math.floor(elapsedMs / 60_000));
}

export const prepareTimerPauseTool: AgentTool<EmptyArgs> = {
  name: "prepare_timer_pause",
  description:
    "Prepara a pausa do cronômetro em execução, exibindo um cartão de confirmação. Use quando a pessoa disser que vai parar por um momento (reunião, almoço) sem encerrar a atividade.",
  parameters: { type: "object", properties: {} },
  schema: emptyArgsSchema,
  actionKind: "pause_timer",
  label: () => "Preparando a pausa",
  async execute(_args, ctx) {
    const timer = await loadRunningTimer(ctx);

    if (!timer) {
      return {
        label: "Nenhum timer ativo",
        data: { status: "no_timer", note: "Não há cronômetro em execução." },
      };
    }

    if (timer.pausedAt) {
      return {
        label: "Cronômetro já pausado",
        data: {
          status: "already_paused",
          note: "O cronômetro já está pausado.",
        },
      };
    }

    ctx.emitAction({
      kind: "pause_timer",
      projectName: timer.project?.name ?? null,
      description: timer.description || null,
      elapsedMinutes: elapsedMinutesOf(timer),
    });

    return {
      label: "Pausa preparada",
      data: {
        status: "awaiting_confirmation",
        note: "Cartão de confirmação exibido.",
      },
    };
  },
};

export const prepareTimerResumeTool: AgentTool<EmptyArgs> = {
  name: "prepare_timer_resume",
  description:
    "Prepara a retomada de um cronômetro pausado, exibindo um cartão de confirmação. Use quando a pessoa disser que voltou ao trabalho.",
  parameters: { type: "object", properties: {} },
  schema: emptyArgsSchema,
  actionKind: "resume_timer",
  label: () => "Preparando a retomada",
  async execute(_args, ctx) {
    const timer = await loadRunningTimer(ctx);

    if (!timer) {
      return {
        label: "Nenhum timer para retomar",
        data: {
          status: "no_timer",
          note: "Não há cronômetro pausado. Ofereça iniciar um novo.",
        },
      };
    }

    if (!timer.pausedAt) {
      return {
        label: "Cronômetro já em execução",
        data: {
          status: "already_running",
          note: "O cronômetro já está rodando.",
        },
      };
    }

    ctx.emitAction({
      kind: "resume_timer",
      projectName: timer.project?.name ?? null,
      description: timer.description || null,
      elapsedMinutes: elapsedMinutesOf(timer),
    });

    return {
      label: "Retomada preparada",
      data: {
        status: "awaiting_confirmation",
        note: "Cartão de confirmação exibido.",
      },
    };
  },
};

// ─── Tool: prepare_timesheet_review (manager/admin) ──────────────────

const reviewArgsSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  collaborator: z.string().min(1),
  period: z.string().optional(),
  reason: z.string().optional(),
});

export const prepareTimesheetReviewTool: AgentTool<
  z.infer<typeof reviewArgsSchema>
> = {
  name: "prepare_timesheet_review",
  description:
    "Prepara a aprovação ou rejeição do timesheet submetido por um colaborador da sua equipe, exibindo um cartão de confirmação. Rejeições exigem um motivo com pelo menos 10 caracteres. NÃO decide nada sozinho.",
  parameters: {
    type: "object",
    properties: {
      decision: {
        type: "string",
        enum: ["approve", "reject"],
        description: "Aprovar ou rejeitar.",
      },
      collaborator: {
        type: "string",
        description: "Nome ou e-mail do colaborador.",
      },
      period: {
        type: "string",
        description:
          "Período no formato YYYY-Www (ex.: 2026-W33). Padrão: o mais antigo pendente.",
      },
      reason: {
        type: "string",
        description: "Motivo da rejeição (obrigatório para rejeitar).",
      },
    },
    required: ["decision", "collaborator"],
  },
  schema: reviewArgsSchema,
  roles: ["manager", "admin"],
  actionKind: "approve_timesheet",
  label: (args) =>
    args.decision === "approve"
      ? "Preparando a aprovação"
      : "Preparando a rejeição",
  async execute(args, ctx) {
    const scopedIds = await resolveScopedUserIds(ctx);

    if (scopedIds !== null && scopedIds.length === 0) {
      return {
        label: "Sem equipe no escopo",
        data: {
          status: "forbidden",
          note: "Você não tem colaboradores no seu escopo de aprovação.",
        },
      };
    }

    const needle = args.collaborator.trim().toLowerCase();
    const userConditions = [eq(user.isActive, true)];
    if (scopedIds !== null) {
      userConditions.push(inArray(user.id, scopedIds));
    }

    const scopedUsers = await db.query.user.findMany({
      where: and(...userConditions),
      columns: { id: true, name: true, email: true },
    });

    const target =
      scopedUsers.find((item) => item.name.toLowerCase() === needle) ??
      scopedUsers.find((item) => item.email.toLowerCase() === needle) ??
      scopedUsers.find((item) => item.name.toLowerCase().includes(needle));

    if (!target) {
      return {
        label: "Colaborador não encontrado",
        data: {
          status: "not_found",
          note: `Não encontrei "${args.collaborator}" na sua equipe.`,
          available: scopedUsers.slice(0, 12).map((item) => item.name),
        },
      };
    }

    if (target.id === ctx.actor.userId && ctx.actor.role !== "admin") {
      return {
        label: "Aprovação própria bloqueada",
        data: {
          status: "forbidden",
          note: "Gestores não podem aprovar o próprio timesheet — isso exige um gestor acima.",
        },
      };
    }

    const sheetConditions = [
      eq(timesheet.userId, target.id),
      eq(timesheet.status, "submitted"),
    ];
    if (args.period?.trim()) {
      sheetConditions.push(eq(timesheet.period, args.period.trim()));
    }

    const sheet = await db.query.timesheet.findFirst({
      where: and(...sheetConditions),
      columns: { id: true, period: true, totalMinutes: true },
      orderBy: [timesheet.period],
    });

    if (!sheet) {
      return {
        label: "Nenhum timesheet pendente",
        data: {
          status: "not_found",
          note: `${target.name} não tem timesheet aguardando aprovação${args.period ? ` no período ${args.period}` : ""}.`,
        },
      };
    }

    if (args.decision === "reject") {
      const reason = args.reason?.trim() ?? "";

      if (reason.length < 10) {
        return {
          label: "Motivo obrigatório",
          data: {
            status: "missing_reason",
            note: "Para rejeitar é preciso um motivo com pelo menos 10 caracteres. Pergunte o motivo ao usuário.",
          },
        };
      }

      ctx.emitAction({
        kind: "reject_timesheet",
        timesheetId: sheet.id,
        userName: target.name,
        period: sheet.period,
        periodLabel: sheet.period,
        totalMinutes: sheet.totalMinutes,
        reason,
        warning: null,
      });

      return {
        label: `Rejeição preparada — ${target.name}`,
        data: {
          status: "awaiting_confirmation",
          collaborator: target.name,
          period: sheet.period,
          note: "Cartão de confirmação exibido. Não afirme que o timesheet foi rejeitado.",
        },
      };
    }

    ctx.emitAction({
      kind: "approve_timesheet",
      timesheetId: sheet.id,
      userName: target.name,
      period: sheet.period,
      periodLabel: sheet.period,
      totalMinutes: sheet.totalMinutes,
      warning: null,
    });

    return {
      label: `Aprovação preparada — ${target.name}`,
      data: {
        status: "awaiting_confirmation",
        collaborator: target.name,
        period: sheet.period,
        total: formatDuration(sheet.totalMinutes),
        note: "Cartão de confirmação exibido. Não afirme que o timesheet foi aprovado.",
      },
    };
  },
};

// ─── Tool: prepare_report_export ─────────────────────────────────────

const reportArgsSchema = z.object({
  format: z.enum(["pdf", "xlsx"]).optional(),
  reportKind: z.enum(["summary", "detailed"]).optional(),
  scope: z.enum(["me", "project", "team"]).optional(),
  project: z.string().optional(),
  period: z.enum(PERIOD_KEYS as [PeriodKey, ...PeriodKey[]]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export const prepareReportExportTool: AgentTool<
  z.infer<typeof reportArgsSchema>
> = {
  name: "prepare_report_export",
  description:
    "Prepara a geração de um relatório de horas em PDF ou Excel e exibe um cartão com o botão de download. Use para pedidos como 'gere um relatório PDF do projeto X do mês passado'. O arquivo só é gerado quando o usuário confirmar.",
  parameters: {
    type: "object",
    properties: {
      format: {
        type: "string",
        enum: ["pdf", "xlsx"],
        description: "Formato do arquivo. Padrão: pdf.",
      },
      reportKind: {
        type: "string",
        enum: ["summary", "detailed"],
        description:
          "'summary' agrupa por projeto; 'detailed' lista cada lançamento. Padrão: detailed quando há projeto, summary caso contrário.",
      },
      scope: {
        type: "string",
        enum: ["me", "project", "team"],
        description:
          "'me' = só suas horas; 'project' = tudo do projeto; 'team' = equipe (gestores). Padrão: me.",
      },
      project: {
        type: "string",
        description: "Nome ou código do projeto a filtrar.",
      },
      period: {
        type: "string",
        enum: PERIOD_KEYS,
        description: "Período do relatório. Padrão: this_month.",
      },
      from: { type: "string", description: "Início (YYYY-MM-DD) se custom." },
      to: { type: "string", description: "Fim (YYYY-MM-DD) se custom." },
    },
  },
  schema: reportArgsSchema,
  actionKind: "export_report",
  label: () => "Preparando o relatório",
  async execute(args, ctx) {
    const range = resolvePeriod(
      args.period ?? "this_month",
      ctx.user.today,
      args.from,
      args.to,
    );

    const projects = await listLoggableProjects(ctx);
    const matched = matchProject(args.project, projects);

    if (args.project && !matched) {
      return {
        label: "Projeto não encontrado",
        data: {
          status: "project_not_found",
          note: `Não encontrei o projeto "${args.project}". Ofereça as opções disponíveis.`,
          available: projects.slice(0, 12).map((item) => item.name),
        },
      };
    }

    let scope: ReportScope = args.scope ?? (matched ? "project" : "me");
    let warning: string | null = null;

    if (scope === "team" && ctx.actor.role === "member") {
      scope = "me";
      warning =
        "Você não tem permissão para relatórios da equipe — gerando apenas com as suas horas.";
    }

    if (scope === "project" && matched) {
      const allowed =
        ctx.actor.role === "admin" ||
        (await canManageProject(ctx.actor, matched.id));

      if (!allowed) {
        scope = "me";
        warning =
          "Você não gerencia esse projeto — o relatório traz apenas as suas horas nele.";
      }
    }

    // Preview only: mirrors the scoping the export route applies for real.
    const conditions = [
      gte(timeEntry.date, range.from),
      lte(timeEntry.date, range.to),
      isNull(timeEntry.deletedAt),
    ];

    if (matched) {
      conditions.push(eq(timeEntry.projectId, matched.id));
    }

    if (scope === "me") {
      conditions.push(eq(timeEntry.userId, ctx.user.userId));
    } else if (scope === "team") {
      const scopedIds = await resolveScopedUserIds(ctx);
      if (scopedIds !== null) {
        const ids = [...new Set([...scopedIds, ctx.user.userId])];
        conditions.push(inArray(timeEntry.userId, ids));
      }
    }

    const rows = await db
      .select({ duration: timeEntry.duration })
      .from(timeEntry)
      .where(and(...conditions));

    const totalMinutes = rows.reduce((sum, row) => sum + row.duration, 0);

    if (rows.length === 0) {
      warning = `Nenhum lançamento encontrado em ${range.label}${matched ? ` para ${matched.name}` : ""}.`;
    }

    const reportKind: ReportKind =
      args.reportKind ?? (matched ? "detailed" : "summary");
    const format: ReportFormat = args.format ?? "pdf";

    const scopeLabel =
      scope === "team"
        ? "Equipe"
        : scope === "project"
          ? (matched?.name ?? "Projeto")
          : ctx.user.name;

    ctx.emitAction({
      kind: "export_report",
      format,
      reportKind,
      scope,
      projectId: matched?.id ?? null,
      projectName: matched?.name ?? null,
      from: range.from,
      to: range.to,
      periodLabel: range.label,
      title: `Relatório de horas — ${scopeLabel}`,
      entryCount: rows.length,
      totalMinutes,
      warning,
    });

    return {
      label: `Relatório preparado — ${format.toUpperCase()}`,
      data: {
        status: "awaiting_confirmation",
        period: range.label,
        entryCount: rows.length,
        total: formatDuration(totalMinutes),
        warning,
        note: "Cartão com botão de download exibido. Não afirme que o arquivo já foi baixado.",
      },
    };
  },
};

// ─── Tool: prepare_team_notification (manager/admin) ─────────────────

const notifyArgsSchema = z.object({
  audience: z.enum(["project_members", "direct_reports", "custom"]).optional(),
  project: z.string().optional(),
  people: z.array(z.string()).optional(),
  subject: z.string().min(1),
  message: z.string().min(1),
  contextLines: z.array(z.string()).optional(),
});

export const prepareTeamNotificationTool: AgentTool<
  z.infer<typeof notifyArgsSchema>
> = {
  name: "prepare_team_notification",
  description:
    "Prepara um e-mail para pessoas do time (ex.: avisar que o budget de um projeto atingiu 80%), exibindo um cartão com destinatários e prévia da mensagem. NUNCA envia sozinho — o envio só acontece com o clique do usuário.",
  parameters: {
    type: "object",
    properties: {
      audience: {
        type: "string",
        enum: ["project_members", "direct_reports", "custom"],
        description:
          "'project_members' = membros do projeto; 'direct_reports' = sua equipe direta; 'custom' = pessoas listadas em 'people'.",
      },
      project: {
        type: "string",
        description: "Projeto, quando a audiência for project_members.",
      },
      people: {
        type: "array",
        items: { type: "string" },
        description: "Nomes ou e-mails, quando a audiência for custom.",
      },
      subject: {
        type: "string",
        description: "Assunto do e-mail, curto e objetivo.",
      },
      message: {
        type: "string",
        description:
          "Corpo da mensagem em pt-BR, 1 a 3 frases. Não invente números.",
      },
      contextLines: {
        type: "array",
        items: { type: "string" },
        description:
          "Linhas factuais de apoio (ex.: 'Budget: 160h de 200h — 80%'). Use apenas dados que você realmente obteve.",
      },
    },
    required: ["subject", "message"],
  },
  schema: notifyArgsSchema,
  roles: ["manager", "admin"],
  actionKind: "notify_team",
  label: () => "Preparando a notificação",
  async execute(args, ctx) {
    const audience: NotifyAudience = args.audience ?? "direct_reports";
    const projects = await listLoggableProjects(ctx);
    const matched = matchProject(args.project, projects);

    let recipients: Array<{ id: string; name: string; email: string }> = [];
    let warning: string | null = null;

    if (audience === "project_members") {
      if (!matched) {
        return {
          label: "Projeto não encontrado",
          data: {
            status: "project_not_found",
            note: "Informe o projeto para notificar os membros.",
            available: projects.slice(0, 12).map((item) => item.name),
          },
        };
      }

      const memberships = await db.query.projectMember.findMany({
        where: eq(projectMember.projectId, matched.id),
        columns: { userId: true },
      });

      const memberIds = memberships.map((item) => item.userId);

      if (memberIds.length > 0) {
        recipients = await db.query.user.findMany({
          where: and(inArray(user.id, memberIds), eq(user.isActive, true)),
          columns: { id: true, name: true, email: true },
        });
      }
    } else if (audience === "direct_reports") {
      const reportIds = await getDirectReportIds(ctx.actor.userId);

      if (reportIds.length > 0) {
        const rows = await db.query.user.findMany({
          where: and(inArray(user.id, reportIds), eq(user.isActive, true)),
          columns: { id: true, name: true, email: true },
        });
        recipients = rows;
      }
    } else {
      const needles = (args.people ?? [])
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);

      if (needles.length === 0) {
        return {
          label: "Destinatários não informados",
          data: {
            status: "missing_recipients",
            note: "Pergunte quem deve receber a mensagem.",
          },
        };
      }

      const scopedIds = await resolveScopedUserIds(ctx);
      const conditions = [eq(user.isActive, true)];
      if (scopedIds !== null) {
        const ids = [...new Set([...scopedIds, ctx.actor.userId])];
        conditions.push(inArray(user.id, ids));
      }

      const scopedUsers = await db.query.user.findMany({
        where: and(...conditions),
        columns: { id: true, name: true, email: true },
      });

      const found = new Map<
        string,
        { id: string; name: string; email: string }
      >();
      const missing: string[] = [];

      for (const needle of needles) {
        const hit =
          scopedUsers.find((item) => item.email.toLowerCase() === needle) ??
          scopedUsers.find((item) => item.name.toLowerCase() === needle) ??
          scopedUsers.find((item) => item.name.toLowerCase().includes(needle));

        if (hit) {
          found.set(hit.id, hit);
        } else {
          missing.push(needle);
        }
      }

      recipients = [...found.values()];

      if (missing.length > 0) {
        warning = `Não encontrei no seu escopo: ${missing.join(", ")}.`;
      }
    }

    if (recipients.length === 0) {
      return {
        label: "Nenhum destinatário",
        data: {
          status: "no_recipients",
          note: "Não há destinatários no seu escopo para essa audiência.",
          warning,
        },
      };
    }

    ctx.emitAction({
      kind: "notify_team",
      audience,
      projectId: matched?.id ?? null,
      projectName: matched?.name ?? null,
      recipients,
      subject: args.subject.trim(),
      message: args.message.trim(),
      contextLines: (args.contextLines ?? [])
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 6),
      warning,
    });

    return {
      label: `Notificação preparada — ${recipients.length} destinatário(s)`,
      data: {
        status: "awaiting_confirmation",
        recipientCount: recipients.length,
        recipients: recipients.slice(0, 10).map((item) => item.name),
        warning,
        note: "Cartão de confirmação exibido. O e-mail NÃO foi enviado — só o clique do usuário envia.",
      },
    };
  },
};

// ─── Tool: get_project_budget (read, feeds budget alerts) ────────────

const budgetArgsSchema = z.object({
  project: z.string().optional(),
});

export const getProjectBudgetTool: AgentTool<z.infer<typeof budgetArgsSchema>> =
  {
    name: "get_project_budget",
    description:
      "Retorna o consumo de budget dos projetos acessíveis: horas orçadas, horas consumidas e percentual. Use antes de avisar alguém sobre budget, para nunca inventar números.",
    parameters: {
      type: "object",
      properties: {
        project: {
          type: "string",
          description: "Projeto específico. Omita para listar todos.",
        },
      },
    },
    schema: budgetArgsSchema,
    label: () => "Consultando budget dos projetos",
    async execute(args, ctx) {
      const projects = await listLoggableProjects(ctx);
      const matched = matchProject(args.project, projects);

      if (args.project && !matched) {
        return {
          label: "Projeto não encontrado",
          data: {
            status: "project_not_found",
            available: projects.slice(0, 12).map((item) => item.name),
          },
        };
      }

      const targetIds = matched
        ? [matched.id]
        : projects.map((item) => item.id);

      if (targetIds.length === 0) {
        return {
          label: "Nenhum projeto acessível",
          data: { status: "empty", projects: [] },
        };
      }

      const [rows, entries] = await Promise.all([
        db.query.project.findMany({
          where: inArray(project.id, targetIds),
          columns: { id: true, name: true, code: true, budget: true },
        }),
        db
          .select({
            projectId: timeEntry.projectId,
            duration: timeEntry.duration,
          })
          .from(timeEntry)
          .where(
            and(
              inArray(timeEntry.projectId, targetIds),
              isNull(timeEntry.deletedAt),
            ),
          ),
      ]);

      const consumedByProject = new Map<string, number>();
      for (const entry of entries) {
        consumedByProject.set(
          entry.projectId,
          (consumedByProject.get(entry.projectId) ?? 0) + entry.duration,
        );
      }

      const summary = rows
        .map((row) => {
          const consumedMinutes = consumedByProject.get(row.id) ?? 0;
          const budgetMinutes = row.budget ? row.budget * 60 : null;

          return {
            project: row.name,
            code: row.code,
            budgetHours: row.budget,
            consumed: formatDuration(consumedMinutes),
            percentage: budgetMinutes
              ? Math.round((consumedMinutes / budgetMinutes) * 100)
              : null,
          };
        })
        .sort((a, b) => (b.percentage ?? -1) - (a.percentage ?? -1));

      return {
        label: matched
          ? `Budget de ${matched.name}`
          : `Budget de ${summary.length} projeto(s)`,
        data: { projects: summary.slice(0, 15) },
      };
    },
  };

export const OPERATOR_TOOLS = [
  prepareTimeEntryUpdateTool,
  prepareTimeEntryDeleteTool,
  prepareTimerPauseTool,
  prepareTimerResumeTool,
  prepareTimesheetReviewTool,
  prepareReportExportTool,
  prepareTeamNotificationTool,
  getProjectBudgetTool,
];
