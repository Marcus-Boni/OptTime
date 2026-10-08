import {
  fetchMailboxProfile,
  isAwayOn,
  resolveDailyTarget,
} from "@/lib/collaboration/mailbox";
import { parseLocalDate } from "@/lib/utils";
import type { MailboxProfile } from "@/types/collaboration";
import type { AgentPrincipal } from "../auth";
import { type DaySummary, getDaySummary } from "./entries";
import { getAgentMicrosoftToken } from "./microsoft";

/**
 * Whether a day is a working day for this person, and how much they are
 * expected to log on it.
 *
 * OptTime keeps no holiday calendar. What it does know comes from the person's
 * own mailbox: the working days and hours they configured in Outlook, and an
 * out-of-office period. When Microsoft is unreachable the answer degrades to
 * "weekdays, at the weekly capacity" instead of failing the summary.
 */

export interface DayContext {
  /** False on weekends, non-working days and out-of-office periods. */
  isWorkday: boolean;
  /** What the person is expected to log that day. 0 when it is not a workday. */
  targetMinutes: number;
}

export interface ResolveDayContextInput {
  date: string;
  weeklyCapacityHours: number;
  dailyCapacityMinutes: number;
  /** Null when the mailbox could not be read. */
  mailbox: MailboxProfile | null;
}

/** Pure decision: weekend → mailbox working days → out-of-office. */
export function resolveDayContext(input: ResolveDayContextInput): DayContext {
  const weekday = parseLocalDate(input.date).getDay();
  const isWeekend = weekday === 0 || weekday === 6;

  if (isWeekend) return { isWorkday: false, targetMinutes: 0 };

  if (!input.mailbox || input.mailbox.availability !== "ok") {
    return { isWorkday: true, targetMinutes: input.dailyCapacityMinutes };
  }

  if (isAwayOn(input.mailbox.away, input.date)) {
    return { isWorkday: false, targetMinutes: 0 };
  }

  const target = resolveDailyTarget(
    input.weeklyCapacityHours,
    input.mailbox.workingHours,
    input.date,
  );

  return {
    isWorkday: target.isWorkingDay,
    targetMinutes: target.isWorkingDay ? target.minutes : 0,
  };
}

/** Collaborators the summary needs, injectable so the logic runs offline. */
export interface DayContextDeps {
  getToken: (principal: AgentPrincipal) => Promise<string | null>;
  loadMailbox: (accessToken: string, userId: string) => Promise<MailboxProfile>;
}

const defaultDeps: DayContextDeps = {
  getToken: getAgentMicrosoftToken,
  loadMailbox: fetchMailboxProfile,
};

export type DaySummaryWithContext = DaySummary & DayContext;

/** The day summary plus `isWorkday` and `targetMinutes`. */
export async function getDaySummaryWithContext(
  principal: AgentPrincipal,
  date: string,
  deps: DayContextDeps = defaultDeps,
): Promise<DaySummaryWithContext> {
  const summary = await getDaySummary(principal, date);

  // Working hours and out-of-office come from the person's calendar settings,
  // so they are only read for tokens that may read the calendar.
  let mailbox: MailboxProfile | null = null;
  try {
    const token = principal.scopes.includes("calendar:read")
      ? await deps.getToken(principal)
      : null;
    mailbox = token ? await deps.loadMailbox(token, principal.userId) : null;
  } catch (error: unknown) {
    console.error("[mcp][day_context] mailbox unavailable", {
      userId: principal.userId,
      error: error instanceof Error ? error.message : "unknown",
    });
  }

  return {
    ...summary,
    ...resolveDayContext({
      date,
      weeklyCapacityHours: summary.weeklyCapacityMinutes / 60,
      dailyCapacityMinutes: summary.dailyCapacityMinutes,
      mailbox,
    }),
  };
}
