import type { ToolExecutionResult } from "@/lib/ai/tools/types";
import {
  assertTimeEntryDateUnlocked,
  LockedTimesheetPeriodError,
} from "@/lib/time-entry-locks";

export async function getTimeEntryPeriodBlock(
  userId: string,
  date: string,
  timesheetId?: string | null,
): Promise<ToolExecutionResult | null> {
  try {
    await assertTimeEntryDateUnlocked({ userId, date, timesheetId });
  } catch (error: unknown) {
    if (!(error instanceof LockedTimesheetPeriodError)) throw error;

    return {
      label: "Período bloqueado",
      data: {
        status: "period_locked",
        date,
        message: error.message,
      },
    };
  }
  return null;
}
