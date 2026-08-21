import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OptSolvClient } from "../client.js";
import {
  billableArg,
  DESTRUCTIVE,
  dateArg,
  descriptionArg,
  MUTATING,
  ok,
  projectRefArg,
  READ_ONLY,
  runTool,
  workItemIdArg,
} from "./shared.js";

/**
 * Time entry tools: log, list, update, delete, and the daily roll-up
 * (`opt_time_get_today_summary`) plus commit-driven suggestions.
 */
export function registerEntryTools(
  server: McpServer,
  client: OptSolvClient,
): void {
  server.registerTool(
    "opt_time_log_time",
    {
      title: "Registrar horas",
      description:
        "Registra uma entrada manual de tempo para uma data específica. Use quando o trabalho já terminou e você sabe quanto tempo levou — para cronometrar em tempo real use opt_time_start_timer.",
      inputSchema: {
        projectId: projectRefArg,
        durationMinutes: z
          .number()
          .int()
          .min(1)
          .max(1440)
          .describe(
            "Duração em MINUTOS (ex.: 150 para 2h30). Mínimo 1, máximo 1440.",
          ),
        description: descriptionArg,
        date: dateArg,
        azureWorkItemId: workItemIdArg,
        billable: billableArg,
      },
      annotations: { title: "Registrar horas", ...MUTATING },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.logTime({
          projectId: args.projectId,
          durationMinutes: args.durationMinutes,
          description: args.description,
          date: args.date,
          azureWorkItemId: args.azureWorkItemId,
          billable: args.billable,
        });

        const workItem = result.entry.azureWorkItemId
          ? ` (Work Item #${result.entry.azureWorkItemId})`
          : "";

        return ok(
          `✅ ${result.entry.durationLabel} registradas em ${result.entry.project.name} (${result.entry.project.code})${workItem} em ${result.entry.date}.\n` +
            `Total do dia: ${result.dayTotalLabel}.`,
          { ...result },
        );
      }),
  );

  server.registerTool(
    "opt_time_list_time_entries",
    {
      title: "Listar lançamentos",
      description:
        "Lista os lançamentos de tempo do usuário em um intervalo de datas, com ID, projeto, duração e descrição. Use para revisar, auditar ou localizar o ID de uma entrada antes de editá-la.",
      inputSchema: {
        from: z
          .string()
          .optional()
          .describe("Data inicial YYYY-MM-DD. Padrão: hoje."),
        to: z
          .string()
          .optional()
          .describe("Data final YYYY-MM-DD. Padrão: igual a 'from'."),
        projectId: z
          .string()
          .optional()
          .describe("Filtra por projeto (ID, código ou nome)."),
        limit: z
          .number()
          .int()
          .min(1)
          .max(200)
          .optional()
          .describe("Máximo de lançamentos. Padrão: 100."),
      },
      annotations: { title: "Listar lançamentos", ...READ_ONLY },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.listTimeEntries({
          from: args.from,
          to: args.to,
          projectId: args.projectId,
          limit: args.limit,
        });

        const text =
          result.entries.length === 0
            ? `Nenhum lançamento entre ${result.from} e ${result.to}.`
            : `${result.count} lançamento(s) entre ${result.from} e ${result.to} — total ${result.totalMinutes} minutos:\n` +
              result.entries
                .map(
                  (entry) =>
                    `• ${entry.date} · ${entry.durationLabel} · ${entry.project.code} — ${entry.description}${entry.locked ? " [semana bloqueada]" : ""}\n  id: ${entry.id}`,
                )
                .join("\n");

        return ok(text, { ...result });
      }),
  );

  server.registerTool(
    "opt_time_update_time_entry",
    {
      title: "Editar lançamento",
      description:
        "Edita um lançamento existente (projeto, duração, descrição, data, faturável ou Work Item). Só funciona em semanas ainda não submetidas. Use opt_time_list_time_entries para obter o entryId.",
      inputSchema: {
        entryId: z
          .string()
          .min(1)
          .describe("ID do lançamento, obtido em opt_time_list_time_entries."),
        projectId: z
          .string()
          .optional()
          .describe("Novo projeto (ID, código ou nome)."),
        durationMinutes: z
          .number()
          .int()
          .min(1)
          .max(1440)
          .optional()
          .describe("Nova duração em minutos."),
        description: z.string().max(500).optional().describe("Nova descrição."),
        date: z.string().optional().describe("Nova data YYYY-MM-DD."),
        billable: z.boolean().optional().describe("Novo valor de faturável."),
        azureWorkItemId: z
          .number()
          .int()
          .positive()
          .nullable()
          .optional()
          .describe("Novo Work Item. Envie null para desvincular."),
      },
      annotations: { title: "Editar lançamento", ...MUTATING },
    },
    async (args) =>
      runTool(async () => {
        const { entryId, ...patch } = args;
        const { entry } = await client.updateTimeEntry(entryId, patch);

        return ok(
          `✏️ Lançamento atualizado: ${entry.date} · ${entry.durationLabel} · ${entry.project.name} — ${entry.description}`,
          { entry },
        );
      }),
  );

  server.registerTool(
    "opt_time_delete_time_entry",
    {
      title: "Excluir lançamento",
      description:
        "Exclui um lançamento de tempo. Confirme com o usuário antes de chamar. Só funciona em semanas ainda não submetidas.",
      inputSchema: {
        entryId: z
          .string()
          .min(1)
          .describe("ID do lançamento, obtido em opt_time_list_time_entries."),
      },
      annotations: { title: "Excluir lançamento", ...DESTRUCTIVE },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.deleteTimeEntry(args.entryId);
        return ok(
          `🗑️ Lançamento de ${result.durationMinutes} minutos em ${result.date} foi excluído.`,
          { ...result },
        );
      }),
  );

  server.registerTool(
    "opt_time_get_today_summary",
    {
      title: "Resumo do dia",
      description:
        "Retorna o resumo das horas do dia: total registrado, distribuição por projeto, lançamentos, timer ativo, capacidade diária e quanto falta para fechar o dia.",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe("Data YYYY-MM-DD a resumir. Padrão: hoje."),
      },
      annotations: { title: "Resumo do dia", ...READ_ONLY },
    },
    async (args) =>
      runTool(async () => {
        const summary = await client.getSummary(args.date);

        const projects =
          summary.byProject.length > 0
            ? `\n${summary.byProject.map((item) => `  • ${item.projectName}: ${item.label}`).join("\n")}`
            : "";

        const timer = summary.activeTimer
          ? `\n⏱️ Timer ativo em ${summary.activeTimer.project.name} há ${summary.activeTimer.elapsedLabel}.`
          : "";

        return ok(
          `${summary.date} (${summary.weekday}): ${summary.totalLabel} registradas` +
            `${summary.isComplete ? " ✅ dia completo" : ` — faltam ${summary.remainingLabel}`}.` +
            projects +
            timer +
            `\nSemana até aqui: ${summary.weekTotalLabel}.`,
          { ...summary },
        );
      }),
  );

  server.registerTool(
    "opt_time_suggest_daily_entries",
    {
      title: "Sugerir lançamentos do dia",
      description:
        "Retorna sugestões de preenchimento do dia com base nos commits do Azure DevOps e no histórico recente de lançamentos. Sempre confirme as sugestões com o usuário antes de registrá-las com opt_time_log_time.",
      inputSchema: {
        date: z
          .string()
          .optional()
          .describe("Data YYYY-MM-DD a analisar. Padrão: hoje."),
      },
      annotations: {
        title: "Sugerir lançamentos do dia",
        ...READ_ONLY,
        openWorldHint: true,
      },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.getSuggestions(args.date);

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

        return ok(
          `Sugestões para ${result.date} (já registrado: ${result.alreadyLoggedLabel}, ${result.sources.commits} commit(s) analisado(s)):\n` +
            suggestions +
            notes,
          { ...result },
        );
      }),
  );
}
