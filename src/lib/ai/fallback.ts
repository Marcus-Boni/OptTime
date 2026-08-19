import type { AssistantSnapshot } from "@/lib/ai/context";
import { parseDurationText } from "@/lib/ai/duration";
import {
  getActiveTimerTool,
  getPendingApprovalsTool,
  getTeamOverviewTool,
  getTimesheetStatusTool,
  getWorkSummaryTool,
  listProjectsTool,
  listTimeEntriesTool,
} from "@/lib/ai/tools/read-tools";
import type { ToolContext } from "@/lib/ai/tools/types";
import {
  navigateToTool,
  prepareTimeEntryTool,
  runUiCommandTool,
} from "@/lib/ai/tools/write-tools";
import { formatDuration } from "@/lib/utils";

interface FallbackResult {
  text: string;
  toolName: string | null;
}

const TIME_LOG_PATTERN =
  /(trabalhei|lancei|lançei|registr|apontei|dediquei|fiquei|gastei|fiz)\b/i;
const DURATION_PATTERN = /\d+\s*(h|hora|min|m\b|:\d{2})/i;

/** "abre", "me leva para", "quero ver a tela de…" and friends. */
const NAVIGATION_PATTERN =
  /(abr(?:a|ir|e)|ir para|v[áa] para|vai para|me lev[ae]|leve[ -]?me|navegar|acess(?:ar|e)|ver a tela|mostrar? a tela|volt(?:ar|e) para)/i;

/**
 * Destination keywords, most specific first: "horas da equipe" must win over
 * the bare "equipe", and "operador" over the generic "configurações".
 */
const NAVIGATION_HINTS: Array<{ target: string; pattern: RegExp }> = [
  { target: "operator_settings", pattern: /operador|autonomia|piloto autom/i },
  { target: "azure_devops", pattern: /azure|devops|azdo/i },
  { target: "integrations", pattern: /integra[çc]/i },
  { target: "approvals", pattern: /aprova[çc]|aprovar/i },
  { target: "team_hours", pattern: /horas da equipe|carga da equipe/i },
  { target: "people", pattern: /pessoas|colaboradores/i },
  { target: "project_scopes", pattern: /escopos?/i },
  { target: "projects", pattern: /projetos?/i },
  { target: "suggestions", pattern: /sugest/i },
  { target: "releases", pattern: /novidades|releases|vers[õo]es/i },
  { target: "profile", pattern: /perfil|minha conta/i },
  { target: "settings", pattern: /configura[çc]|prefer[êe]ncias|ajustes/i },
  {
    target: "time",
    pattern:
      /registro de horas|lan[çc]amentos?|apontamento|minhas horas|timesheet|calend[áa]rio/i,
  },
  { target: "dashboard", pattern: /dashboard|in[íi]cio|home|painel/i },
];

/** Interface commands recognisable without a model. */
const UI_COMMAND_HINTS: Array<{ command: string; pattern: RegExp }> = [
  {
    command: "focus_mode_start",
    pattern: /modo foco|pomodoro|quero focar|preciso focar|me ajuda a focar/i,
  },
  { command: "theme_dark", pattern: /tema escuro|modo escuro|dark mode/i },
  { command: "theme_light", pattern: /tema claro|modo claro|light mode/i },
  { command: "weekly_digest", pattern: /resumo semanal|digest/i },
  { command: "shortcuts", pattern: /atalhos?( de teclado)?/i },
  {
    command: "quick_timer",
    pattern: /iniciar cron[óo]metro|come[çc]ar timer/i,
  },
  {
    command: "quick_entry",
    pattern: /lan[çc]amento r[áa]pido|formul[áa]rio de horas/i,
  },
];

/**
 * Deterministic assistant used when no LLM provider is configured or every
 * provider fails. It still reads live data through the same tool layer, so
 * answers stay factual instead of degrading to canned text.
 */
