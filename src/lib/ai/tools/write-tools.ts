import { randomUUID } from "node:crypto";
import { addDays, subDays } from "date-fns";
import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { z } from "zod";
import { SETTINGS_TABS } from "@/app/(dashboard)/dashboard/settings/tabs";
import { parseDurationText, resolveDurationMinutes } from "@/lib/ai/duration";
import {
  buildProjectPath,
  buildSettingsPath,
  getNavigationTargetsForRole,
  NAVIGATION_TARGETS,
  resolveNavigationTarget,
} from "@/lib/ai/operator/navigation";
import {
  isUiCommandId,
  UI_COMMAND_LIST,
  UI_COMMANDS,
} from "@/lib/ai/operator/ui-commands";
import { formatDayLabel, resolvePeriod } from "@/lib/ai/periods";
import type { NavigateAction, UiCommandPayload } from "@/lib/ai/types";
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
  actionKind: "create_time_entry",
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
  actionKind: "start_timer",
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
  actionKind: "stop_timer",
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
  actionKind: "submit_timesheet",
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
          status: `already_${status}`,
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

const navigateArgsSchema = z.object({
  target: z.string().optional(),
  project: z.string().optional(),
  settingsTab: z.string().optional(),
  reason: z.string().max(160).optional(),
});

export const navigateToTool: AgentTool<z.infer<typeof navigateArgsSchema>> = {
  name: "navigate_to",
  description:
    "Abre uma tela do sistema para o usuário. Use SEMPRE que a pessoa pedir para ir/abrir/mostrar uma tela ('abre os projetos', 'me leva para as aprovações') e também quando a resposta ficar mais útil com um atalho direto. Dependendo do nível de autonomia configurado, a navegação acontece na hora; caso contrário vira um botão de 1 clique.",
  parameters: {
    type: "object",
    properties: {
      target: {
        type: "string",
        enum: Object.keys(NAVIGATION_TARGETS),
        description:
          "Tela de destino. Omita apenas quando usar 'project' para abrir um projeto específico.",
      },
      project: {
        type: "string",
        description:
          "Nome, código ou id de um projeto, para abrir a tela dele. Tem prioridade sobre 'target'.",
      },
      settingsTab: {
        type: "string",
        enum: [...SETTINGS_TABS],
        description:
          "Aba específica das Configurações, quando o destino for 'settings'.",
      },
      reason: {
        type: "string",
        description:
          "Frase curta em pt-BR explicando o que o usuário encontra lá (ex.: 'aprovações pendentes da equipe').",
      },
    },
    required: [],
  },
  schema: navigateArgsSchema,
  actionKind: "navigate",
  label: () => "Abrindo a tela",
  async execute(args, ctx) {
    const detail = args.reason?.trim() || null;

    // A named project wins: it is the most specific destination available.
    if (args.project) {
      const projects = await listLoggableProjects(ctx);
      const matched = matchProject(args.project, projects);

      if (!matched) {
        return {
          label: "Projeto não encontrado",
          data: {
            error: "ambiguous",
            message: `Nenhum projeto corresponde a "${args.project}".`,
            options: projects.slice(0, 8).map((item) => item.name),
          },
        };
      }

      const action: NavigateAction = {
        kind: "navigate",
        id: randomUUID(),
        path: buildProjectPath(matched.id),
        label: `Abrir o projeto ${matched.name}`,
        detail,
      };

      ctx.emitAction(action);

      return {
        label: action.label,
        data: {
          status: "navigation_ready",
          path: action.path,
          project: matched.name,
          note: "A navegação foi entregue ao usuário. Não descreva a tela em detalhes.",
        },
      };
    }

    if (args.settingsTab) {
      const path = buildSettingsPath(args.settingsTab);

      ctx.emitAction({
        kind: "navigate",
        id: randomUUID(),
        path,
        label: "Abrir Configurações",
        detail,
      });

      return {
        label: "Abrir Configurações",
        data: { status: "navigation_ready", path },
      };
    }

    const target = args.target
      ? resolveNavigationTarget(args.target, ctx.actor.role)
      : null;

    if (!target) {
      return {
        label: "Destino indisponível",
        data: {
          error: "invalid_target",
          message: "Destino inválido ou sem permissão para este usuário.",
          options: getNavigationTargetsForRole(ctx.actor.role).map(
            (item) => item.id,
          ),
        },
      };
    }

    ctx.emitAction({
      kind: "navigate",
      id: randomUUID(),
      path: target.path,
      label: target.label,
      detail,
    });

    return {
      label: target.label,
      data: {
        status: "navigation_ready",
        path: target.path,
        note: "A navegação foi entregue ao usuário. Não descreva a tela em detalhes.",
      },
    };
  },
};

