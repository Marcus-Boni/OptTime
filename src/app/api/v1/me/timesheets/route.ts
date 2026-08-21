import { requireAgentScope } from "@/lib/mcp/auth";
import { AgentError } from "@/lib/mcp/errors";
import { resolveWeekPeriod } from "@/lib/mcp/format";
import {
  agentOptions,
  readJsonBody,
  searchParamsOf,
  withAgentAuth,
} from "@/lib/mcp/http";
import { getTimesheetStatus, submitTimesheet } from "@/lib/mcp/service";

/**
 *   GET  /api/v1/me/timesheets?period=2026-W33  → status + day-by-day breakdown
 *   POST /api/v1/me/timesheets                  → { action: "submit", period?, force? }
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth(
  "GET /api/v1/me/timesheets",
  async (principal, req) => {
    requireAgentScope(principal, "time:read");

    const period = resolveWeekPeriod(searchParamsOf(req).get("period"));
    return getTimesheetStatus(principal, period);
  },
);

export const POST = withAgentAuth(
  "POST /api/v1/me/timesheets",
  async (principal, req) => {
    const body = await readJsonBody(req);
    const action = typeof body.action === "string" ? body.action : "submit";

    if (action !== "submit") {
      throw new AgentError(
        "VALIDATION_ERROR",
        `Ação "${action}" inválida. A única ação suportada é "submit".`,
      );
    }

    requireAgentScope(principal, "timesheets:submit");

    return submitTimesheet(principal, resolveWeekPeriod(body.period), {
      force: body.force === true,
    });
  },
);
