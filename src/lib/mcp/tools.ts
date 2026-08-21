import type { ApiTokenScope } from "@/lib/api-tokens.shared";
import { todayInAppTimeZone } from "@/lib/timezone";
import type { AgentPrincipal } from "./auth";
import { requireAgentScope } from "./auth";
import { AgentError } from "./errors";
import {
  humanizeMinutes,
  parseDurationMinutes,
  resolveEntryDate,
  resolveLookupDate,
  resolveWeekPeriod,
} from "./format";
import {
  deleteTimeEntry,
  getActiveTimer,
  getDaySummary,
  getTimesheetStatus,
  listProjects,
  listTimeEntries,
  logTime,
  pauseTimer,
  resumeTimer,
  searchWorkItems,
  startTimer,
  stopTimer,
  submitTimesheet,
  suggestDailyEntries,
  updateTimeEntry,
} from "./service";

/**
 * The OptSolv tool catalog.
 *
 * One definition per tool, carrying the JSON Schema the MCP client sees, the
 * scope it requires, MCP behaviour annotations, and the handler. The hosted
 * endpoint (`/api/mcp`) and the manifest served to the npm package both read
 * from here, so there is exactly one place where a tool is described.
 *
 * Two conventions run through every handler:
 *  - `projectId` accepts an id, a code (`OPT-001`) or a name — models speak in
 *    names and forcing UUIDs would make the server unusable in practice.
 *  - the `text` result is written to be quoted verbatim to the user, while
 *    `data` carries the machine-readable payload.
 */

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ToolResult {
  /** Human-facing summary the agent can relay as-is. */
  text: string;
  /** Structured payload for programmatic use. */
  data: unknown;
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchemaObject;
  scope: ApiTokenScope;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint: boolean;
    openWorldHint: boolean;
  };
  handler: (
    principal: AgentPrincipal,
    args: Record<string, unknown>,
  ) => Promise<ToolResult>;
}

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

const MUTATING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;

const PROJECT_REF_SCHEMA = {
  type: "string",
  description:
    "Projeto de destino. Aceita o ID, o código (ex.: OPT-001) ou o nome (ex.: 'Harvest'). Se houver ambiguidade a chamada falha listando os candidatos.",
} as const;

const DATE_SCHEMA = {
  type: "string",
  description:
    "Data no formato YYYY-MM-DD. Também aceita 'hoje', 'ontem' ou 'anteontem'. Padrão: hoje. Não é permitido registrar em datas futuras nem há mais de 30 dias.",
} as const;

const PERIOD_SCHEMA = {
  type: "string",
  description:
    "Semana ISO no formato YYYY-Wnn (ex.: 2026-W33). Também aceita uma data YYYY-MM-DD dentro da semana, 'atual' ou 'semana passada'. Padrão: semana atual.",
} as const;

function str(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function bool(args: Record<string, unknown>, key: string): boolean | undefined {
  const value = args[key];
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function int(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^#?\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim().replace("#", ""), 10);
  }
  return undefined;
}

/** Reads the required project reference, accepting both documented aliases. */
function requireProjectRef(args: Record<string, unknown>): string {
  const reference = str(args, "projectId") ?? str(args, "project");
  if (!reference) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Informe o projeto em 'projectId' (aceita ID, código ou nome).",
      {
        hint: "Chame opt_time_list_projects primeiro se não souber o projeto.",
      },
    );
  }
  return reference;
}

function requireDescription(args: Record<string, unknown>): string {
  const description = str(args, "description");
  if (!description) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Informe uma descrição do que foi feito em 'description'.",
    );
  }
  return description;
}

