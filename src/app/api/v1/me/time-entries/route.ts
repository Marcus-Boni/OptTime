import { requireAgentScope } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import {
  parseDurationMinutes,
  resolveEntryDate,
  resolveLookupDate,
} from "@/lib/mcp/format";
import {
  agentOptions,
  readJsonBody,
  searchParamsOf,
  withAgentAuth,
} from "@/lib/mcp/http";
import { listTimeEntries, logTime } from "@/lib/mcp/service";

/**
 *   GET  /api/v1/me/time-entries?from=&to=&projectId=&limit=
 *   POST /api/v1/me/time-entries   → creates a manual entry
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/time-entries",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const params = searchParamsOf(req);
    const from = resolveLookupDate(params.get("from"));
    const to = params.get("to") ? resolveLookupDate(params.get("to")) : from;

    if (to < from) {
      throw new AgentError(
        "VALIDATION_ERROR",
        "A data final não pode ser anterior à data inicial.",
      );
    }

    const limit = Number.parseInt(params.get("limit") ?? "", 10);

    const entries = await listTimeEntries(principal, {
      from,
      to,
      projectRef: params.get("projectId"),
      limit: Number.isFinite(limit) ? limit : null,
    });

    return {
      entries,
      count: entries.length,
      totalMinutes: entries.reduce(
        (sum, item) => sum + item.durationMinutes,
        0,
      ),
      from,
      to,
    };
  },
);

export const POST = withAgentAuth(
  "POST /api/v1/me/time-entries",
  async (principal, req) => {
    requireAgentScope(principal, "time:write");

    const body = await readJsonBody(req);
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

    if (typeof body.description !== "string" || !body.description.trim()) {
      throw new AgentError(
        "VALIDATION_ERROR",
        "Informe 'description' com o que foi feito.",
      );
    }

    return logTime(principal, {
      project,
      durationMinutes: parseDurationMinutes(
        body.durationMinutes ?? body.duration,
      ),
      description: body.description,
      date: resolveEntryDate(body.date),
      azureWorkItemId:
        typeof body.azureWorkItemId === "number" ? body.azureWorkItemId : null,
      azureWorkItemTitle:
        typeof body.azureWorkItemTitle === "string"
          ? body.azureWorkItemTitle
          : null,
      billable: typeof body.billable === "boolean" ? body.billable : null,
    });
  },
  { status: 201 },
);
