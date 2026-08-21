import { agentOptions, withAgentAuth } from "@/lib/mcp/http";
import { getDaySummary } from "@/lib/mcp/service";
import { todayInAppTimeZone } from "@/lib/timezone";

/**
 * GET /api/v1/me
 * Identity behind the personal access token, plus today's totals. Agents call
 * this first to verify a setup before writing anything.
 */
export const OPTIONS = agentOptions;

export const GET = withAgentAuth("GET /api/v1/me", async (principal) => {
  const today = await getDaySummary(principal, todayInAppTimeZone());

  return {
    user: {
      id: principal.userId,
      name: principal.name,
      email: principal.email,
      role: principal.role,
    },
    token: {
      name: principal.tokenName,
      scopes: principal.scopes,
      legacy: principal.legacy,
    },
    capacity: {
      weeklyMinutes: today.weeklyCapacityMinutes,
      dailyMinutes: today.dailyCapacityMinutes,
    },
    today: {
      date: today.date,
      totalMinutes: today.totalMinutes,
      totalLabel: today.totalLabel,
      remainingMinutes: today.remainingMinutes,
      entryCount: today.entryCount,
      activeTimer: today.activeTimer,
    },
  };
});
