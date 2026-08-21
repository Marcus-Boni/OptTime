import { requireAgentScope } from "@/lib/mcp/auth";
import { resolveLookupDate } from "@/lib/mcp/format";
import { agentOptions, searchParamsOf, withAgentAuth } from "@/lib/mcp/http";
import { suggestDailyEntries } from "@/lib/mcp/service";

/**
 * GET /api/v1/me/suggestions?date=YYYY-MM-DD
 * Deterministic fill suggestions built from Azure DevOps commits and the user's
 * recent entries. Never writes anything — the agent must confirm and then call
 * POST /api/v1/me/time-entries.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/suggestions",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const date = resolveLookupDate(searchParamsOf(req).get("date"));
    return suggestDailyEntries(principal, date);
  },
);
