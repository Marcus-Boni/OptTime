/**
 * Command parser + executor for the Teams outgoing webhook
 * (`@OptSolv timer start Projeto | descrição`, `@OptSolv hoje`, …).
 *
 * Execution rides on the same service layer the MCP server uses, so a command
 * typed in Teams obeys exactly the same rules (locks, single timer, project
 * resolution) as the app and the agents. Replies are Teams-flavored markdown.
 */

import { eq } from "drizzle-orm";
import { API_TOKEN_SCOPES } from "@/lib/api-tokens.shared";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import type { AgentPrincipal } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import { getDaySummary, getRangeBreakdown } from "@/lib/mcp/service/entries";
import {
  getActiveTimer,
  pauseTimer,
  startTimer,
  stopTimer,
} from "@/lib/mcp/service/timer";
import { todayInAppTimeZone } from "@/lib/timezone";
import { formatDuration, getPeriodRange, getWeekPeriod } from "@/lib/utils";

export type TeamsCommand =
  | { kind: "timer_start"; project: string; description: string }
  | { kind: "timer_stop" }
  | { kind: "timer_pause" }
  | { kind: "timer_status" }
  | { kind: "today" }
  | { kind: "week" }
  | { kind: "help" }
  | { kind: "unknown"; input: string };

const HELP_TEXT = [
  "**Comandos OptSolv Time** ⏱️",
  "",
  "- `timer start <projeto> | <descrição>` — inicia o timer",
  "- `timer stop` — para o timer e registra as horas",
  "- `timer pause` — pausa o timer",
  "- `timer` — mostra o timer atual",
  "- `hoje` — resumo das horas de hoje",
  "- `semana` — resumo da semana atual",
  "- `ajuda` — esta mensagem",
].join("\n");

export function parseTeamsCommand(text: string): TeamsCommand {
  const normalized = text
    .replace(/^\/?optsolv\s*/i, "")
    .trim()
    .replace(/\s+/g, " ");

  if (!normalized) return { kind: "help" };

  const lower = normalized.toLowerCase();

  if (lower === "ajuda" || lower === "help" || lower === "?") {
    return { kind: "help" };
  }
  if (lower === "hoje" || lower === "today") return { kind: "today" };
  if (lower === "semana" || lower === "week") return { kind: "week" };

  if (lower.startsWith("timer")) {
    const rest = normalized.slice("timer".length).trim();
    const restLower = rest.toLowerCase();

    if (!rest || restLower === "status") return { kind: "timer_status" };
    if (restLower === "stop" || restLower === "parar") {
      return { kind: "timer_stop" };
    }
    if (restLower === "pause" || restLower === "pausar") {
      return { kind: "timer_pause" };
    }

    if (restLower.startsWith("start") || restLower.startsWith("iniciar")) {
      const args = rest.replace(/^(start|iniciar)\s*/i, "").trim();
      if (!args) return { kind: "unknown", input: normalized };

      const [projectPart, ...descriptionParts] = args.split("|");
      const project = (projectPart ?? "").trim();
      const description =
        descriptionParts.join("|").trim() || "Foco via Microsoft Teams";

      if (!project) return { kind: "unknown", input: normalized };
      return { kind: "timer_start", project, description };
    }
  }

  return { kind: "unknown", input: normalized };
}

/** Full-scope synthetic principal for a Teams-authenticated user. */
function buildTeamsPrincipal(row: {
  id: string;
  name: string;
  email: string;
  role: string;
}): AgentPrincipal {
  const role =
    row.role === "admin" || row.role === "manager" ? row.role : "member";

  return {
    userId: row.id,
    name: row.name,
    email: row.email,
    role,
    scopes: [...API_TOKEN_SCOPES],
    tokenId: null,
    tokenName: "Microsoft Teams",
    legacy: false,
  };
}

