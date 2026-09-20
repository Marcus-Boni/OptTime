/**
 * Working hours, timezone and out-of-office, from the person's own mailbox.
 *
 * Three assumptions were hardcoded in the product before this: everyone works
 * five days a week, everyone lives in one timezone, and everyone should be
 * nudged to close the day — including someone on holiday. `/me/mailboxSettings`
 * replaces all three with what the person actually configured in Outlook.
 *
 * Delegated `MailboxSettings.Read`, gated in lib/auth. Absent permission is an
 * availability state, never an exception: every consumer falls back to the old
 * defaults, so the feature degrades instead of breaking.
 */

import { normalizeTimeZone } from "@/lib/timezone";
import type {
  AwayPeriod,
  DailyTarget,
  MailboxAvailability,
  MailboxProfile,
  WorkingHours,
} from "@/types/collaboration";

const GRAPH_MAILBOX_URL = "https://graph.microsoft.com/v1.0/me/mailboxSettings";
const CALL_TIMEOUT_MS = 8_000;
/** Mailbox settings change a few times a year; re-reading per request is waste. */
const CACHE_TTL_MS = 30 * 60_000;
/** The historical assumption, kept as the fallback everywhere. */
export const DEFAULT_WORKING_DAYS_PER_WEEK = 5;

// ─── Windows ↔ IANA timezones ─────────────────────────────────────────

/**
 * Graph reports mailbox timezones as Windows names ("E. South America Standard
 * Time"), while `Intl` only speaks IANA. This covers Brazil in full plus the
 * zones an OptSolv traveller realistically hits; anything unmapped falls back
 * to the organisation's timezone, which is the current behaviour anyway.
 */
const WINDOWS_TO_IANA: Record<string, string> = {
  // Brazil
  "e. south america standard time": "America/Sao_Paulo",
  "central brazilian standard time": "America/Cuiaba",
  "sa western standard time": "America/Manaus",
  "sa eastern standard time": "America/Belem",
  "tocantins standard time": "America/Araguaina",
  "bahia standard time": "America/Bahia",
  "fernando de noronha standard time": "America/Noronha",
  // Americas
  "argentina standard time": "America/Argentina/Buenos_Aires",
  "sa pacific standard time": "America/Bogota",
  "pacific sa standard time": "America/Santiago",
  "eastern standard time": "America/New_York",
  "us eastern standard time": "America/New_York",
  "central standard time": "America/Chicago",
  "central standard time (mexico)": "America/Mexico_City",
  "mountain standard time": "America/Denver",
  "pacific standard time": "America/Los_Angeles",
  // Europe
  utc: "UTC",
  "gmt standard time": "Europe/London",
  "greenwich standard time": "Atlantic/Reykjavik",
  "w. europe standard time": "Europe/Berlin",
  "romance standard time": "Europe/Paris",
  "central europe standard time": "Europe/Budapest",
  "central european standard time": "Europe/Warsaw",
  "gtb standard time": "Europe/Bucharest",
  "russian standard time": "Europe/Moscow",
  // Asia-Pacific
  "india standard time": "Asia/Kolkata",
  "china standard time": "Asia/Shanghai",
  "singapore standard time": "Asia/Singapore",
  "tokyo standard time": "Asia/Tokyo",
  "korea standard time": "Asia/Seoul",
  "aus eastern standard time": "Australia/Sydney",
  "new zealand standard time": "Pacific/Auckland",
};

/**
 * Resolves a Graph timezone name to IANA.
 *
 * A value containing "/" is already IANA and passes through. Anything else is
 * looked up as a Windows name; an unknown one returns null so the caller can
 * fall back rather than silently booking hours in the wrong day.
 */
export function resolveTimeZone(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;

  if (value.includes("/")) {
    // Round-trips through the validator so an invalid IANA name is rejected.
    const normalized = normalizeTimeZone(value);
    return normalized === value ? value : null;
  }

  return WINDOWS_TO_IANA[value.toLowerCase()] ?? null;
}

// ─── Graph payload ────────────────────────────────────────────────────

const ISO_WEEKDAY: Record<string, number> = {
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sunday: 7,
};

interface GraphDateTimeTimeZone {
  dateTime?: string;
  timeZone?: string;
}

interface GraphMailboxSettings {
  timeZone?: string;
  workingHours?: {
    daysOfWeek?: string[];
    startTime?: string;
    endTime?: string;
    timeZone?: { name?: string };
  };
  automaticRepliesSetting?: {
    status?: string;
    scheduledStartDateTime?: GraphDateTimeTimeZone;
    scheduledEndDateTime?: GraphDateTimeTimeZone;
  };
}

/** "09:00:00.0000000" → 540. Returns null for anything unparseable. */
export function parseClockMinutes(value: string | undefined): number | null {
  if (!value) return null;

  const parts = value.split(":");
  const hours = Number.parseInt(parts[0] ?? "", 10);
  const minutes = Number.parseInt(parts[1] ?? "", 10);

  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;

  return hours * 60 + minutes;
}

export function parseWorkingHours(
  raw: GraphMailboxSettings["workingHours"],
): WorkingHours | null {
  if (!raw) return null;

  const startMinute = parseClockMinutes(raw.startTime);
  const endMinute = parseClockMinutes(raw.endTime);
  if (startMinute === null || endMinute === null || endMinute <= startMinute) {
    return null;
  }

  const daysOfWeek = (raw.daysOfWeek ?? [])
    .map((day) => ISO_WEEKDAY[day.trim().toLowerCase()])
    .filter((day): day is number => day !== undefined)
    .sort((a, b) => a - b);

  if (daysOfWeek.length === 0) return null;

  return {
    daysOfWeek,
    startMinute,
    endMinute,
    windowMinutes: endMinute - startMinute,
    timeZone: resolveTimeZone(raw.timeZone?.name),
  };
}

