import { requireAgentScope } from "@/lib/mcp/auth";
import { resolveLookupDate } from "@/lib/mcp/format";
import { agentOptions, searchParamsOf, withAgentAuth } from "@/lib/mcp/http";
import { getDaySummaryWithContext } from "@/lib/mcp/service";

/**
 * GET /api/v1/me/summary?date=YYYY-MM-DD
 * Day roll-up: total, per-project breakdown, entries, active timer, capacity,
 * whether the day is a working day and the day's target.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/summary",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const date = resolveLookupDate(searchParamsOf(req).get("date"));
    return getDaySummaryWithContext(principal, date);
  },
);
