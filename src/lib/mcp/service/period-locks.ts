import { AgentError } from "@/lib/mcp/errors";
import { LockedTimesheetPeriodError } from "@/lib/time-entry-locks";

export function rethrowAgentPeriodError(error: unknown): never {
  if (error instanceof LockedTimesheetPeriodError) {
    throw new AgentError("PERIOD_LOCKED", error.message, {
      details: { date: error.date, timesheetStatus: error.timesheetStatus },
    });
  }

  throw error;
}
