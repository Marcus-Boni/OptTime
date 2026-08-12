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
import { prepareTimeEntryTool } from "@/lib/ai/tools/write-tools";
import { formatDuration } from "@/lib/utils";

interface FallbackResult {
  text: string;
  toolName: string | null;
}

const TIME_LOG_PATTERN =
  /(trabalhei|lancei|lançei|registr|apontei|dediquei|fiquei|gastei|fiz)\b/i;
const DURATION_PATTERN = /\d+\s*(h|hora|min|m\b|:\d{2})/i;

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

  // 2. Approvals (managers/admins).
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

  // 3. Team overview.
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

  // 4. Timesheet status / submission.
  if (/timesheet|submet|enviar semana|fechar semana|aprovaç/.test(text)) {
    const period = /passada|anterior/.test(text) ? "last_week" : "this_week";
    await getTimesheetStatusTool.execute({ period }, ctx);

    return {
      toolName: getTimesheetStatusTool.name,
      text: `O status do seu timesheet está no cartão abaixo. O fluxo é **aberto → submetido → aprovado**; se for rejeitado, ele volta a editável com o motivo.`,
    };
  }

  // 5. Timer.
  if (/timer|cronômetro|cronometro|contador/.test(text)) {
    await getActiveTimerTool.execute({}, ctx);
    return {
      toolName: getActiveTimerTool.name,
      text: snapshot.timer.running
        ? `Seu timer está ${snapshot.timer.paused ? "pausado" : "rodando"} há **${formatDuration(snapshot.timer.elapsedMinutes)}**.`
        : "Você não tem nenhum timer em execução agora.",
    };
  }

  // 6. Entry listing.
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

  // 7. Projects.
  if (/projeto/.test(text) && !/hora/.test(text)) {
    await listProjectsTool.execute({}, ctx);
    return {
      toolName: listProjectsTool.name,
      text: "Estes são os projetos ativos em que você pode lançar horas.",
    };
  }

  // 8. Hours / summary / productivity.
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

  // 9. Azure DevOps help.
  if (/azure|devops|azdo|work item/.test(text)) {
    return {
      toolName: null,
      text: `Você vincula horas a work items do Azure DevOps informando o ID com \`#\` (ex.: \`#1234\`) no lançamento. As horas alimentam o campo **Completed Work** automaticamente.\n\nA integração é configurada em **Configurações > Integrações** por um administrador.`,
    };
  }

  // 10. Default briefing.
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
