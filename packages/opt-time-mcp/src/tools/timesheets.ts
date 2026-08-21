import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { OptSolvClient } from "../client.js";
import { MUTATING, ok, periodArg, READ_ONLY, runTool } from "./shared.js";

/**
 * Weekly timesheet tools: `opt_time_get_timesheet_status` and
 * `opt_time_submit_timesheet`.
 *
 * Submitting locks the week for the user — only a manager can reopen it — so
 * the submit tool refuses incomplete weeks unless the caller passes `force`
 * after checking with the user.
 */
export function registerTimesheetTools(
  server: McpServer,
  client: OptSolvClient,
): void {
  server.registerTool(
    "opt_time_get_timesheet_status",
    {
      title: "Status do timesheet",
      description:
        "Retorna o status do timesheet semanal (aberto, submetido, aprovado ou rejeitado), o total de horas, o detalhamento dia a dia e os avisos de dias incompletos.",
      inputSchema: { period: periodArg },
      annotations: { title: "Status do timesheet", ...READ_ONLY },
    },
    async (args) =>
      runTool(async () => {
        const status = await client.getTimesheetStatus(args.period);

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

        return ok(
          `Timesheet ${status.period} (${status.periodStart} a ${status.periodEnd}) — status: ${status.statusLabel}.\n` +
            `Total: ${status.totalLabel}.\n${days}` +
            warnings +
            rejection,
          { ...status },
        );
      }),
  );

  server.registerTool(
    "opt_time_submit_timesheet",
    {
      title: "Submeter timesheet",
      description:
        "Submete a semana para aprovação do gestor. Após submeter, os lançamentos ficam bloqueados para edição. Se houver dias abaixo de 6h a chamada falha listando as pendências — mostre-as ao usuário e só repita com force=true após a confirmação dele.",
      inputSchema: {
        period: periodArg,
        force: z
          .boolean()
          .optional()
          .describe(
            "Submete mesmo com dias incompletos. Use apenas após o usuário confirmar explicitamente. Padrão: false.",
          ),
      },
      annotations: { title: "Submeter timesheet", ...MUTATING },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.submitTimesheet(args.period, args.force);

        return ok(
          `📤 Timesheet ${result.period} submetido para aprovação com ${result.totalLabel} ` +
            `em ${result.entryCount} lançamento(s). Os lançamentos da semana estão bloqueados até a decisão do gestor.`,
          { ...result },
        );
      }),
  );
}
