/**
 * Turns a raw Outlook/Teams calendar day into work signals.
 *
 * The calendar of a lead is not a tidy list: invitations get declined, series
 * occurrences get moved, two meetings sit on the same half hour and half the
 * blocks are placeholders. Everything this module drops is reported back as a
 * `MeetingExclusion`, so the UI can say *why* eleven events became six signals
 * instead of silently losing five.
 *
 * Pure by construction — every input is passed in, so preview, re-runs and
 * unit tests all agree.
 */

import {
  buildMeetingEvidence,
  buildMeetingTitle,
  cleanSubject,
  foldText,
  looksLikeRitual,
} from "@/lib/collaboration/naming";
import type {
  MeetingAcceptance,
  MeetingExclusion,
  MeetingExclusionReason,
  MeetingParticipant,
  MeetingShape,
  MeetingSignal,
} from "@/types/collaboration";

/** Rounding unit shared with the reconstructor. */
const QUARTER_MINUTES = 15;
/** Below this a calendar block is a reminder, not work worth logging. */
const MIN_MEETING_MINUTES = 10;
/** A single meeting longer than this is almost always a forgotten block. */
const MAX_MEETING_MINUTES = 240;
/** Attendees beyond this make the meeting a workshop, not a conversation. */
const WORKSHOP_THRESHOLD = 6;
/** Graph returns large invites truncated; keep the list readable regardless. */
const MAX_STORED_PARTICIPANTS = 12;
/** Below this, a difference against `originalStart` is rounding, not a move. */
const RESCHEDULE_TOLERANCE_MS = 60_000;

export interface RawCalendarAttendee {
  name: string | null;
  email: string | null;
  /** "required" | "optional" | "resource" */
  type: string | null;
  /** "none" | "organizer" | "tentativelyAccepted" | "accepted" | "declined" | "notResponded" */
  response: string | null;
}

/** A Graph calendarView event, flattened and timezone-resolved by the caller. */
export interface RawCalendarEvent {
  id: string;
  subject: string;
  startIso: string;
  endIso: string;
  isAllDay: boolean;
  isCancelled: boolean;
  isOrganizer: boolean;
  /** "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown" */
  showAs: string | null;
  /** "normal" | "personal" | "private" | "confidential" */
  sensitivity: string | null;
  /** "singleInstance" | "occurrence" | "exception" | "seriesMaster" */
  type: string | null;
  seriesMasterId: string | null;
  /** Original slot of a moved occurrence — Graph only fills it on exceptions. */
  originalStartIso: string | null;
  isOnlineMeeting: boolean;
  onlineMeetingProvider: string | null;
  /** The signed-in user's own response to the invitation. */
  responseStatus: string | null;
  attendees: RawCalendarAttendee[];
}

export interface BuildMeetingSignalsInput {
  events: RawCalendarEvent[];
  /** The signed-in user, filtered out of their own attendee list. */
  userEmail: string | null;
  /** Everything outside this domain counts as an external participant. */
  internalDomain: string;
  /** Descriptions already registered for the day — prevents a second entry. */
  existingDescriptions: string[];
  /** Include blocks the person marked as personal or private. Default false. */
  includePrivate?: boolean;
  /**
   * Keep meetings that already have a time entry, flagged `alreadyLogged`,
   * instead of moving them to `exclusions`.
   *
   * The day panel wants what is left to do. The picker inside the entry form
   * wants the whole day marked — a meeting vanishing from the list is worse
   * than one shown as "Já registrado".
   */
  keepLogged?: boolean;
}

export interface MeetingSignalsResult {
  meetings: MeetingSignal[];
  exclusions: MeetingExclusion[];
}

// ─── Small helpers ────────────────────────────────────────────────────

function roundToQuarter(minutes: number): number {
  return Math.max(
    QUARTER_MINUTES,
    Math.round(minutes / QUARTER_MINUTES) * QUARTER_MINUTES,
  );
}

function minutesBetween(startMs: number, endMs: number): number {
  return Math.max(0, (endMs - startMs) / 60_000);
}

