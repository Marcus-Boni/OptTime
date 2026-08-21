import { addDays } from "date-fns";
import { formatLocalDate, parseLocalDate } from "@/lib/utils";

/**
 * Calendar dates resolved in the organisation's timezone rather than the
 * running process's.
 *
 * `formatLocalDate()` reads the process clock, which is what we want in the
 * browser — there "local" really is the user's timezone. On the server it is
 * not: Azure Web Apps and Vercel run in UTC, so between 21:00 and 23:59 BRT the
 * process is already on the next calendar day and every "today" it computes is
 * one day ahead of the person asking. Anything server-side that means "today"
 * has to go through here.
 */

/** Used when no timezone is configured, or a configured one is not valid. */
const FALLBACK_TIME_ZONE = "America/Sao_Paulo";

/** Falls back to the organisation's timezone for absent or invalid input. */
export function normalizeTimeZone(raw: string | null | undefined): string {
  if (!raw) return FALLBACK_TIME_ZONE;

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: raw });
    return raw;
  } catch {
    return FALLBACK_TIME_ZONE;
  }
}

/**
 * The timezone the organisation books hours in.
 *
 * Read from the environment rather than hardcoded so a deployment in another
 * region does not need a code change, and read per call so tests can swap it.
 */
export function getAppTimeZone(): string {
  return normalizeTimeZone(process.env.APP_TIMEZONE);
}

/** Today's calendar date, `YYYY-MM-DD`, in an explicit timezone. */
export function resolveTodayInTimeZone(timeZone: string): string {
  // "en-CA" formats as YYYY-MM-DD, which is exactly the shape we store.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/** Today's calendar date in the organisation's timezone. */
export function todayInAppTimeZone(): string {
  return resolveTodayInTimeZone(getAppTimeZone());
}

/**
 * Today in the organisation's timezone as a `Date` at local midnight.
 *
 * For date-fns helpers that take a `Date` — week and period maths — where
 * passing a raw `new Date()` would reintroduce the process-clock bug.
 */
export function todayInAppTimeZoneAsDate(): Date {
  return parseLocalDate(todayInAppTimeZone());
}

/**
 * Shifts a `YYYY-MM-DD` string by whole days.
 *
 * Pure calendar arithmetic on the string, so it carries no timezone of its own
 * and cannot drift the way `addDays(new Date(), n)` does on the server.
 */
export function shiftDay(date: string, days: number): string {
  return formatLocalDate(addDays(parseLocalDate(date), days));
}

/**
 * Calendar date (`YYYY-MM-DD`) of an instant in the organisation's timezone.
 *
 * Used to bucket UTC timestamps (Graph events, commits) into the local
 * workday they actually belong to.
 */
export function dateOfInstantInAppTimeZone(instant: Date | string): string {
  const value = typeof instant === "string" ? new Date(instant) : instant;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: getAppTimeZone(),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}
