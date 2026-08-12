import { addDays, subDays } from "date-fns";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import type { AppRole } from "@/lib/access-control";
import { resolveDurationMinutes } from "@/lib/ai/duration";
import { formatDayLabel, resolvePeriod } from "@/lib/ai/periods";
import { db } from "@/lib/db";
import { activeTimer, timeEntry, timesheet } from "@/lib/db/schema";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { getTimesheetStatusLabel } from "@/lib/timesheet-status";
import {
  formatDuration,
  formatLocalDate,
  getWeekPeriod,
  parseLocalDate,
} from "@/lib/utils";
import { listLoggableProjects, matchProject } from "./read-tools";
import type { AgentTool, ToolContext } from "./types";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts YYYY-MM-DD or relative keywords the model likes to emit. */
function resolveDate(raw: string | undefined, today: string): string {
  if (!raw) return today;
  const value = raw.trim().toLowerCase();

  if (DATE_PATTERN.test(value)) return value;
  if (value === "hoje" || value === "today") return today;
  if (value === "ontem" || value === "yesterday") {
    return formatLocalDate(subDays(parseLocalDate(today), 1));
  }
  if (value === "anteontem") {
    return formatLocalDate(subDays(parseLocalDate(today), 2));
  }
  if (value === "amanha" || value === "amanhã" || value === "tomorrow") {
    return formatLocalDate(addDays(parseLocalDate(today), 1));
  }

  return today;
}

/** Business validations mirrored from POST /api/time-entries. */
async function buildEntryWarning(
  ctx: ToolContext,
  date: string,
  matchedProjectId: string | null,
  isMember: boolean,
): Promise<string | null> {
  if (date > ctx.user.today) {
    return "Não é possível lançar horas em datas futuras.";
  }

  const oldest = formatLocalDate(subDays(parseLocalDate(ctx.user.today), 30));
  if (date < oldest) {
    return "Só é possível lançar horas com até 30 dias de retroatividade.";
  }

  const lock = await getWeeklyTimesheetStatusForDate(ctx.user.userId, date);
  if (lock.locked && lock.status) {
    return `A semana de ${formatDayLabel(date)} já foi ${getTimesheetStatusLabel(lock.status)} — não é possível editar.`;
  }

  if (!matchedProjectId) {
    return "Não identifiquei o projeto — selecione um antes de confirmar.";
  }

  if (ctx.actor.role === "member" && !isMember) {
    return "Você não é membro deste projeto, então o lançamento pode ser recusado.";
  }

  return null;
}

// ─── Tool: prepare_time_entry ────────────────────────────────────────

const prepareEntryArgsSchema = z.object({
  project: z.string().optional(),
  description: z.string().min(1),
  date: z.string().optional(),
  durationMinutes: z.number().int().positive().optional(),
  durationText: z.string().optional(),
  billable: z.boolean().optional(),
  azureWorkItemId: z.number().int().positive().optional(),
  azureWorkItemTitle: z.string().optional(),
});

export const prepareTimeEntryTool: AgentTool<
  z.infer<typeof prepareEntryArgsSchema>
