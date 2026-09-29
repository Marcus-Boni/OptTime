/**
 * Server-side composition of one collaboration day.
 *
 * Three independent Graph reads — the calendar (always available, the scope has
 * been granted since day one), the Viva Insights portrait and the mailbox
 * settings — are folded into a single `CollaborationDay`. All three are
 * best-effort: an outage degrades the panel into "nothing detected", never an
 * error page, and a missing optional scope falls back to the old defaults.
 *
 * Shared by the day panel API, the reconstructor and the evening Teams digest,
 * so all three agree on what "your day" means.
 */

import { and, eq, isNull } from "drizzle-orm";
import { allowedEmailDomain } from "@/lib/auth";
import { fetchDayPortrait } from "@/lib/collaboration/analytics";
import { getAcceptedCallIds } from "@/lib/collaboration/call-feedback";
import { fetchTeamCallRecords } from "@/lib/collaboration/call-records";
import { buildDayCallSignals } from "@/lib/collaboration/calls";
import { fuseMeetingsAndCalls } from "@/lib/collaboration/fusion";
import {
  fetchMailboxProfile,
  isAwayOn,
  mailboxTimeZone,
  resolveDailyTarget,
} from "@/lib/collaboration/mailbox";
import {
  buildMeetingSignals,
  type RawCalendarEvent,
} from "@/lib/collaboration/meetings";
import { buildCallRecordsStatus } from "@/lib/collaboration/source-status";
import { db } from "@/lib/db";
import { timeEntry, user } from "@/lib/db/schema";
import {
  fetchMicrosoftObjectId,
  fetchOutlookEvents,
  type OutlookEvent,
} from "@/lib/microsoft-graph";
import { buildMicrosoftMemoryDayWindow } from "@/lib/microsoft-memory/graph-evidence";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";
import { dateOfInstantInTimeZone, shiftDay } from "@/lib/timezone";
import type {
  CollaborationDay,
  DailyTarget,
  MailboxProfile,
} from "@/types/collaboration";

/** Historical fallback: a 40h week spread over five days. */
const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;

/** Graph returns UTC instants; only the app timezone knows where a day ends. */
function toRawCalendarEvent(event: OutlookEvent): RawCalendarEvent {
  return {
    id: event.id,
    subject: event.subject ?? "",
    startIso: `${event.start.dateTime}Z`,
    endIso: `${event.end.dateTime}Z`,
    isAllDay: Boolean(event.isAllDay),
    isCancelled: Boolean(event.isCancelled),
    isOrganizer: Boolean(event.isOrganizer),
    showAs: event.showAs ?? null,
    sensitivity: event.sensitivity ?? null,
    type: event.type ?? null,
    seriesMasterId: event.seriesMasterId ?? null,
    originalStartIso: event.originalStart ?? null,
    isOnlineMeeting: Boolean(event.isOnlineMeeting),
    joinWebUrl: event.onlineMeeting?.joinUrl ?? null,
    onlineMeetingProvider: event.onlineMeetingProvider ?? null,
    responseStatus: event.responseStatus?.response ?? null,
    attendees: (event.attendees ?? []).map((attendee) => ({
      name: attendee.emailAddress?.name ?? null,
      email: attendee.emailAddress?.address ?? null,
      type: attendee.type ?? null,
      response: attendee.status?.response ?? null,
    })),
  };
}

export interface BuildCollaborationDayInput {
  /**
   * Request headers carrying the session cookie — the interactive path.
   * A background job has no session and passes `accessToken` instead.
   */
  headers?: Headers;
  /** Pre-resolved Graph token, for crons (see lib/collaboration/background-token). */
  accessToken?: string | null;
  userId: string;
  userEmail: string | null;
  /** YYYY-MM-DD in the app timezone. */
  date: string;
  /** Skip the Viva portrait — the evening digest only needs the meetings. */
  skipPortrait?: boolean;
  includePrivate?: boolean;
  /** Keep already-logged meetings in the list, flagged. See buildMeetingSignals. */
  keepLogged?: boolean;
}

/**
 * Builds the day. Never throws for a Microsoft-side problem: unreachable
 * sources come back as warnings with `sources` flags turned off.
 */