// ─── Tool: run_ui_command ────────────────────────────────────────────

const uiCommandArgsSchema = z.object({
  command: z.string(),
  reason: z.string().max(160).optional(),
  project: z.string().optional(),
  description: z.string().max(300).optional(),
  date: z.string().optional(),
  durationMinutes: z.number().int().positive().max(1440).optional(),
  durationText: z.string().optional(),
});

/** Catalogue rendered into the tool description so the model can pick one. */
const UI_COMMAND_CATALOGUE = UI_COMMAND_LIST.map(
  (item) => `"${item.id}": ${item.description}`,
).join(" ");

export const runUiCommandTool: AgentTool<z.infer<typeof uiCommandArgsSchema>> =
  {
    name: "run_ui_command",
    description: `Controla a própria interface do app. Comandos disponíveis — ${UI_COMMAND_CATALOGUE} Use quando a pessoa pedir algo visual ou de ambiente de trabalho ("quero focar", "abre o formulário de horas", "modo claro"). Para "quick_entry" você pode pré-preencher projeto, data, duração e descrição.`,
    parameters: {
      type: "object",
      properties: {
        command: {
          type: "string",
          enum: UI_COMMAND_LIST.map((item) => item.id),
          description: "Comando de interface a executar.",
        },
        reason: {
          type: "string",
          description: "Frase curta em pt-BR explicando o porquê.",
        },
        project: {
          type: "string",
          description:
            "Projeto usado para pré-preencher o lançamento rápido (quick_entry).",
        },
        description: {
          type: "string",
          description: "Descrição pré-preenchida da atividade (quick_entry).",
        },
        date: {
          type: "string",
          description: "Data YYYY-MM-DD ou 'hoje'/'ontem' (quick_entry).",
        },
        durationMinutes: {
          type: "integer",
          description: "Duração em minutos para pré-preencher (quick_entry).",
        },
        durationText: {
          type: "string",
          description: "Duração como o usuário escreveu, ex.: '2h30'.",
        },
      },
      required: ["command"],
    },
    schema: uiCommandArgsSchema,
    actionKind: "ui_command",
    label: () => "Preparando comando da interface",
    async execute(args, ctx) {
      const commandId = args.command.trim().toLowerCase();

      if (!isUiCommandId(commandId)) {
        return {
          label: "Comando indisponível",
          data: {
            error: "invalid_command",
            message: "Comando de interface desconhecido.",
            options: UI_COMMAND_LIST.map((item) => item.id),
          },
        };
      }

      const meta = UI_COMMANDS[commandId];

      if (meta.roles && !meta.roles.includes(ctx.actor.role)) {
        return {
          label: "Comando indisponível",
          data: {
            error: "forbidden",
            message: "Sem permissão para este comando.",
          },
        };
      }

      let payload: UiCommandPayload | null = null;

      // Only the quick-entry dialog takes a prefill; the rest are pure toggles.
      if (commandId === "quick_entry") {
        const projects = await listLoggableProjects(ctx);
        const matched = matchProject(args.project, projects);
        // No fallback here: an absent duration must stay absent in a prefill.
        const durationMinutes =
          args.durationMinutes ??
          (args.durationText ? parseDurationText(args.durationText) : null);

        const candidate: UiCommandPayload = {
          ...(matched
            ? { projectId: matched.id, projectName: matched.name }
            : {}),
          ...(args.description ? { description: args.description.trim() } : {}),
          ...(args.date
            ? { date: resolveDate(args.date, ctx.user.today) }
            : {}),
          ...(durationMinutes ? { durationMinutes } : {}),
        };

        payload = Object.keys(candidate).length > 0 ? candidate : null;
      }

      ctx.emitAction({
        kind: "ui_command",
        id: randomUUID(),
        command: meta.id,
        label: meta.label,
        detail: args.reason?.trim() || null,
        payload,
      });

      return {
        label: meta.label,
        data: {
          status: "ui_command_ready",
          command: meta.id,
          note: "O comando foi entregue ao usuário. Responda em 1 frase, sem repetir o que a tela mostra.",
        },
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
  runUiCommandTool,
];
