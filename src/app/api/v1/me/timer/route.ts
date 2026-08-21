import { requireAgentScope } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import { agentOptions, readJsonBody, withAgentAuth } from "@/lib/mcp/http";
import {
  discardTimerTime,
  getActiveTimer,
  pauseTimer,
  resumeTimer,
  startTimer,
  stopTimer,
  updateTimer,
} from "@/lib/mcp/service";

/**
 * Timer control.
 *
 *   GET  /api/v1/me/timer          → the running timer, or null
 *   POST /api/v1/me/timer          → { action: "start" | "stop" | "pause" | "resume" | "discard" | "update" }
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth("GET /api/v1/me/timer", async (principal) => {
  requireAgentScope(principal, "time:read");
  return { timer: await getActiveTimer(principal) };
});

export const POST = withAgentAuth(
  "POST /api/v1/me/timer",
  async (principal, req) => {
    requireAgentScope(principal, "time:write");

    const body = await readJsonBody(req);
    const action = typeof body.action === "string" ? body.action : "start";

    switch (action) {
      case "stop":
        return stopTimer(principal);

      case "pause":
        return { timer: await pauseTimer(principal) };

      case "resume":
        return { timer: await resumeTimer(principal) };

      // Drops a stretch of time from the running timer — how the editor
      // extension applies "descartar os 30 min de inatividade".
      case "discard":
        return discardTimerTime(
          principal,
          typeof body.minutes === "number" ? body.minutes : Number.NaN,
        );

      // Edits the running timer without restarting it — used to attach a Work
      // Item detected from the Git branch.
      case "update":
        return {
          timer: await updateTimer(principal, {
            description:
              typeof body.description === "string"
                ? body.description
                : undefined,
            billable:
              typeof body.billable === "boolean" ? body.billable : undefined,
            azureWorkItemId:
              typeof body.azureWorkItemId === "number"
                ? body.azureWorkItemId
                : body.azureWorkItemId === null
                  ? null
                  : undefined,
            azureWorkItemTitle:
              typeof body.azureWorkItemTitle === "string"
                ? body.azureWorkItemTitle
                : undefined,
          }),
        };

      case "start": {
        const project =
          typeof body.projectId === "string"
            ? body.projectId
            : typeof body.project === "string"
              ? body.project
              : null;

        if (!project) {
          throw new AgentError(
            "VALIDATION_ERROR",
            "Informe 'projectId' (aceita ID, código ou nome).",
          );
        }

        return startTimer(principal, {
          project,
          description:
            typeof body.description === "string" ? body.description : "",
          azureWorkItemId:
            typeof body.azureWorkItemId === "number"
              ? body.azureWorkItemId
              : null,
          azureWorkItemTitle:
            typeof body.azureWorkItemTitle === "string"
              ? body.azureWorkItemTitle
              : null,
          billable: typeof body.billable === "boolean" ? body.billable : null,
        });
      }

      default:
        throw new AgentError(
          "VALIDATION_ERROR",
          `Ação "${action}" inválida. Use start, stop, pause, resume, discard ou update.`,
        );
    }
  },
);