export async function buildCollaborationDay({
  headers,
  accessToken: providedToken,
  userId,
  userEmail,
  date,
  skipPortrait = false,
  includePrivate = false,
  keepLogged = false,
}: BuildCollaborationDayInput): Promise<CollaborationDay> {
  const warnings: string[] = [];

  const [entries, profile, acceptedCallIds] = await Promise.all([
    db
      .select({
        description: timeEntry.description,
        duration: timeEntry.duration,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, userId),
          eq(timeEntry.date, date),
          isNull(timeEntry.deletedAt),
        ),
      ),
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { weeklyCapacity: true },
    }),
    getAcceptedCallIds(userId, date, date),
  ]);

  const weeklyCapacityHours =
    profile?.weeklyCapacity ?? DEFAULT_WEEKLY_CAPACITY_HOURS;
  const loggedMinutes = entries.reduce((sum, row) => sum + row.duration, 0);
  const existingDescriptions = entries.map((row) => row.description);

  /** Used whenever the mailbox is unreachable — the historical behaviour. */
  const fallbackTarget: DailyTarget = resolveDailyTarget(
    weeklyCapacityHours,
    null,
    date,
  );

  const empty: CollaborationDay = {
    date,
    meetings: [],
    exclusions: [],
    portrait: null,
    loggedMinutes,
    suggestedMinutes: 0,
    target: fallbackTarget,
    away: null,
    sources: { calendar: false, portrait: false, mailbox: false },
    warnings,
    needsReauth: false,
  };

  const accessToken =
    providedToken ??
    (headers ? await getMicrosoftAccessToken(headers, userId) : null);

  if (!accessToken) {
    warnings.push(
      "Reconecte sua conta Microsoft para ver suas reuniões do dia.",
    );
    return empty;
  }

  // ── Mailbox settings: working hours, timezone, out-of-office ──
  // Read first: its timezone decides which local day the calendar rows below
  // belong to, so it cannot be parallelised with the calendar fetch.
  const mailbox: MailboxProfile = await fetchMailboxProfile(
    accessToken,
    userId,
  );
  const personalTimeZone = mailboxTimeZone(mailbox);
  const callsPromise = fetchMicrosoftObjectId(accessToken).then(
    (userAadObjectId) =>
      fetchTeamCallRecords({
        userAadObjectId,
        from: date,
        to: date,
        timeZone: personalTimeZone,
      }),
  );

  const target =
    mailbox.availability === "ok"
      ? resolveDailyTarget(weeklyCapacityHours, mailbox.workingHours, date)
      : fallbackTarget;

  const away =
    mailbox.availability === "ok" && isAwayOn(mailbox.away, date)
      ? mailbox.away
      : null;

  // ── Calendar (the core source) ──
  let calendarAvailable = false;
  let rawEvents: OutlookEvent[] = [];

  try {
    // Widened a day on each side, then filtered to the LOCAL day below.
    rawEvents = await fetchOutlookEvents(
      accessToken,
      `${shiftDay(date, -1)}T12:00:00`,
      `${shiftDay(date, 1)}T12:00:00`,
      { includeExcluded: true },
    );
    calendarAvailable = true;
  } catch (error: unknown) {
    console.error("[collaboration] calendar fetch failed:", error);
    warnings.push("Não foi possível ler sua agenda agora.");
  }

  const events = rawEvents
    .map(toRawCalendarEvent)
    .filter(
      (event) =>
        dateOfInstantInTimeZone(event.startIso, personalTimeZone) === date,
    );

  const { meetings, exclusions } = buildMeetingSignals({
    events,
    userEmail,
    internalDomain: allowedEmailDomain,
    existingDescriptions,
    includePrivate,
    keepLogged,
  });

  const callRecords = await callsPromise;
  const callStatus = buildCallRecordsStatus(callRecords.status);
  if (callRecords.status !== "ok") warnings.push(callStatus.detail);

  const { meetings: fusedMeetings, remainingCalls } = fuseMeetingsAndCalls({
    meetings,
    calls: callRecords.calls,
  });

  const calls = buildDayCallSignals({
    calls: remainingCalls,
    acceptedCallIds,
    date,
    ...buildMicrosoftMemoryDayWindow(date, personalTimeZone ?? undefined),
    // Include logged/private calendar events and fused meetings, preventing hidden or fused meetings from resurfacing as calls.
    calendar: [
      ...fusedMeetings.map((m) => ({ startIso: m.startIso, endIso: m.endIso })),
      ...rawEvents
        .map(toRawCalendarEvent)
        .filter(
          (event) =>
            !event.isCancelled &&
            !event.isAllDay &&
            event.responseStatus !== "declined" &&
            event.showAs !== "free",
        ),
    ],
    existingDescriptions,
    keepLogged,
  });

  // ── Viva Insights portrait (an extra) ──
  const portrait = skipPortrait
    ? null
    : await fetchDayPortrait(accessToken, date);

  if (portrait && portrait.availability !== "ok") {
    // Not a warning: an unlicensed tenant is a configuration state, and the
    // panel explains it in place instead of shouting on every load.
    console.info("[collaboration] portrait unavailable:", {
      userId,
      date,
      availability: portrait.availability,
    });
  }

  // A scope granted in Entra only reaches a session created by a *full* login,
  // so an existing session keeps getting 403 until the person signs in again.
  // The panel turns this into one button instead of a paragraph of steps.
  const needsReauth =
    mailbox.availability === "missing_scope" ||
    portrait?.availability === "missing_scope";

  return {
    date,
    calls,
    callStatus,
    meetings: fusedMeetings,
    exclusions,
    portrait,
    loggedMinutes,
    suggestedMinutes:
      calls.reduce(
        (sum, call) => (call.alreadyLogged ? sum : sum + call.minutes),
        0,
      ) +
      fusedMeetings.reduce(
        (sum, meeting) => (meeting.alreadyLogged ? sum : sum + meeting.minutes),
        0,
      ),
    target,
    away,
    sources: {
      calls: callRecords.status === "ok",
      calendar: calendarAvailable,
      portrait: portrait?.availability === "ok",
      mailbox: mailbox.availability === "ok",
    },
    warnings,
    needsReauth,
  };
}
