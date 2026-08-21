import { requireAgentScope } from "@/lib/mcp/auth";
import { resolveLookupDate } from "@/lib/mcp/format";
import { agentOptions, searchParamsOf, withAgentAuth } from "@/lib/mcp/http";
import { getDaySummary } from "@/lib/mcp/service";

/**
 * GET /api/v1/me/summary?date=YYYY-MM-DD
 * Day roll-up: total, per-project breakdown, entries, active timer, capacity.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/summary",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const date = resolveLookupDate(searchParamsOf(req).get("date"));
    return getDaySummary(principal, date);
  },
);