> = {
  name: "prepare_time_entry",
  description:
    "Monta um lançamento de horas e exibe um cartão de confirmação de 1 clique para o usuário. NÃO grava nada sozinho — o usuário precisa confirmar. Use sempre que a pessoa descrever um trabalho já realizado (ex.: 'trabalhei 2h30 no projeto X ajustando a task #123').",
  parameters: {
    type: "object",
    properties: {
      project: {
        type: "string",
        description: "Nome, código ou id do projeto informado pelo usuário.",
      },
      description: {
        type: "string",
        description:
          "Descrição objetiva da atividade, em pt-BR, sem repetir a duração.",
      },
      date: {
        type: "string",
        description: "Data no formato YYYY-MM-DD, ou 'hoje'/'ontem'.",
      },
      durationMinutes: {
        type: "integer",
        description: "Duração total em minutos (ex.: 150 para 2h30).",
      },
      durationText: {
        type: "string",
        description: "Duração como o usuário escreveu, ex.: '2h30', '45m'.",
      },
      billable: { type: "boolean", description: "Faturável. Padrão: true." },
      azureWorkItemId: {
        type: "integer",
        description: "ID do work item do Azure DevOps, quando mencionado.",
      },
      azureWorkItemTitle: {
        type: "string",
        description: "Título do work item, quando conhecido.",
      },
    },
    required: ["description"],
  },
  schema: prepareEntryArgsSchema,
  label: () => "Preparando o lançamento",
  async execute(args, ctx) {
    const projects = await listLoggableProjects(ctx);
    const matched =
      matchProject(args.project, projects) ??
      (projects.length === 1 ? projects[0] : null);

    const date = resolveDate(args.date, ctx.user.today);
    const durationMinutes = resolveDurationMinutes(
      args.durationMinutes,
      args.durationText,
      60,
    );

    const warning = await buildEntryWarning(
      ctx,
      date,
      matched?.id ?? null,
      matched?.isMember ?? false,
    );

    ctx.emitAction({
      kind: "create_time_entry",
      projectId: matched?.id ?? null,
      projectName: matched?.name ?? args.project ?? null,
      projectColor: matched?.color ?? null,
      description: args.description.trim(),
      date,
      durationMinutes,
      billable: args.billable ?? true,
      azureWorkItemId: args.azureWorkItemId ?? null,
      azureWorkItemTitle: args.azureWorkItemTitle ?? null,
      warning,
    });

    return {
      label: `Lançamento preparado — ${formatDuration(durationMinutes)}`,
      data: {
        status: "awaiting_confirmation",
        project: matched?.name ?? null,
        projectResolved: Boolean(matched),
        date,
        duration: formatDuration(durationMinutes),
        warning,
        note: "O cartão de confirmação já foi exibido ao usuário. Não afirme que o lançamento foi salvo.",
      },
    };
  },
};

// ─── Tool: prepare_timer_start ───────────────────────────────────────

const prepareTimerArgsSchema = z.object({
  project: z.string().optional(),
  description: z.string().optional(),
  billable: z.boolean().optional(),
  azureWorkItemId: z.number().int().positive().optional(),
  azureWorkItemTitle: z.string().optional(),
});

export const prepareTimerStartTool: AgentTool<
  z.infer<typeof prepareTimerArgsSchema>
> = {
  name: "prepare_timer_start",
  description:
    "Prepara o início de um cronômetro e exibe um cartão de confirmação. NÃO inicia sozinho. Use quando a pessoa disser que vai começar a trabalhar em algo agora.",
  parameters: {
    type: "object",
    properties: {
      project: {
        type: "string",
        description: "Nome, código ou id do projeto.",
      },
      description: {
        type: "string",
        description: "O que será trabalhado agora.",
      },
      billable: { type: "boolean", description: "Faturável. Padrão: true." },
      azureWorkItemId: {
        type: "integer",
        description: "ID do work item vinculado.",
      },
      azureWorkItemTitle: {
        type: "string",
        description: "Título do work item.",
      },
    },
  },
  schema: prepareTimerArgsSchema,
  label: () => "Preparando o cronômetro",
  async execute(args, ctx) {
    const projects = await listLoggableProjects(ctx);
    const matched =
      matchProject(args.project, projects) ??
      (projects.length === 1 ? projects[0] : null);

    const [lock, running] = await Promise.all([
      getWeeklyTimesheetStatusForDate(ctx.user.userId, ctx.user.today),
      db.query.activeTimer.findFirst({
        where: eq(activeTimer.userId, ctx.user.userId),
        columns: { id: true },
      }),
    ]);

    let warning: string | null = null;
    if (lock.locked && lock.status) {
      warning = `A semana atual já foi ${getTimesheetStatusLabel(lock.status)} — não é possível registrar novas horas.`;
    } else if (!matched) {
      warning = "Não identifiquei o projeto — selecione um antes de confirmar.";
    } else if (running) {
      warning =
        "Você já tem um timer em execução; ele será finalizado e salvo automaticamente.";
    }

    ctx.emitAction({
      kind: "start_timer",
      projectId: matched?.id ?? null,
      projectName: matched?.name ?? args.project ?? null,
      projectColor: matched?.color ?? null,
      description: args.description?.trim() ?? "",
      billable: args.billable ?? true,
      azureWorkItemId: args.azureWorkItemId ?? null,
      azureWorkItemTitle: args.azureWorkItemTitle ?? null,
      warning,
    });

    return {
      label: "Cronômetro preparado",
      data: {
        status: "awaiting_confirmation",
        project: matched?.name ?? null,
        warning,
        note: "Cartão de confirmação exibido. Não afirme que o timer já está rodando.",
      },
    };
  },
};

