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
  return dateOfInstantInTimeZone(instant, getAppTimeZone());
}

/**
 * Same, in an explicit timezone.
 *
 * Registro por Colaboração buckets a person's calendar into *their* workday,
 * which is the mailbox timezone — someone travelling would otherwise see the
 * late meetings of one day land on the next. An unknown timezone falls back to
 * the organisation's, so a bad value degrades instead of throwing.
 */
export function dateOfInstantInTimeZone(
  instant: Date | string,
  timeZone: string | null | undefined,
): string {
  const value = typeof instant === "string" ? new Date(instant) : instant;

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizeTimeZone(timeZone),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(value);
}

/**
 * Offset of `timeZone` from UTC at `instant`, in milliseconds (BRT → -10_800_000).
 *
 * Read from the formatter instead of a table so daylight-saving zones stay
 * right without this module knowing which ones observe it.
 */
function zoneOffsetMs(instant: Date, timeZone: string): number {
  const label =
    new Intl.DateTimeFormat("en-US", {
      timeZone: normalizeTimeZone(timeZone),
      timeZoneName: "longOffset",
    })
      .formatToParts(instant)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";

  const match = label.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  if (!match) return 0;

  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return (match[1] === "-" ? -1 : 1) * minutes * 60_000;
}

/**
 * ISO 8601 with a numeric offset, in the given timezone:
 * `2026-10-07T17:00:00Z` in São Paulo becomes `2026-10-07T14:00:00-03:00`.
 *
 * What an assistant needs to show a wall-clock time without guessing the zone.
 */
export function formatInstantWithOffset(
  instant: Date | string,
  timeZone: string,
): string {
  const value = typeof instant === "string" ? new Date(instant) : instant;
  const offsetMs = zoneOffsetMs(value, timeZone);

  // Shifting the instant by the offset makes its UTC fields read as local time.
  const local = new Date(value.getTime() + offsetMs).toISOString().slice(0, 19);

  const totalMinutes = Math.abs(offsetMs) / 60_000;
  const sign = offsetMs < 0 ? "-" : "+";
  const hours = String(Math.floor(totalMinutes / 60)).padStart(2, "0");
  const minutes = String(totalMinutes % 60).padStart(2, "0");

  return `${local}${sign}${hours}:${minutes}`;
}

/** The UTC instant at which calendar day `date` (`YYYY-MM-DD`) begins in `timeZone`. */
export function startOfDayInstant(date: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const wallClockAsUtc = Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1);

  // Two passes: the first offset is read at a guess that can sit on the wrong
  // side of a daylight-saving change, the second at the corrected instant.
  const first =
    wallClockAsUtc - zoneOffsetMs(new Date(wallClockAsUtc), timeZone);
  return new Date(wallClockAsUtc - zoneOffsetMs(new Date(first), timeZone));
}