function normalizeResponse(value: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveAcceptance(event: RawCalendarEvent): MeetingAcceptance {
  const response = normalizeResponse(event.responseStatus);
  if (event.isOrganizer || response === "organizer") return "organizer";
  if (response === "accepted") return "accepted";
  if (response === "tentativelyaccepted") return "tentative";
  if (response === "declined") return "declined";
  return "not_responded";
}

/** Strength order used to decide which meeting wins an overlapping slot. */
const ACCEPTANCE_RANK: Record<MeetingAcceptance, number> = {
  organizer: 0,
  accepted: 1,
  tentative: 2,
  not_responded: 3,
  declined: 4,
};

function isExternalEmail(
  email: string | null,
  internalDomain: string,
): boolean {
  if (!email) return false;
  const domain = internalDomain.replace(/^@/, "").toLowerCase();
  if (!domain) return false;
  return !email.trim().toLowerCase().endsWith(`@${domain}`);
}

/**
 * True when a series occurrence no longer sits where the recurrence put it.
 *
 * `isException` alone is too loose: Outlook marks an occurrence as an
 * exception when the organizer only edits its subject or body. The minute
 * tolerance absorbs the timezone rounding Graph applies to `originalStart`.
 */
function isRescheduled(event: RawCalendarEvent, startMs: number): boolean {
  if (!event.originalStartIso) return false;
  const originalMs = new Date(event.originalStartIso).getTime();
  if (Number.isNaN(originalMs)) return false;
  return Math.abs(originalMs - startMs) >= RESCHEDULE_TOLERANCE_MS;
}

function resolveShape(
  participantCount: number,
  isRecurring: boolean,
  subject: string,
): MeetingShape {
  if (participantCount === 1) return "one_on_one";
  if (isRecurring || looksLikeRitual(subject)) return "ritual";
  if (participantCount >= WORKSHOP_THRESHOLD) return "workshop";
  return "small_group";
}

function buildParticipants(
  event: RawCalendarEvent,
  userEmail: string | null,
  internalDomain: string,
): MeetingParticipant[] {
  const me = userEmail?.trim().toLowerCase() ?? null;

  return event.attendees
    .filter((attendee) => {
      const type = (attendee.type ?? "").toLowerCase();
      if (type === "resource") return false;
      // Declined attendees were not in the room.
      if (normalizeResponse(attendee.response) === "declined") return false;
      const email = attendee.email?.trim().toLowerCase() ?? null;
      if (me && email === me) return false;
      return Boolean(attendee.name?.trim() || email);
    })
    .map((attendee) => ({
      name: attendee.name?.trim() || (attendee.email ?? "").split("@")[0] || "",
      email: attendee.email?.trim() ?? null,
      isExternal: isExternalEmail(attendee.email, internalDomain),
      isOptional: (attendee.type ?? "").toLowerCase() === "optional",
    }))
    .slice(0, MAX_STORED_PARTICIPANTS);
}

// ─── Overlap arithmetic ───────────────────────────────────────────────

type Interval = [start: number, end: number];

/** Minutes of [start, end) not already covered by the merged `claimed` list. */
function freeMinutes(start: number, end: number, claimed: Interval[]): number {
  let free = 0;
  let cursor = start;

  for (const [claimStart, claimEnd] of claimed) {
    if (claimEnd <= cursor) continue;
    if (claimStart >= end) break;
    if (claimStart > cursor) free += Math.min(claimStart, end) - cursor;
    cursor = Math.max(cursor, claimEnd);
    if (cursor >= end) break;
  }

  if (cursor < end) free += end - cursor;
  return free / 60_000;
}

/** Inserts an interval and merges it with anything it touches. */
function claimInterval(claimed: Interval[], next: Interval): Interval[] {
  const merged: Interval[] = [];
  let [start, end] = next;

  for (const current of claimed) {
    if (current[1] < start) {
      merged.push(current);
      continue;
    }
    if (current[0] > end) {
      merged.push(current);
      continue;
    }
    start = Math.min(start, current[0]);
    end = Math.max(end, current[1]);
  }

  merged.push([start, end]);
  return merged.sort((a, b) => a[0] - b[0]);
}

// ─── Exclusion pass ───────────────────────────────────────────────────

interface Candidate {
  event: RawCalendarEvent;
  startMs: number;
  endMs: number;
  scheduledMinutes: number;
  acceptance: MeetingAcceptance;
  participants: MeetingParticipant[];
  participantCount: number;
}

function firstExclusionReason(
  event: RawCalendarEvent,
  scheduledMinutes: number,
  acceptance: MeetingAcceptance,
  includePrivate: boolean,
): MeetingExclusionReason | null {
  if (event.isCancelled) return "cancelled";
  if (event.isAllDay) return "all_day";
  // A series master is the recurrence rule itself, never a moment in the day.
  if ((event.type ?? "").toLowerCase() === "seriesmaster")
    return "series_master";
  if (acceptance === "declined") return "declined";

  const showAs = (event.showAs ?? "").toLowerCase();
  if (showAs === "free") return "free_time";
  if (showAs === "oof") return "out_of_office";

  if (!includePrivate) {
    const sensitivity = (event.sensitivity ?? "").toLowerCase();
    if (sensitivity === "personal" || sensitivity === "private")
      return "private";
  }

  if (scheduledMinutes < MIN_MEETING_MINUTES) return "too_short";
  return null;
}

// ─── Main entry point ─────────────────────────────────────────────────

/**
 * Normalizes one local calendar day into signals plus the audit trail of what
 * was dropped and why.
 *
 * Events must already be filtered to the target day by the caller — Graph
 * returns UTC instants and only the caller knows the app timezone.
 */
export function buildMeetingSignals({
  events,
  userEmail,
  internalDomain,
  existingDescriptions,
  includePrivate = false,
  keepLogged = false,
}: BuildMeetingSignalsInput): MeetingSignalsResult {
  const exclusions: MeetingExclusion[] = [];
  const candidates: Candidate[] = [];

  // ── 1. Drop what is not work, keeping the reason ──
  for (const event of events) {
    const startMs = new Date(event.startIso).getTime();
    const endMs = new Date(event.endIso).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
      continue;
    }

    const scheduledMinutes = minutesBetween(startMs, endMs);
    const acceptance = resolveAcceptance(event);
    const reason = firstExclusionReason(
      event,
      scheduledMinutes,
      acceptance,
      includePrivate,
    );

    if (reason) {
      exclusions.push({
        id: event.id,
        subject: cleanSubject(event.subject) || "Compromisso",
        reason,
        minutes: Math.round(scheduledMinutes),
      });
      continue;
    }

    const participants = buildParticipants(event, userEmail, internalDomain);
    const invited = event.attendees.filter((attendee) => {
      const type = (attendee.type ?? "").toLowerCase();
      if (type === "resource") return false;
      if (normalizeResponse(attendee.response) === "declined") return false;
      const email = attendee.email?.trim().toLowerCase() ?? null;
      return !(userEmail && email === userEmail.trim().toLowerCase());
    }).length;

    candidates.push({
      event,
      startMs,
      endMs,
      scheduledMinutes,
      acceptance,
      participants,
      participantCount: invited,
    });
  }

  // ── 2. Resolve double-booking: the strongest commitment owns the slot ──
  const ordered = [...candidates].sort((a, b) => {
    const byAcceptance =
      ACCEPTANCE_RANK[a.acceptance] - ACCEPTANCE_RANK[b.acceptance];
    if (byAcceptance !== 0) return byAcceptance;
    if (a.participantCount !== b.participantCount) {
      return b.participantCount - a.participantCount;
    }
    if (a.startMs !== b.startMs) return a.startMs - b.startMs;
    return b.scheduledMinutes - a.scheduledMinutes;
  });

  const alreadyLogged = new Set(
    existingDescriptions.map((description) => foldText(description)),
  );

  let claimed: Interval[] = [];
  const signals: MeetingSignal[] = [];

  for (const candidate of ordered) {
    const { event } = candidate;
    const available = freeMinutes(candidate.startMs, candidate.endMs, claimed);

    if (available < MIN_MEETING_MINUTES) {
      exclusions.push({
        id: event.id,
        subject: cleanSubject(event.subject) || "Compromisso",
        reason: "overlapped",
        minutes: Math.round(candidate.scheduledMinutes),
      });
      continue;
    }

    const wasClipped = available < candidate.scheduledMinutes - 1;
    const minutes = Math.min(roundToQuarter(available), MAX_MEETING_MINUTES);

    const eventType = (event.type ?? "").toLowerCase();
    const isException = eventType === "exception";
    const wasRescheduled = isRescheduled(event, candidate.startMs);
    const isRecurring =
      isException ||
      eventType === "occurrence" ||
      Boolean(event.seriesMasterId);

    const shape = resolveShape(
      candidate.participantCount,
      isRecurring,
      event.subject,
    );

    const title = buildMeetingTitle({
      subject: event.subject,
      participants: candidate.participants,
      participantCount: candidate.participantCount,
      shape,
      isOrganizer: candidate.acceptance === "organizer",
    });

    const isLogged =
      alreadyLogged.has(foldText(title)) ||
      alreadyLogged.has(foldText(cleanSubject(event.subject)));

    // Claim the slot either way: those minutes are already on the timesheet,
    // so anything overlapping them must still be clipped, or the same hour
    // gets proposed twice.
    claimed = claimInterval(claimed, [candidate.startMs, candidate.endMs]);

    if (isLogged && !keepLogged) {
      exclusions.push({
        id: event.id,
        subject: cleanSubject(event.subject) || "Compromisso",
        reason: "already_logged",
        minutes: Math.round(candidate.scheduledMinutes),
      });
      continue;
    }

    const externalCount = candidate.participants.filter(
      (person) => person.isExternal,
    ).length;

    signals.push({
      id: event.id,
      seriesId: event.seriesMasterId,
      title,
      subject: cleanSubject(event.subject),
      startIso: event.startIso,
      endIso: event.endIso,
      minutes,
      scheduledMinutes: Math.round(candidate.scheduledMinutes),
      participants: candidate.participants,
      participantCount: candidate.participantCount,
      externalCount,
      acceptance: candidate.acceptance,
      shape,
      isOnline:
        event.isOnlineMeeting ||
        (event.onlineMeetingProvider ?? "").toLowerCase().includes("teams"),
      isOrganizer: candidate.acceptance === "organizer",
      isRecurring,
      isException,
      wasRescheduled,
      originalStartIso: wasRescheduled ? event.originalStartIso : null,
      wasClipped,
      alreadyLogged: isLogged,
      confidence: resolveConfidence(candidate.acceptance, wasClipped),
      evidence: buildMeetingEvidence({
        shape,
        participantCount: candidate.participantCount,
        externalCount,
        isRecurring,
        isException,
        wasClipped,
        isOnline: event.isOnlineMeeting,
        acceptance: candidate.acceptance,
      }),
    });
  }

  signals.sort(
    (a, b) => new Date(a.startIso).getTime() - new Date(b.startIso).getTime(),
  );

  return { meetings: signals, exclusions };
}

