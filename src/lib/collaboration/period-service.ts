/**
 * Server-side composition of a whole period for Meu Tempo.
 *
 * The day service answers one date at a time, which is right for the panel
 * inside the time sheet and wrong for a month: thirty sequential Graph reads
 * would blow the request budget. Here the calendar and the Viva portrait are
 * each read **once** for the entire range and split locally, while the
 * per-day normalisation still goes through `buildMeetingSignals` so the
 * overlap arithmetic stays identical to what the day panel shows.
 */

import { and, eq, gte, isNull, lte } from "drizzle-orm";
import { allowedEmailDomain } from "@/lib/auth";
import { fetchPortraitRange } from "@/lib/collaboration/analytics";
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
import {
  buildCollaborators,
  buildMeetingLedger,
  buildRituals,
  buildTimeShape,
  enumerateDates,
  formatPeriodLabel,
  mergeSlices,
  weekdayOf,
} from "@/lib/collaboration/period";
import {
  buildCalendarStatus,
  buildMailboxStatus,
  buildPortraitStatus,
  type CalendarOutcome,
  needsReauth,
} from "@/lib/collaboration/source-status";
import { db } from "@/lib/db";
import { project, timeEntry, user } from "@/lib/db/schema";
import {
  fetchOutlookEvents,
  MicrosoftConnectionError,
  type OutlookEvent,
} from "@/lib/microsoft-graph";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";
import { dateOfInstantInTimeZone, shiftDay } from "@/lib/timezone";
import type {
  ActivitySlice,
  CollaborationPeriod,
  MeetingExclusion,
  MeetingSignal,
  PeriodDay,
  ProjectAllocation,
} from "@/types/collaboration";

/** Historical fallback: a 40h week spread over five days. */
const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;
/** A packed month of a lead still fits inside eight pages of 100 events. */
const CALENDAR_PAGES_FOR_RANGE = 8;

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

export interface BuildCollaborationPeriodInput {
  /** Request headers carrying the session cookie — the interactive path. */
  headers?: Headers;
  /** Pre-resolved Graph token, for background jobs. */
  accessToken?: string | null;
  userId: string;
  userEmail: string | null;
  /** YYYY-MM-DD, inclusive. */
  from: string;
  to: string;
  /** Skip the Viva portrait when the caller only needs the meetings. */
  skipPortrait?: boolean;
}

/**
 * Builds the period. Never throws for a Microsoft-side problem: an unreachable
 * source comes back as a warning with its `sources` flag turned off, so the
 * page degrades into "sem dados" instead of an error screen.
 */