export async function runFallbackAssistant(
  message: string,
  ctx: ToolContext,
  snapshot: AssistantSnapshot,
): Promise<FallbackResult> {
  const text = message.toLowerCase();

  // 1. Time logging intent — the highest-value path.
  if (TIME_LOG_PATTERN.test(text) && DURATION_PATTERN.test(text)) {
    const durationMinutes = parseDurationText(message) ?? 60;
    const workItemMatch = message.match(/#(\d{1,7})/);
    const projectHint = snapshot.topProjects.find(
      (project) =>
        text.includes(project.name.toLowerCase()) ||
        text.includes(project.code.toLowerCase()),
    );

    await prepareTimeEntryTool.execute(
      {
        project: projectHint?.id,
        description: cleanDescription(message),
        durationMinutes,
        azureWorkItemId: workItemMatch
          ? Number.parseInt(workItemMatch[1], 10)
          : undefined,
      },
      ctx,
    );

    return {
      toolName: prepareTimeEntryTool.name,
      text: `Preparei o lançamento de **${formatDuration(durationMinutes)}**. Confira os dados no cartão abaixo e confirme para registrar.`,
    };
  }

  // 2. Interface commands — "quero focar", "tema escuro".
  const uiHint = UI_COMMAND_HINTS.find((hint) => hint.pattern.test(text));
  if (uiHint) {
    const result = await runUiCommandTool.execute(
      { command: uiHint.command },
      ctx,
    );

    return { toolName: runUiCommandTool.name, text: `${result.label}.` };
  }

  // 3. Navigation — "abre os projetos", "me leva para as aprovações".
  if (NAVIGATION_PATTERN.test(text)) {
    const hint = NAVIGATION_HINTS.find((item) => item.pattern.test(text));

    if (hint) {
      const result = await navigateToTool.execute({ target: hint.target }, ctx);

      return { toolName: navigateToTool.name, text: `${result.label}.` };
    }
  }

  // 4. Approvals (managers/admins).
  if (
    /aprova|pendente de aprova|preciso aprovar|fila de aprova/.test(text) &&
    ctx.actor.role !== "member"
  ) {
    const result = await getPendingApprovalsTool.execute({}, ctx);
    const count = readNumber(result.data, "count");

    return {
      toolName: getPendingApprovalsTool.name,
      text:
        count > 0
          ? `Você tem **${count}** timesheet(s) aguardando aprovação.`
          : "Não há timesheets aguardando sua aprovação no momento. ✅",
    };
  }

  // 5. Team overview.
  if (
    /(equipe|time|colaboradores|meu pessoal)/.test(text) &&
    ctx.actor.role !== "member"
  ) {
    await getTeamOverviewTool.execute({ period: "this_week" }, ctx);
    return {
      toolName: getTeamOverviewTool.name,
      text: "Aqui está a carga da sua equipe nesta semana.",
    };
  }

  // 6. Timesheet status / submission.
  if (/timesheet|submet|enviar semana|fechar semana|aprovaç/.test(text)) {
    const period = /passada|anterior/.test(text) ? "last_week" : "this_week";
    await getTimesheetStatusTool.execute({ period }, ctx);

    return {
      toolName: getTimesheetStatusTool.name,
      text: `O status do seu timesheet está no cartão abaixo. O fluxo é **aberto → submetido → aprovado**; se for rejeitado, ele volta a editável com o motivo.`,
    };
  }

  // 7. Timer.
  if (/timer|cronômetro|cronometro|contador/.test(text)) {
    await getActiveTimerTool.execute({}, ctx);
    return {
      toolName: getActiveTimerTool.name,
      text: snapshot.timer.running
        ? `Seu timer está ${snapshot.timer.paused ? "pausado" : "rodando"} há **${formatDuration(snapshot.timer.elapsedMinutes)}**.`
        : "Você não tem nenhum timer em execução agora.",
    };
  }

  // 8. Entry listing.
  if (
    /lançamento|lancamento|entradas|o que registrei|meus registros/.test(text)
  ) {
    const period = resolvePeriodFromText(text);
    await listTimeEntriesTool.execute({ period }, ctx);
    return {
      toolName: listTimeEntriesTool.name,
      text: "Estes são os seus lançamentos do período.",
    };
  }

  // 9. Projects.
  if (/projeto/.test(text) && !/hora/.test(text)) {
    await listProjectsTool.execute({}, ctx);
    return {
      toolName: listProjectsTool.name,
      text: "Estes são os projetos ativos em que você pode lançar horas.",
    };
  }

  // 10. Hours / summary / productivity.
  if (
    /hora|resumo|quanto|total|produtiv|relat[óo]rio|semana|m[êe]s/.test(text)
  ) {
    const period = resolvePeriodFromText(text);
    const result = await getWorkSummaryTool.execute({ period }, ctx);
    const total = readString(result.data, "totalFormatted");
    const balance = readNumber(result.data, "balanceMinutes");

    const balanceText =
      balance >= 0
        ? `**${formatDuration(balance)}** acima da meta`
        : `**${formatDuration(Math.abs(balance))}** abaixo da meta`;

    return {
      toolName: getWorkSummaryTool.name,
      text: `Você registrou **${total}** no período — ${balanceText}.`,
    };
  }

  // 11. Azure DevOps help.
  if (/azure|devops|azdo|work item/.test(text)) {
    return {
      toolName: null,
      text: `Você vincula horas a work items do Azure DevOps informando o ID com \`#\` (ex.: \`#1234\`) no lançamento. As horas alimentam o campo **Completed Work** automaticamente.\n\nA integração é configurada em **Configurações > Integrações** por um administrador.`,
    };
  }

  // 12. Default briefing.
  return { toolName: null, text: buildBriefing(snapshot) };
}

function buildBriefing(snapshot: AssistantSnapshot): string {
  const lines = [
    `Hoje você registrou **${formatDuration(snapshot.todayMinutes)}** e nesta semana **${formatDuration(snapshot.weekMinutes)}** de ${formatDuration(snapshot.weekTargetMinutes)}.`,
  ];

  if (snapshot.timer.running) {
    lines.push(
      `Há um timer ${snapshot.timer.paused ? "pausado" : "rodando"} em **${snapshot.timer.projectName ?? "um projeto"}** (${formatDuration(snapshot.timer.elapsedMinutes)}).`,
    );
  }

  if (snapshot.incompleteDays.length > 0) {
    lines.push(
      `Atenção: ${snapshot.incompleteDays.map((day) => day.weekday).join(", ")} ainda estão abaixo de 6h.`,
    );
  }

  if (snapshot.pendingApprovals > 0) {
    lines.push(
      `Você tem **${snapshot.pendingApprovals}** timesheet(s) da equipe aguardando aprovação.`,
    );
  }

  lines.push(
    "",
    "Posso ajudar com: lançar horas, resumo do período, status do timesheet e busca de work items.",
  );

  return lines.join("\n");
}

function resolvePeriodFromText(text: string) {
  if (/hoje/.test(text)) return "today" as const;
  if (/ontem/.test(text)) return "yesterday" as const;
  if (/semana passada|semana anterior/.test(text)) return "last_week" as const;
  if (/m[êe]s passado|m[êe]s anterior/.test(text)) return "last_month" as const;
  if (/este m[êe]s|no m[êe]s|mensal/.test(text)) return "this_month" as const;
  return "this_week" as const;
}

/** Strips the duration and filler verbs so the description reads cleanly. */
function cleanDescription(message: string): string {
  const cleaned = message
    .replace(/^\s*(trabalhei|lancei|lançei|registrei|apontei|fiz)\s*/i, "")
    .replace(/\b\d+[.,]?\d*\s*(h(oras?)?|m(in(utos?)?)?)\b/gi, "")
    .replace(/\b\d{1,2}:\d{2}\b/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned.length >= 3 ? cleaned : message.trim();
}

function readNumber(data: unknown, key: string): number {
  if (data && typeof data === "object" && key in data) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "number") return value;
  }
  return 0;
}

function readString(data: unknown, key: string): string {
  if (data && typeof data === "object" && key in data) {
    const value = (data as Record<string, unknown>)[key];
    if (typeof value === "string") return value;
  }
  return "0h";
}