/** Graph omits the trailing Z on these local-ish timestamps. */
function toIso(value: GraphDateTimeTimeZone | undefined): string | null {
  const raw = value?.dateTime?.trim();
  if (!raw) return null;
  const withZone = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`;
  const parsed = new Date(withZone);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function parseAwayPeriod(
  raw: GraphMailboxSettings["automaticRepliesSetting"],
): AwayPeriod | null {
  const status = raw?.status?.trim().toLowerCase();
  if (!status || status === "disabled") return null;

  if (status === "alwaysenabled") {
    return { kind: "always", startIso: null, endIso: null };
  }

  if (status === "scheduled") {
    return {
      kind: "scheduled",
      startIso: toIso(raw?.scheduledStartDateTime),
      endIso: toIso(raw?.scheduledEndDateTime),
    };
  }

  return null;
}

/** Whether an away period covers a given `YYYY-MM-DD`. */
export function isAwayOn(away: AwayPeriod | null, date: string): boolean {
  if (!away) return false;
  if (away.kind === "always") return true;

  // Compare against the whole local day, so a half-day auto-reply still counts.
  const dayStart = new Date(`${date}T00:00:00.000Z`).getTime();
  const dayEnd = dayStart + 86_400_000;

  const start = away.startIso ? new Date(away.startIso).getTime() : -Infinity;
  const end = away.endIso ? new Date(away.endIso).getTime() : Infinity;

  return start < dayEnd && end > dayStart;
}

// ─── Daily target ─────────────────────────────────────────────────────

/**
 * How many minutes this person is expected to log on this specific day.
 *
 * The working window is used as a **cap**, never as the target: Outlook models
 * 09:00–18:00 as nine hours, but nobody bills the lunch hour, so taking the
 * window at face value would inflate everyone's goal and leave the whole team
 * permanently "behind". The weekly capacity stays the source of the amount —
 * the mailbox only corrects how many days it is spread across, and whether
 * today is a working day at all.
 */
export function resolveDailyTarget(
  weeklyCapacityHours: number,
  workingHours: WorkingHours | null,
  date: string,
): DailyTarget {
  const weeklyMinutes = Math.max(0, weeklyCapacityHours) * 60;

  if (!workingHours) {
    return {
      minutes: Math.round(weeklyMinutes / DEFAULT_WORKING_DAYS_PER_WEEK),
      basis: "weekly_capacity",
      isWorkingDay: true,
      workingDaysPerWeek: DEFAULT_WORKING_DAYS_PER_WEEK,
    };
  }

  const workingDaysPerWeek = workingHours.daysOfWeek.length;
  // `YYYY-MM-DD` at UTC noon dodges any DST edge when reading the weekday.
  const weekday = new Date(`${date}T12:00:00.000Z`).getUTCDay();
  const isoWeekday = weekday === 0 ? 7 : weekday;
  const isWorkingDay = workingHours.daysOfWeek.includes(isoWeekday);

  if (!isWorkingDay) {
    return {
      minutes: 0,
      basis: "non_working_day",
      isWorkingDay: false,
      workingDaysPerWeek,
    };
  }

  const spread = Math.round(weeklyMinutes / workingDaysPerWeek);

  return {
    minutes: Math.min(spread, workingHours.windowMinutes),
    basis: "working_hours",
    isWorkingDay: true,
    workingDaysPerWeek,
  };
}

// ─── Fetch ────────────────────────────────────────────────────────────

interface CacheEntry {
  expiresAt: number;
  value: MailboxProfile;
}

const cache = new Map<string, CacheEntry>();

function availabilityFromStatus(status: number): MailboxAvailability {
  if (status === 401) return "no_token";
  if (status === 403) return "missing_scope";
  return "unavailable";
}

function emptyProfile(availability: MailboxAvailability): MailboxProfile {
  return {
    workingHours: null,
    timeZone: null,
    away: null,
    availability,
  };
}

/** Drops a person's cached mailbox profile — used after a settings change. */
export function invalidateMailboxProfile(userId: string): void {
  cache.delete(userId);
}

/**
 * Reads the person's mailbox settings, cached for 30 minutes per user.
 *
 * Never throws: any failure returns a profile carrying the reason, so callers
 * keep working on the historical defaults.
 */
export async function fetchMailboxProfile(
  accessToken: string,
  userId: string,
): Promise<MailboxProfile> {
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const response = await fetch(GRAPH_MAILBOX_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const availability = availabilityFromStatus(response.status);

      if (availability === "unavailable") {
        console.error("[collaboration-mailbox] graph error:", {
          status: response.status,
        });
      }

      // Cached too: a tenant without the scope would otherwise retry on every
      // page load, adding a doomed Graph round-trip to each request.
      const profile = emptyProfile(availability);
      cache.set(userId, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        value: profile,
      });
      return profile;
    }

    const data = (await response.json()) as GraphMailboxSettings;
    const workingHours = parseWorkingHours(data.workingHours);

    const profile: MailboxProfile = {
      workingHours,
      timeZone: resolveTimeZone(data.timeZone),
      away: parseAwayPeriod(data.automaticRepliesSetting),
      availability: "ok",
    };

    cache.set(userId, { expiresAt: Date.now() + CACHE_TTL_MS, value: profile });
    return profile;
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return emptyProfile("unavailable");
    }

    console.error("[collaboration-mailbox] fetchMailboxProfile:", error);
    return emptyProfile("unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/** The timezone to bucket this person's calendar into, or null for the default. */
export function mailboxTimeZone(profile: MailboxProfile | null): string | null {
  return profile?.workingHours?.timeZone ?? profile?.timeZone ?? null;
}