export async function buildCollaborationPeriod({
  headers,
  accessToken: providedToken,
  userId,
  userEmail,
  from,
  to,
  skipPortrait = false,
}: BuildCollaborationPeriodInput): Promise<CollaborationPeriod> {
  const warnings: string[] = [];
  const dates = enumerateDates(from, to);

  const [entries, profile] = await Promise.all([
    db
      .select({
        date: timeEntry.date,
        duration: timeEntry.duration,
        billable: timeEntry.billable,
        description: timeEntry.description,
        projectId: timeEntry.projectId,
        projectName: project.name,
        projectColor: project.color,
      })
      .from(timeEntry)
      .innerJoin(project, eq(project.id, timeEntry.projectId))
      .where(
        and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, from),
          lte(timeEntry.date, to),
          isNull(timeEntry.deletedAt),
        ),
      ),
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { weeklyCapacity: true },
    }),
  ]);

  const weeklyCapacityHours =
    profile?.weeklyCapacity ?? DEFAULT_WEEKLY_CAPACITY_HOURS;

  const entriesByDate = new Map<string, typeof entries>();
  for (const entry of entries) {
    const bucket = entriesByDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else entriesByDate.set(entry.date, [entry]);
  }

  const allocationMap = new Map<string, ProjectAllocation>();
  for (const entry of entries) {
    const current = allocationMap.get(entry.projectId);
    if (current) {
      current.minutes += entry.duration;
      if (entry.billable) current.billableMinutes += entry.duration;
      continue;
    }
    allocationMap.set(entry.projectId, {
      projectId: entry.projectId,
      name: entry.projectName,
      color: entry.projectColor,
      minutes: entry.duration,
      billableMinutes: entry.billable ? entry.duration : 0,
    });
  }
  const allocations = [...allocationMap.values()].sort(
    (a, b) => b.minutes - a.minutes,
  );

  const accessToken =
    providedToken ??
    (headers ? await getMicrosoftAccessToken(headers, userId) : null);

  // ── Mailbox first: its timezone decides which local day a meeting is on ──
  const mailbox = accessToken
    ? await fetchMailboxProfile(accessToken, userId)
    : null;
  const personalTimeZone = mailbox ? mailboxTimeZone(mailbox) : null;
  const mailboxOk = mailbox?.availability === "ok";
  const workingHours = mailboxOk ? mailbox.workingHours : null;

  if (!accessToken) {
    warnings.push("Reconecte sua conta Microsoft para ver sua agenda.");
  }

  // ── Calendar: one read for the whole range ──
  let calendarAvailable = false;
  let calendarOutcome: CalendarOutcome = accessToken ? "ok" : "no_token";
  let rawEvents: OutlookEvent[] = [];

  if (accessToken) {
    try {
      rawEvents = await fetchOutlookEvents(
        accessToken,
        `${shiftDay(from, -1)}T12:00:00`,
        `${shiftDay(to, 1)}T12:00:00`,
        { includeExcluded: true, maxPages: CALENDAR_PAGES_FOR_RANGE },
      );
      calendarAvailable = true;
    } catch (error: unknown) {
      console.error("[collaboration-period] calendar fetch failed:", error);
      warnings.push("Não foi possível ler sua agenda agora.");

      // A 401/403 here is a session that predates the consent, not an outage.
      // The difference matters: one is fixed by signing in again, the other
      // only by waiting, and telling someone to wait when a button would fix
      // it is the worst of the two mistakes.
      calendarOutcome =
        error instanceof MicrosoftConnectionError &&
        error.code === "graph_auth_failed"
          ? "auth_failed"
          : "unavailable";
    }
  }

  const eventsByDate = new Map<string, RawCalendarEvent[]>();
  for (const raw of rawEvents) {
    const event = toRawCalendarEvent(raw);
    const date = dateOfInstantInTimeZone(event.startIso, personalTimeZone);
    if (date < from || date > to) continue;

    const bucket = eventsByDate.get(date);
    if (bucket) bucket.push(event);
    else eventsByDate.set(date, [event]);
  }

  // ── Viva portrait: also one read for the whole range ──
  const portraits =
    skipPortrait || !accessToken
      ? null
      : await fetchPortraitRange(accessToken, from, to);

  // ── Per-day fold ──
  const days: PeriodDay[] = [];
  const meetings: MeetingSignal[] = [];
  const exclusions: MeetingExclusion[] = [];
  const sliceGroups: ActivitySlice[][] = [];

  let loggedMeetingMinutes = 0;

  for (const date of dates) {
    const dayEntries = entriesByDate.get(date) ?? [];
    const loggedMinutes = dayEntries.reduce(
      (sum, entry) => sum + entry.duration,
      0,
    );

    const target = resolveDailyTarget(weeklyCapacityHours, workingHours, date);
    const away = mailboxOk && isAwayOn(mailbox?.away ?? null, date);

    // `keepLogged` on purpose: the ledger has to count a meeting that already
    // became a time entry, otherwise the busiest weeks look the emptiest.
    const { meetings: dayMeetings, exclusions: dayExclusions } =
      buildMeetingSignals({
        events: eventsByDate.get(date) ?? [],
        userEmail,
        internalDomain: allowedEmailDomain,
        existingDescriptions: dayEntries.map((entry) => entry.description),
        keepLogged: true,
      });

    meetings.push(...dayMeetings);
    exclusions.push(...dayExclusions);

    const meetingMinutes = dayMeetings.reduce(
      (sum, meeting) => sum + meeting.minutes,
      0,
    );
    loggedMeetingMinutes += dayMeetings.reduce(
      (sum, meeting) => (meeting.alreadyLogged ? sum + meeting.minutes : sum),
      0,
    );

    const portrait = portraits?.byDate.get(date) ?? null;
    if (portrait) sliceGroups.push(portrait.slices);

    days.push({
      date,
      weekday: weekdayOf(date),
      isWorkingDay: target.isWorkingDay,
      targetMinutes: target.minutes,
      loggedMinutes,
      meetingMinutes,
      meetingCount: dayMeetings.length,
      focusMinutes: portrait?.focusMinutes ?? 0,
      collaborationMinutes: portrait?.collaborationMinutes ?? 0,
      hasPortrait: portrait !== null,
      away,
    });
  }

  const cancelledSubjects = exclusions
    .filter((exclusion) => exclusion.reason === "cancelled")
    .map((exclusion) => exclusion.subject);

  const timeZone = personalTimeZone ?? "America/Sao_Paulo";

  const statuses = [
    buildCalendarStatus(calendarOutcome),
    buildPortraitStatus(
      skipPortrait ? null : (portraits?.availability ?? "no_token"),
    ),
    buildMailboxStatus(mailbox?.availability ?? "no_token"),
  ];

  return {
    from,
    to,
    label: formatPeriodLabel(from, to),
    days,
    totals: {
      loggedMinutes: days.reduce((sum, day) => sum + day.loggedMinutes, 0),
      targetMinutes: days.reduce((sum, day) => sum + day.targetMinutes, 0),
      meetingMinutes: days.reduce((sum, day) => sum + day.meetingMinutes, 0),
      collaborationMinutes: days.reduce(
        (sum, day) => sum + day.collaborationMinutes,
        0,
      ),
      focusMinutes: days.reduce((sum, day) => sum + day.focusMinutes, 0),
      loggedMeetingMinutes,
      workingDays: days.filter((day) => day.isWorkingDay).length,
      awayDays: days.filter((day) => day.away).length,
    },
    ledger: buildMeetingLedger(meetings, exclusions),
    meetings,
    collaborators: buildCollaborators(meetings),
    rituals: buildRituals(meetings, cancelledSubjects),
    shape: buildTimeShape({ meetings, days, workingHours, timeZone }),
    allocations,
    slices: mergeSlices(sliceGroups),
    sources: {
      calendar: calendarAvailable,
      portrait: portraits?.availability === "ok",
      mailbox: mailboxOk,
    },
    statuses,
    warnings,
    // A scope granted in Entra only reaches a session created by a *full*
    // login, so an existing session keeps getting 403 until the person signs
    // in again. The page turns this into one button.
    needsReauth: needsReauth(statuses),
  };
}