// ─── Tool: prepare_timer_stop ────────────────────────────────────────

const emptyArgsSchema = z.object({});
type EmptyArgs = z.infer<typeof emptyArgsSchema>;

export const prepareTimerStopTool: AgentTool<EmptyArgs> = {
  name: "prepare_timer_stop",
  description:
    "Prepara a parada do cronômetro em execução, exibindo um cartão de confirmação com o tempo acumulado. Use quando a pessoa disser que terminou a atividade.",
  parameters: { type: "object", properties: {} },
  schema: emptyArgsSchema,
  label: () => "Preparando a parada do cronômetro",
  async execute(_args, ctx) {
    const timer = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, ctx.user.userId),
      with: { project: { columns: { name: true } } },
    });

    if (!timer) {
      return {
        label: "Nenhum timer ativo",
        data: {
          status: "no_timer",
          note: "Não existe cronômetro em execução para parar.",
        },
      };
    }

    const elapsedMs = timer.pausedAt
      ? timer.accumulatedMs
      : timer.accumulatedMs + (Date.now() - timer.startedAt.getTime());
    const elapsedMinutes = Math.max(1, Math.floor(elapsedMs / 60_000));

    ctx.emitAction({
      kind: "stop_timer",
      projectName: timer.project?.name ?? null,
      description: timer.description || null,
      elapsedMinutes,
    });

    return {
      label: `Parada preparada — ${formatDuration(elapsedMinutes)}`,
      data: {
        status: "awaiting_confirmation",
        project: timer.project?.name ?? null,
        elapsed: formatDuration(elapsedMinutes),
        note: "Cartão de confirmação exibido ao usuário.",
      },
    };
  },
};

// ─── Tool: prepare_timesheet_submit ──────────────────────────────────

const submitArgsSchema = z.object({
  period: z.enum(["this_week", "last_week"]).optional(),
});

export const prepareTimesheetSubmitTool: AgentTool<
  z.infer<typeof submitArgsSchema>
> = {
  name: "prepare_timesheet_submit",
  description:
    "Prepara a submissão do timesheet semanal, exibindo um cartão de confirmação com o total de horas e eventuais alertas de dias incompletos. NÃO submete sozinho.",
  parameters: {
    type: "object",
    properties: {
      period: {
        type: "string",
        enum: ["this_week", "last_week"],
        description: "Semana a submeter. Padrão: this_week.",
      },
    },
  },
  schema: submitArgsSchema,
  label: () => "Preparando a submissão do timesheet",
  async execute(args, ctx) {
    const range = resolvePeriod(args.period ?? "this_week", ctx.user.today);
    const period = getWeekPeriod(range.from);

    const [sheet, entries] = await Promise.all([
      db.query.timesheet.findFirst({
        where: and(
          eq(timesheet.userId, ctx.user.userId),
          eq(timesheet.period, period),
        ),
        columns: { status: true },
      }),
      db
        .select({ duration: timeEntry.duration, date: timeEntry.date })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.userId, ctx.user.userId),
            gte(timeEntry.date, range.from),
            lte(timeEntry.date, range.to),
            isNull(timeEntry.deletedAt),
          ),
        ),
    ]);

    const status = sheet?.status ?? "open";
    const totalMinutes = entries.reduce((sum, e) => sum + e.duration, 0);

    if (status === "submitted" || status === "approved") {
      return {
        label: `Timesheet já ${getTimesheetStatusLabel(status)}`,
        data: {
          status: "already_" + status,
          period,
          note: `O timesheet de ${period} já foi ${getTimesheetStatusLabel(status)}.`,
        },
      };
    }

    if (entries.length === 0) {
      return {
        label: "Semana sem lançamentos",
        data: {
          status: "empty",
          period,
          note: "Não há lançamentos nessa semana; não é possível submeter.",
        },
      };
    }

    const minutesByDate = new Map<string, number>();
    for (const entry of entries) {
      minutesByDate.set(
        entry.date,
        (minutesByDate.get(entry.date) ?? 0) + entry.duration,
      );
    }

    const dailyTarget = Math.round((ctx.user.weeklyCapacityHours / 5) * 60);
    const lowDays = [...minutesByDate.entries()].filter(
      ([, minutes]) => minutes < Math.min(360, dailyTarget),
    ).length;

    const warning =
      lowDays > 0
        ? `${lowDays} dia(s) da semana estão abaixo de 6h registradas.`
        : null;

    ctx.emitAction({
      kind: "submit_timesheet",
      period,
      periodLabel: `${formatDayLabel(range.from)} – ${formatDayLabel(range.to)}`,
      totalMinutes,
      entryCount: entries.length,
      warning,
    });

    return {
      label: `Submissão preparada — ${formatDuration(totalMinutes)}`,
      data: {
        status: "awaiting_confirmation",
        period,
        total: formatDuration(totalMinutes),
        entryCount: entries.length,
        warning,
        note: "Cartão de confirmação exibido. Não afirme que o timesheet foi submetido.",
      },
    };
  },
};