/** Maps the Teams sender (Entra object id) to an active app user. */
export async function resolveTeamsUser(
  aadObjectId: string | null | undefined,
): Promise<AgentPrincipal | null> {
  if (!aadObjectId) return null;

  const row = await db.query.user.findFirst({
    where: eq(user.azureId, aadObjectId),
    columns: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!row || !row.isActive) return null;
  return buildTeamsPrincipal(row);
}

export async function executeTeamsCommand(
  principal: AgentPrincipal,
  command: TeamsCommand,
): Promise<string> {
  try {
    switch (command.kind) {
      case "help":
        return HELP_TEXT;

      case "timer_start": {
        const result = await startTimer(principal, {
          project: command.project,
          description: command.description,
        });

        const lines = [
          `▶️ Timer iniciado em **${result.timer.project.name}** — _${result.timer.description}_`,
        ];
        if (result.replaced) {
          lines.push(
            `O timer anterior em **${result.replaced.projectName}** foi salvo com ${formatDuration(result.replaced.durationMinutes)}.`,
          );
        }
        return lines.join("\n\n");
      }

      case "timer_stop": {
        const result = await stopTimer(principal);
        if (!result.saved) {
          return "⏹️ Timer descartado — rodou menos de 1 minuto, nada foi registrado.";
        }
        return `⏹️ **${result.durationLabel}** registradas em **${result.project.name}** (${result.date}).`;
      }

      case "timer_pause": {
        const timer = await pauseTimer(principal);
        return `⏸️ Timer pausado em **${timer.project.name}** com ${timer.elapsedLabel} acumulados.`;
      }

      case "timer_status": {
        const timer = await getActiveTimer(principal);
        if (!timer) {
          return "Nenhum timer ativo. Use `timer start <projeto> | <descrição>` para começar.";
        }
        const stateLabel = timer.isPaused ? "pausado" : "rodando";
        return `⏱️ Timer ${stateLabel} em **${timer.project.name}** — _${timer.description}_ (${timer.elapsedLabel}).`;
      }

      case "today": {
        const today = todayInAppTimeZone();
        const summary = await getDaySummary(principal, today);

        const lines = [
          `**Hoje (${summary.weekday})** — ${summary.totalLabel} de ${formatDuration(summary.dailyCapacityMinutes)}`,
        ];

        if (summary.byProject.length > 0) {
          lines.push(
            summary.byProject
              .slice(0, 5)
              .map((item) => `- ${item.projectName}: **${item.label}**`)
              .join("\n"),
          );
        } else {
          lines.push("_Nenhuma hora registrada ainda._");
        }

        if (summary.activeTimer) {
          lines.push(
            `⏱️ Timer ativo em **${summary.activeTimer.project.name}** (${summary.activeTimer.elapsedLabel}).`,
          );
        }

        return lines.join("\n\n");
      }

      case "week": {
        const today = todayInAppTimeZone();
        const { start, end } = getPeriodRange(getWeekPeriod(today), "weekly");
        const breakdown = await getRangeBreakdown(principal, start, end);

        const lines = [
          `**Semana atual** — ${formatDuration(breakdown.totalMinutes)} registradas`,
        ];

        if (breakdown.byProject.length > 0) {
          lines.push(
            breakdown.byProject
              .slice(0, 6)
              .map((item) => `- ${item.projectName}: **${item.label}**`)
              .join("\n"),
          );
        } else {
          lines.push("_Nenhuma hora registrada nesta semana._");
        }

        return lines.join("\n\n");
      }

      case "unknown":
        return `Não entendi \`${command.input}\`. ${"\n\n"}${HELP_TEXT}`;

      default:
        return HELP_TEXT;
    }
  } catch (error: unknown) {
    if (error instanceof AgentError) {
      return `⚠️ ${error.message}`;
    }

    console.error("[teams] command execution failed:", error);
    return "⚠️ Algo deu errado ao executar o comando. Tente novamente em instantes.";
  }
}