function resolveConfidence(
  acceptance: MeetingAcceptance,
  wasClipped: boolean,
): MeetingSignal["confidence"] {
  if (acceptance === "not_responded") return "low";
  if (acceptance === "tentative" || wasClipped) return "medium";
  return "high";
}

/**
 * Groups signals by recurring series so the UI can say "3 ocorrências do Daily"
 * instead of listing the same ritual three times.
 */
export function groupBySeries(
  meetings: MeetingSignal[],
): Map<string, MeetingSignal[]> {
  const groups = new Map<string, MeetingSignal[]>();

  for (const meeting of meetings) {
    const key = meeting.seriesId ?? meeting.id;
    const current = groups.get(key);
    if (current) current.push(meeting);
    else groups.set(key, [meeting]);
  }

  return groups;
}

/** pt-BR label for an exclusion, used in the "não considerei" summary. */
export const EXCLUSION_LABELS: Record<MeetingExclusionReason, string> = {
  cancelled: "cancelada",
  declined: "recusada por você",
  free_time: "marcada como livre",
  out_of_office: "fora do escritório",
  all_day: "compromisso de dia inteiro",
  series_master: "regra de recorrência",
  private: "particular",
  too_short: "curta demais",
  overlapped: "sobreposta a outra reunião",
  already_logged: "já lançada",
};
