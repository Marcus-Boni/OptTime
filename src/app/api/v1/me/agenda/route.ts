import { requireAgentScope } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import { resolveLookupDate } from "@/lib/mcp/format";
import {
  agentOptions,
  booleanParam,
  searchParamsOf,
  withAgentAuth,
} from "@/lib/mcp/http";
import { getMyAgenda } from "@/lib/mcp/service";

/**
 * GET /api/v1/me/agenda?date=&days=&includeDeclined=&includeDescription=
 * The token owner's own Outlook agenda — never anyone else's. Mirror of the
 * `opt_time_get_my_agenda` MCP tool.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/agenda",
  async (principal, req) => {
    requireAgentScope(principal, "calendar:read");

    const params = searchParamsOf(req);
    const rawDays = params.get("days");
    const days = rawDays === null || rawDays === "" ? 1 : Number(rawDays);

    if (!Number.isInteger(days) || days < 1 || days > 7) {
      throw new AgentError(
        "VALIDATION_ERROR",
        "'days' deve ser um inteiro entre 1 e 7.",
      );
    }

    return getMyAgenda(principal, {
      date: resolveLookupDate(params.get("date")),
      days,
      includeDeclined: booleanParam(params, "includeDeclined"),
      includeDescription: booleanParam(params, "includeDescription"),
    });
  },
);
