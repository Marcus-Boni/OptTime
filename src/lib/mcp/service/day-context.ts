import {
  fetchMailboxProfile,
  isAwayOn,
  resolveDailyTarget,
} from "@/lib/collaboration/mailbox";
import { parseLocalDate } from "@/lib/utils";
import type { AwayPeriod, MailboxProfile } from "@/types/collaboration";
import type { AgentPrincipal } from "../auth";
import { type DaySummary, getDaySummary } from "./entries";
import { getAgentMicrosoftToken } from "./microsoft";

/**
 * Whether a day is a working day for this person, and how much they are
 * expected to log on it.
 *
 * OptTime keeps no holiday calendar. What it does know comes from the person's
 * own mailbox: the working days and hours they configured in Outlook, and a
 * *scheduled* out-of-office period. When Microsoft is unreachable the answer
 * degrades to "weekdays, at the weekly capacity" instead of failing the summary.
 */

/** Said when an automatic reply that never ends is deliberately ignored. */
export const ALWAYS_ON_AWAY_WARNING =
  "A resposta automática do Outlook está sempre ligada; ela não foi tratada como ausência.";

export interface DayContext {
  /** False on weekends, non-working days and scheduled out-of-office periods. */
  isWorkday: boolean;
  /**
   * What the person is expected to log that day: the weekly capacity already
   * adjusted to the Outlook working window, and 0 when it is not a workday.
   */
  targetMinutes: number;
  /** Things the answer glossed over, e.g. an always-on automatic reply. */
  warnings: string[];
}

export interface ResolveDayContextInput {
  date: string;
  weeklyCapacityHours: number;
  dailyCapacityMinutes: number;
  /** Null when the mailbox could not be read. */
  mailbox: MailboxProfile | null;
}

/**
 * An automatic reply with no end: "always on", or scheduled with neither a
 * start nor an end. It says nothing about any particular day.
 */
function isOpenEndedAway(away: AwayPeriod | null): boolean {
  if (!away) return false;
  return away.kind === "always" || (!away.startIso && !away.endIso);
}

/**
 * Pure decision: weekend → mailbox working days → scheduled out-of-office.
 *
 * Only a *scheduled* automatic reply covering the day counts as absence. Someone
 * who leaves the reply on permanently would otherwise never have a working day,
 * and anything keyed on `isWorkday` would never run for them.
 */
export function resolveDayContext(input: ResolveDayContextInput): DayContext {
  const weekday = parseLocalDate(input.date).getDay();
  const isWeekend = weekday === 0 || weekday === 6;

  if (isWeekend) return { isWorkday: false, targetMinutes: 0, warnings: [] };

  if (!input.mailbox || input.mailbox.availability !== "ok") {
    return {
      isWorkday: true,
      targetMinutes: input.dailyCapacityMinutes,
      warnings: [],
    };
  }

  const warnings: string[] = [];
  const { away } = input.mailbox;

  if (isOpenEndedAway(away)) {
    warnings.push(ALWAYS_ON_AWAY_WARNING);
  } else if (isAwayOn(away, input.date)) {
    return { isWorkday: false, targetMinutes: 0, warnings };
  }

  const target = resolveDailyTarget(
    input.weeklyCapacityHours,
    input.mailbox.workingHours,
    input.date,
  );

  return {
    isWorkday: target.isWorkingDay,
    targetMinutes: target.isWorkingDay ? target.minutes : 0,
    warnings,
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
