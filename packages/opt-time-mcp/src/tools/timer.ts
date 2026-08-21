import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { OptSolvClient } from "../client.js";
import {
  billableArg,
  descriptionArg,
  MUTATING,
  ok,
  projectRefArg,
  READ_ONLY,
  runTool,
  workItemIdArg,
} from "./shared.js";

/**
 * Timer tools: `opt_time_get_active_timer`, `opt_time_start_timer`,
 * `opt_time_stop_timer`, `opt_time_pause_timer`, `opt_time_resume_timer`.
 *
 * The timer is server-side state shared with the web app and the Azure DevOps
 * extension, so anything started here shows up in the user's sidebar at once.
 */
export function registerTimerTools(
  server: McpServer,
  client: OptSolvClient,
): void {
  server.registerTool(
    "opt_time_get_active_timer",
    {
      title: "Consultar timer ativo",
      description:
        "Retorna o timer em execução no momento: projeto, descrição, tempo decorrido e se está pausado. Retorna null quando não há timer ativo.",
      inputSchema: {},
      annotations: { title: "Consultar timer ativo", ...READ_ONLY },
    },
    async () =>
      runTool(async () => {
        const { timer } = await client.getActiveTimer();

        if (!timer) {
          return ok("Nenhum timer ativo no momento.", { timer: null });
        }

        return ok(
          `${timer.isPaused ? "⏸️ Timer pausado" : "⏱️ Timer rodando"} há ${timer.elapsedLabel} ` +
            `no projeto ${timer.project.name} (${timer.project.code}).\n` +
            `Descrição: ${timer.description || "(sem descrição)"}` +
            (timer.azureWorkItemId
              ? `\nWork Item: #${timer.azureWorkItemId}`
              : ""),
          { timer },
        );
      }),
  );

  server.registerTool(
    "opt_time_start_timer",
    {
      title: "Iniciar timer",
      description:
        "Inicia o cronômetro em tempo real na conta do usuário. Se já houver um timer rodando, ele é parado e salvo automaticamente antes de iniciar o novo.",
      inputSchema: {
        projectId: projectRefArg,
        description: descriptionArg,
        azureWorkItemId: workItemIdArg,
        billable: billableArg,
      },
      annotations: { title: "Iniciar timer", ...MUTATING },
    },
    async (args) =>
      runTool(async () => {
        const result = await client.startTimer({
          projectId: args.projectId,
          description: args.description,
          azureWorkItemId: args.azureWorkItemId,
          billable: args.billable,
        });

        const previous = result.replaced
          ? `\n⚠️ O timer anterior (${result.replaced.projectName}) foi parado e salvo com ${result.replaced.durationMinutes} minutos.`
          : result.discarded
            ? `\nℹ️ O timer anterior (${result.discarded.projectName}) rodou menos de 1 minuto e foi descartado, sem gerar lançamento.`
            : "";

        return ok(
          `⏱️ Timer iniciado em ${result.timer.project.name} (${result.timer.project.code}).\n` +
            `Descrição: ${result.timer.description}${previous}`,
          { ...result },
        );
      }),
  );

  server.registerTool(
    "opt_time_stop_timer",
    {
      title: "Parar timer",
      description:
        "Para o cronômetro ativo e salva a entrada de tempo com a duração calculada. Timers com menos de 1 minuto são descartados sem gerar lançamento (campo 'saved' = false). Retorna a duração registrada e o total do dia.",
      inputSchema: {},
      annotations: { title: "Parar timer", ...MUTATING },
    },
    async () =>
      runTool(async () => {
        const result = await client.stopTimer();
        const summary = await client.getSummary(result.date);

        const text = result.saved
          ? `✅ ${result.durationLabel} registradas em ${result.project.name} (${result.project.code}).\n` +
            `Descrição: ${result.description}\n` +
            `Total acumulado hoje: ${summary.totalLabel}.`
          : `ℹ️ Timer parado com apenas ${result.elapsedSeconds}s em ${result.project.name} — abaixo do mínimo de 1 minuto, ` +
            `então nenhum lançamento foi criado.\n` +
            `Total do dia segue em ${summary.totalLabel}. Se quiser registrar mesmo assim, use opt_time_log_time.`;

        return ok(text, { ...result, dayTotalMinutes: summary.totalMinutes });
      }),
  );

  server.registerTool(
    "opt_time_pause_timer",
    {
      title: "Pausar timer",
      description:
        "Pausa o cronômetro ativo sem salvar a entrada. O tempo acumulado é preservado e pode ser retomado com opt_time_resume_timer.",
      inputSchema: {},
      annotations: { title: "Pausar timer", ...MUTATING },
    },
    async () =>
      runTool(async () => {
        const { timer } = await client.pauseTimer();
        return ok(
          `⏸️ Timer pausado com ${timer.elapsedLabel} acumuladas em ${timer.project.name}.`,
          { timer },
        );
      }),
  );

  server.registerTool(
    "opt_time_resume_timer",
    {
      title: "Retomar timer",
      description: "Retoma um cronômetro que estava pausado.",
      inputSchema: {},
      annotations: { title: "Retomar timer", ...MUTATING },
    },
    async () =>
      runTool(async () => {
        const { timer } = await client.resumeTimer();
        return ok(
          `▶️ Timer retomado em ${timer.project.name} com ${timer.elapsedLabel} acumuladas.`,
          { timer },
        );
      }),
  );
}