export const TOOLS: ToolDefinition[] = [
  {
    name: "opt_time_whoami",
    title: "Identificar usuário",
    description:
      "Retorna o usuário autenticado pelo token, seu papel, escopos concedidos e capacidade semanal. Use para confirmar que a configuração do MCP está correta antes de registrar horas.",
    scope: "time:read",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (principal) => {
      const summary = await getDaySummary(principal, todayInAppTimeZone());

      return {
        text:
          `Conectado como ${principal.name} (${principal.email}), papel "${principal.role}".\n` +
          `Token: ${principal.tokenName} · escopos: ${principal.scopes.join(", ")}.\n` +
          `Hoje: ${summary.totalLabel} de ${humanizeMinutes(summary.dailyCapacityMinutes)}.`,
        data: {
          userId: principal.userId,
          name: principal.name,
          email: principal.email,
          role: principal.role,
          scopes: principal.scopes,
          tokenName: principal.tokenName,
          weeklyCapacityMinutes: summary.weeklyCapacityMinutes,
          today: {
            date: summary.date,
            totalMinutes: summary.totalMinutes,
            dailyCapacityMinutes: summary.dailyCapacityMinutes,
          },
        },
      };
    },
  },

  {
    name: "opt_time_list_projects",
    title: "Listar projetos",
    description:
      "Lista os projetos que o usuário pode apontar horas, com nome, código e ID. Chame antes de registrar horas quando não souber o projeto exato.",
    scope: "time:read",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        search: {
          type: "string",
          description:
            "Filtro por nome, código ou cliente. Ex.: 'harvest'. Opcional.",
        },
        status: {
          type: "string",
          enum: ["active", "open", "all"],
          description:
            "Status dos projetos retornados. Padrão: 'active' (somente os que aceitam lançamento).",
        },
        limit: {
          type: "integer",
          description: "Máximo de projetos retornados (1-200). Padrão: 50.",
        },
      },
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const status = str(args, "status");
      const result = await listProjects(principal, {
        search: str(args, "search") ?? null,
        status:
          status === "active" || status === "open" || status === "all"
            ? status
            : null,
        limit: int(args, "limit") ?? null,
      });

      // Truncation is stated outright: an agent shown a silently clipped list
      // will tell the user a project does not exist.
      const header = result.truncated
        ? `Mostrando ${result.returned} de ${result.total} projeto(s) — use 'search' para filtrar ou aumente o 'limit' para ver o restante:`
        : `${result.total} projeto(s):`;

      const text =
        result.total === 0
          ? "Nenhum projeto encontrado com esses filtros."
          : `${header}\n` +
            result.projects
              .map(
                (item) =>
                  `• ${item.name} (${item.code})${item.clientName ? ` — ${item.clientName}` : ""}${item.billable ? "" : " · não faturável"}\n  id: ${item.id}`,
              )
              .join("\n");

      return { text, data: { ...result, count: result.returned } };
    },
  },

  {
    name: "opt_time_get_active_timer",
    title: "Consultar timer ativo",
    description:
      "Retorna o timer em execução no momento: projeto, descrição, tempo decorrido e se está pausado. Retorna null quando não há timer ativo.",
    scope: "time:read",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (principal) => {
      const timer = await getActiveTimer(principal);

      if (!timer) {
        return {
          text: "Nenhum timer ativo no momento.",
          data: { timer: null },
        };
      }

      return {
        text:
          `${timer.isPaused ? "⏸️ Timer pausado" : "⏱️ Timer rodando"} há ${timer.elapsedLabel} ` +
          `no projeto ${timer.project.name} (${timer.project.code}).\n` +
          `Descrição: ${timer.description || "(sem descrição)"}` +
          (timer.azureWorkItemId
            ? `\nWork Item: #${timer.azureWorkItemId}`
            : ""),
        data: { timer },
      };
    },
  },

  {
    name: "opt_time_start_timer",
    title: "Iniciar timer",
    description:
      "Inicia o cronômetro em tempo real na conta do usuário. O timer aparece imediatamente na web e na extensão do Azure DevOps. Se já houver um timer rodando, ele é parado e salvo automaticamente antes de iniciar o novo.",
    scope: "time:write",
    annotations: MUTATING,
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_REF_SCHEMA,
        description: {
          type: "string",
          description:
            "O que será feito. Obrigatório — descreva a tarefa em uma frase.",
        },
        azureWorkItemId: {
          type: "integer",
          description:
            "ID numérico do Work Item do Azure DevOps a vincular. Opcional.",
        },
        azureWorkItemTitle: {
          type: "string",
          description: "Título do Work Item, para exibição. Opcional.",
        },
        billable: {
          type: "boolean",
          description:
            "Se as horas são faturáveis. Padrão: herda a configuração do projeto.",
        },
      },
      required: ["projectId", "description"],
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const result = await startTimer(principal, {
        project: requireProjectRef(args),
        description: requireDescription(args),
        azureWorkItemId: int(args, "azureWorkItemId") ?? null,
        azureWorkItemTitle: str(args, "azureWorkItemTitle") ?? null,
        billable: bool(args, "billable") ?? null,
      });

      const previous = result.replaced
        ? `\n⚠️ O timer anterior (${result.replaced.projectName}) foi parado e salvo com ${humanizeMinutes(result.replaced.durationMinutes)}.`
        : result.discarded
          ? `\nℹ️ O timer anterior (${result.discarded.projectName}) rodou menos de 1 minuto e foi descartado, sem gerar lançamento.`
          : "";

      return {
        text:
          `⏱️ Timer iniciado em ${result.timer.project.name} (${result.timer.project.code}).\n` +
          `Descrição: ${result.timer.description}${previous}`,
        data: result,
      };
    },
  },

  {
    name: "opt_time_stop_timer",
    title: "Parar timer",
    description:
      "Para o cronômetro ativo e salva a entrada de tempo com a duração calculada. Timers com menos de 1 minuto são descartados sem gerar lançamento (campo 'saved' = false). Retorna a duração registrada e o total do dia.",
    scope: "time:write",
    annotations: MUTATING,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (principal) => {
      const result = await stopTimer(principal);
      const summary = await getDaySummary(principal, result.date);

      const text = result.saved
        ? `✅ ${result.durationLabel} registradas em ${result.project.name} (${result.project.code}).\n` +
          `Descrição: ${result.description}\n` +
          `Total acumulado hoje: ${summary.totalLabel} de ${humanizeMinutes(summary.dailyCapacityMinutes)}.`
        : `ℹ️ Timer parado com apenas ${result.elapsedSeconds}s em ${result.project.name} — abaixo do mínimo de 1 minuto, ` +
          `então nenhum lançamento foi criado.\n` +
          `Total do dia segue em ${summary.totalLabel}. Se quiser registrar mesmo assim, use opt_time_log_time.`;

      return {
        text,
        data: { ...result, dayTotalMinutes: summary.totalMinutes },
      };
    },
  },

  {
    name: "opt_time_pause_timer",
    title: "Pausar timer",
    description:
      "Pausa o cronômetro ativo sem salvar a entrada. O tempo acumulado é preservado e pode ser retomado com opt_time_resume_timer.",
    scope: "time:write",
    annotations: MUTATING,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (principal) => {
      const timer = await pauseTimer(principal);
      return {
        text: `⏸️ Timer pausado com ${timer.elapsedLabel} acumuladas em ${timer.project.name}.`,
        data: { timer },
      };
    },
  },

  {
    name: "opt_time_resume_timer",
    title: "Retomar timer",
    description: "Retoma um cronômetro que estava pausado.",
    scope: "time:write",
    annotations: MUTATING,
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    handler: async (principal) => {
      const timer = await resumeTimer(principal);
      return {
        text: `▶️ Timer retomado em ${timer.project.name} com ${timer.elapsedLabel} acumuladas.`,
        data: { timer },
      };
    },
  },

  {
    name: "opt_time_log_time",
    title: "Registrar horas",
    description:
      "Registra uma entrada manual de tempo para uma data específica. Use quando o trabalho já terminou e você sabe quanto tempo levou — para cronometrar em tempo real use opt_time_start_timer.",
    scope: "time:write",
    annotations: MUTATING,
    inputSchema: {
      type: "object",
      properties: {
        projectId: PROJECT_REF_SCHEMA,
        durationMinutes: {
          type: ["integer", "string"],
          description:
            "Duração em MINUTOS (ex.: 150 para 2h30). Também aceita texto como '2h30', '2.5h' ou '90m'. Mínimo 1, máximo 1440.",
        },
        description: {
          type: "string",
          description:
            "O que foi feito. Obrigatório — seja específico, esse texto vai para o relatório de horas.",
        },
        date: DATE_SCHEMA,
        azureWorkItemId: {
          type: "integer",
          description:
            "ID numérico do Work Item do Azure DevOps. As horas são sincronizadas no campo Completed Work. Opcional.",
        },
        azureWorkItemTitle: {
          type: "string",
          description: "Título do Work Item, para exibição. Opcional.",
        },
        billable: {
          type: "boolean",
          description:
            "Se as horas são faturáveis. Padrão: herda a configuração do projeto.",
        },
      },
      required: ["projectId", "durationMinutes", "description"],
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const durationMinutes = parseDurationMinutes(args.durationMinutes);
      const date = resolveEntryDate(args.date);

      const result = await logTime(principal, {
        project: requireProjectRef(args),
        durationMinutes,
        description: requireDescription(args),
        date,
        azureWorkItemId: int(args, "azureWorkItemId") ?? null,
        azureWorkItemTitle: str(args, "azureWorkItemTitle") ?? null,
        billable: bool(args, "billable") ?? null,
      });

      const workItem = result.entry.azureWorkItemId
        ? ` (Work Item #${result.entry.azureWorkItemId})`
        : "";

      return {
        text:
          `✅ ${result.entry.durationLabel} registradas em ${result.entry.project.name} (${result.entry.project.code})${workItem} em ${result.entry.date}.\n` +
          `Total do dia: ${result.dayTotalLabel}.`,
        data: result,
      };
    },
  },

  {
    name: "opt_time_list_time_entries",
    title: "Listar lançamentos",
    description:
      "Lista os lançamentos de tempo do usuário em um intervalo de datas, com ID, projeto, duração e descrição. Use para revisar, auditar ou localizar o ID de uma entrada antes de editá-la.",
    scope: "time:read",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        from: {
          type: "string",
          description: "Data inicial YYYY-MM-DD. Padrão: hoje.",
        },
        to: {
          type: "string",
          description: "Data final YYYY-MM-DD. Padrão: igual a 'from'.",
        },
        projectId: {
          type: "string",
          description: "Filtra por projeto (ID, código ou nome). Opcional.",
        },
        limit: {
          type: "integer",
          description: "Máximo de lançamentos (1-200). Padrão: 100.",
        },
      },
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const from = resolveLookupDate(args.from);
      const to = args.to ? resolveLookupDate(args.to) : from;

      if (to < from) {
        throw new AgentError(
          "VALIDATION_ERROR",
          "A data final não pode ser anterior à data inicial.",
        );
      }

      const entries = await listTimeEntries(principal, {
        from,
        to,
        projectRef: str(args, "projectId") ?? null,
        limit: int(args, "limit") ?? null,
      });

      const total = entries.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      );

      const text =
        entries.length === 0
          ? `Nenhum lançamento entre ${from} e ${to}.`
          : `${entries.length} lançamento(s) entre ${from} e ${to} — total ${humanizeMinutes(total)}:\n` +
            entries
              .map(
                (item) =>
                  `• ${item.date} · ${item.durationLabel} · ${item.project.code} — ${item.description}${item.locked ? " [semana bloqueada]" : ""}\n  id: ${item.id}`,
              )
              .join("\n");

      return {
        text,
        data: { entries, count: entries.length, totalMinutes: total, from, to },
      };
    },
  },

  {
    name: "opt_time_update_time_entry",
    title: "Editar lançamento",
    description:
      "Edita um lançamento existente (projeto, duração, descrição, data, faturável ou Work Item). Só funciona em semanas ainda não submetidas. Use opt_time_list_time_entries para obter o entryId.",
    scope: "time:write",
    annotations: MUTATING,
    inputSchema: {
      type: "object",
      properties: {
        entryId: {
          type: "string",
          description:
            "ID do lançamento, obtido em opt_time_list_time_entries.",
        },
        projectId: {
          type: "string",
          description: "Novo projeto (ID, código ou nome). Opcional.",
        },
        durationMinutes: {
          type: ["integer", "string"],
          description:
            "Nova duração em minutos ou texto como '2h30'. Opcional.",
        },
        description: {
          type: "string",
          description: "Nova descrição. Opcional.",
        },
        date: {
          type: "string",
          description: "Nova data YYYY-MM-DD. Opcional.",
        },
        billable: {
          type: "boolean",
          description: "Novo valor de faturável. Opcional.",
        },
        azureWorkItemId: {
          type: ["integer", "null"],
          description:
            "Novo Work Item vinculado. Envie null para desvincular. Opcional.",
        },
      },
      required: ["entryId"],
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const entryId = str(args, "entryId");
      if (!entryId) {
        throw new AgentError("VALIDATION_ERROR", "Informe o 'entryId'.");
      }

      const entry = await updateTimeEntry(principal, {
        entryId,
        project: str(args, "projectId") ?? null,
        durationMinutes:
          args.durationMinutes != null
            ? parseDurationMinutes(args.durationMinutes)
            : null,
        description: str(args, "description") ?? null,
        date: args.date ? resolveEntryDate(args.date) : null,
        billable: bool(args, "billable") ?? null,
        azureWorkItemId:
          "azureWorkItemId" in args
            ? (int(args, "azureWorkItemId") ?? null)
            : undefined,
      });

      return {
        text: `✏️ Lançamento atualizado: ${entry.date} · ${entry.durationLabel} · ${entry.project.name} — ${entry.description}`,
        data: { entry },
      };
    },
  },

  {
    name: "opt_time_delete_time_entry",
    title: "Excluir lançamento",
    description:
      "Exclui um lançamento de tempo. A operação é reversível apenas por um administrador — confirme com o usuário antes de chamar. Só funciona em semanas ainda não submetidas.",
    scope: "time:write",
    annotations: DESTRUCTIVE,
    inputSchema: {
      type: "object",
      properties: {
        entryId: {
          type: "string",
          description:
            "ID do lançamento, obtido em opt_time_list_time_entries.",
        },
      },
      required: ["entryId"],
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const entryId = str(args, "entryId");
      if (!entryId) {
        throw new AgentError("VALIDATION_ERROR", "Informe o 'entryId'.");
      }

      const result = await deleteTimeEntry(principal, entryId);

      return {
        text: `🗑️ Lançamento de ${humanizeMinutes(result.durationMinutes)} em ${result.date} foi excluído.`,
        data: result,
      };
    },
  },

  {
    name: "opt_time_get_today_summary",
    title: "Resumo do dia",
    description:
      "Retorna o resumo das horas do dia: total registrado, distribuição por projeto, lançamentos, timer ativo, capacidade diária e quanto falta para fechar o dia.",
    scope: "time:read",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Data YYYY-MM-DD a resumir. Padrão: hoje.",
        },
      },
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const summary = await getDaySummary(
        principal,
        resolveLookupDate(args.date),
      );

      const projects =
        summary.byProject.length > 0
          ? `\n${summary.byProject.map((item) => `  • ${item.projectName}: ${item.label}`).join("\n")}`
          : "";

      const timer = summary.activeTimer
        ? `\n⏱️ Timer ativo em ${summary.activeTimer.project.name} há ${summary.activeTimer.elapsedLabel}.`
        : "";

      return {
        text:
          `${summary.date} (${summary.weekday}): ${summary.totalLabel} de ${humanizeMinutes(summary.dailyCapacityMinutes)}` +
          `${summary.isComplete ? " ✅ dia completo" : ` — faltam ${summary.remainingLabel}`}.` +
          projects +
          timer +
          `\nSemana até aqui: ${summary.weekTotalLabel} de ${humanizeMinutes(summary.weeklyCapacityMinutes)}.`,
        data: summary,
      };
    },
  },

  {
    name: "opt_time_get_timesheet_status",
    title: "Status do timesheet",
    description:
      "Retorna o status do timesheet semanal (aberto, submetido, aprovado ou rejeitado), o total de horas, o detalhamento dia a dia e os avisos de dias incompletos.",
    scope: "time:read",
    annotations: READ_ONLY,
    inputSchema: {
      type: "object",
      properties: { period: PERIOD_SCHEMA },
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const status = await getTimesheetStatus(
        principal,
        resolveWeekPeriod(args.period),
      );

      const days = status.days
        .filter((day) => !day.isWeekend || day.minutes > 0)
        .map(
          (day) =>
            `  ${day.weekday.padEnd(8)} ${day.date} — ${day.label}${day.isBelowTarget ? " ⚠️" : ""}`,
        )
        .join("\n");

      const warnings =
        status.warnings.length > 0
          ? `\n\nPendências:\n${status.warnings.map((item) => `  ⚠️ ${item}`).join("\n")}`
          : "";

      const rejection = status.rejectionReason
        ? `\n\n❌ Motivo da rejeição: ${status.rejectionReason}`
        : "";

      return {
        text:
          `Timesheet ${status.period} (${status.periodStart} a ${status.periodEnd}) — status: ${status.statusLabel}.\n` +
          `Total: ${status.totalLabel} de ${humanizeMinutes(status.weeklyCapacityMinutes)}.\n${days}` +
          warnings +
          rejection,
        data: status,
      };
    },
  },

  {
    name: "opt_time_submit_timesheet",
    title: "Submeter timesheet",
    description:
      "Submete a semana para aprovação do gestor. Após submeter, os lançamentos ficam bloqueados para edição. Se houver dias abaixo de 6h a chamada falha listando as pendências — mostre-as ao usuário e só repita com force=true após a confirmação dele.",
    scope: "timesheets:submit",
    annotations: MUTATING,
    inputSchema: {
      type: "object",
      properties: {
        period: PERIOD_SCHEMA,
        force: {
          type: "boolean",
          description:
            "Submete mesmo com dias incompletos. Use apenas após o usuário confirmar explicitamente. Padrão: false.",
        },
      },
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const period = resolveWeekPeriod(args.period);
      const result = await submitTimesheet(principal, period, {
        force: bool(args, "force") ?? false,
      });

      return {
        text:
          `📤 Timesheet ${result.period} submetido para aprovação com ${result.totalLabel} ` +
          `em ${result.entryCount} lançamento(s). Os lançamentos da semana estão bloqueados até a decisão do gestor.`,
        data: result,
      };
    },
  },

  {
    name: "opt_time_search_work_items",
    title: "Buscar work items",
    description:
      "Busca Work Items do Azure DevOps por ID numérico (#123) ou por parte do título. Use para descobrir o azureWorkItemId antes de registrar horas vinculadas.",
    scope: "time:read",
    annotations: { ...READ_ONLY, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "ID numérico ('#890' ou '890') ou trecho do título (mínimo 3 caracteres).",
        },
        projectId: {
          type: "string",
          description:
            "Restringe a busca a um projeto (ID, código ou nome). Opcional — por padrão busca em todos os projetos do usuário.",
        },
        limit: {
          type: "integer",
          description: "Máximo de resultados (1-50). Padrão: 15.",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const query = str(args, "query");
      if (!query) {
        throw new AgentError(
          "VALIDATION_ERROR",
          "Informe o termo de busca em 'query'.",
        );
      }

      const result = await searchWorkItems(principal, {
        query,
        projectRef: str(args, "projectId") ?? null,
        limit: int(args, "limit") ?? null,
      });

      const text =
        result.workItems.length === 0
          ? `Nenhum work item encontrado para "${query}" em: ${result.searchedProjects.join(", ")}.`
          : `${result.workItems.length} work item(s) para "${query}":\n` +
            result.workItems
              .map(
                (item) =>
                  `• #${item.id} [${item.type} · ${item.state}] ${item.title} — ${item.projectName}`,
              )
              .join("\n");

      return { text, data: result };
    },
  },

  {
    name: "opt_time_suggest_daily_entries",
    title: "Sugerir lançamentos do dia",
    description:
      "Retorna sugestões de preenchimento do dia com base nos commits do Azure DevOps e no histórico recente de lançamentos do usuário. Sempre confirme as sugestões com o usuário antes de registrá-las com opt_time_log_time.",
    scope: "time:read",
    annotations: { ...READ_ONLY, openWorldHint: true },
    inputSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "Data YYYY-MM-DD a analisar. Padrão: hoje.",
        },
      },
      additionalProperties: false,
    },
    handler: async (principal, args) => {
      const result = await suggestDailyEntries(
        principal,
        resolveLookupDate(args.date),
      );

      const suggestions =
        result.suggestions.length === 0
          ? "Nenhuma sugestão automática para este dia."
          : result.suggestions
              .map(
                (item, index) =>
                  `${index + 1}. ${item.durationLabel} · ${item.projectName ?? "projeto não identificado"} [${item.confidence}]\n` +
                  `   ${item.description}\n` +
                  `   Motivo: ${item.reasons.join(" ")}`,
              )
              .join("\n");

      const notes =
        result.notes.length > 0 ? `\n\n${result.notes.join("\n")}` : "";

      return {
        text:
          `Sugestões para ${result.date} (já registrado: ${result.alreadyLoggedLabel}, ${result.sources.commits} commit(s) analisado(s)):\n` +
          suggestions +
          notes,
        data: result,
      };
    },
  },
];

export const TOOLS_BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

/**
 * Runs a tool after checking the token carries the scope it requires.
 *
 * @throws {AgentError} `NOT_FOUND` for unknown tools, `INSUFFICIENT_SCOPE` when
 * the token lacks the required permission, or whatever the handler raises.
 */
export async function callTool(
  principal: AgentPrincipal,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  const tool = TOOLS_BY_NAME.get(name);

  if (!tool) {
    throw new AgentError("NOT_FOUND", `Ferramenta desconhecida: "${name}".`, {
      details: { availableTools: TOOLS.map((item) => item.name) },
    });
  }

  requireAgentScope(principal, tool.scope);

  return tool.handler(principal, args ?? {});
}

/** Tool descriptors as an MCP client sees them, without the handlers. */
export function describeTools() {
  return TOOLS.map((tool) => ({
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: { title: tool.title, ...tool.annotations },
    /** Non-standard but harmless: lets the settings UI render required scopes. */
    _optTime: { scope: tool.scope },
  }));
}