// ─── Tool: navigate_to ───────────────────────────────────────────────

/** Only routes that actually exist in the app — a wrong path would 404. */
const NAVIGATION_TARGETS: Record<
  string,
  { path: string; label: string; roles?: AppRole[] }
> = {
  dashboard: { path: "/dashboard", label: "Abrir o Dashboard" },
  time: { path: "/dashboard/time", label: "Abrir o Registro de Horas" },
  timesheets: { path: "/dashboard/timesheets", label: "Abrir Timesheets" },
  approvals: {
    path: "/dashboard/timesheets/approvals",
    label: "Abrir Aprovações",
    roles: ["manager", "admin"],
  },
  projects: { path: "/dashboard/projects", label: "Abrir Projetos" },
  team_hours: {
    path: "/dashboard/team-hours",
    label: "Abrir Horas da Equipe",
    roles: ["manager", "admin"],
  },
  people: {
    path: "/dashboard/people",
    label: "Abrir Pessoas",
    roles: ["manager", "admin"],
  },
  suggestions: { path: "/dashboard/suggestions", label: "Abrir Sugestões" },
  releases: { path: "/dashboard/releases", label: "Abrir Novidades" },
  integrations: {
    path: "/dashboard/settings/integrations",
    label: "Abrir Integrações",
  },
  azure_devops: {
    path: "/dashboard/settings/integrations/azure-devops",
    label: "Configurar Azure DevOps",
  },
  settings: { path: "/dashboard/settings", label: "Abrir Configurações" },
  profile: { path: "/dashboard/profile", label: "Abrir meu Perfil" },
};

const navigateArgsSchema = z.object({
  target: z.string(),
});

export const navigateToTool: AgentTool<z.infer<typeof navigateArgsSchema>> = {
  name: "navigate_to",
  description:
    "Oferece ao usuário um botão para abrir uma tela do sistema. Use quando a resposta ficar mais útil com um atalho direto para a página relevante.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: Object.keys(NAVIGATION_TARGETS),
        description: "Tela de destino.",
      },
    },
    required: ["target"],
  },
  schema: navigateArgsSchema,
  label: () => "Preparando atalho de navegação",
  async execute(args, ctx) {
    const target = NAVIGATION_TARGETS[args.target.trim().toLowerCase()];

    if (!target || (target.roles && !target.roles.includes(ctx.actor.role))) {
      return {
        label: "Destino indisponível",
        data: {
          error: `Destino inválido ou sem permissão. Opções: ${Object.keys(NAVIGATION_TARGETS).join(", ")}`,
        },
      };
    }

    ctx.emitAction({
      kind: "navigate",
      path: target.path,
      label: target.label,
    });

    return {
      label: target.label,
      data: { status: "shortcut_shown", path: target.path },
    };
  },
};

// ─── Registry export ─────────────────────────────────────────────────

export const WRITE_TOOLS = [
  prepareTimeEntryTool,
  prepareTimerStartTool,
  prepareTimerStopTool,
  prepareTimesheetSubmitTool,
  navigateToTool,
];
