/**
 * Shared types for Registro por Colaboração — the evidence layer for people
 * whose work leaves no trace in Azure DevOps.
 *
 * Kept free of server imports so client components can consume them directly.
 */

// ─── Meetings ─────────────────────────────────────────────────────────

/** How the person related to the invitation. `declined` never becomes a signal. */
export type MeetingAcceptance =
  | "organizer"
  | "accepted"
  | "tentative"
  | "not_responded"
  | "declined";

/** Shape of the gathering, derived from the attendee count and recurrence. */
export type MeetingShape = "one_on_one" | "small_group" | "workshop" | "ritual";

/**
 * Why an event on the calendar did not become a signal.
 *
 * Surfaced in the UI on purpose: a leader whose agenda is constantly
 * rescheduled needs to see that the system noticed, not silently drop rows.
 */
export type MeetingExclusionReason =
  | "cancelled"
  | "declined"
  | "free_time"
  | "out_of_office"
  | "all_day"
  | "series_master"
  | "private"
  | "too_short"
  | "overlapped"
  | "already_logged";

export interface MeetingParticipant {
  name: string;
  email: string | null;
  /** Outside the organization's e-mail domain. */
  isExternal: boolean;
  isOptional: boolean;
}

export interface MeetingSignal {
  /** Graph event id — stable per occurrence, changes when an occurrence is moved. */
  id: string;
  /** Groups occurrences of the same recurring series. */
  seriesId: string | null;
  /** Human title, e.g. "Reunião com Marcus Boni e +2". */
  title: string;
  /** Original calendar subject, kept for project matching and auditing. */
  subject: string;
  startIso: string;
  endIso: string;
  /** Billable-rounded duration, already clipped for overlaps. */
  minutes: number;
  /** Raw calendar duration before overlap clipping. */
  scheduledMinutes: number;
  participants: MeetingParticipant[];
  /** Total invited people besides the user — may exceed `participants.length`. */
  participantCount: number;
  externalCount: number;
  acceptance: MeetingAcceptance;
  shape: MeetingShape;
  isOnline: boolean;
  isOrganizer: boolean;
  /** Part of a recurring series. */
  isRecurring: boolean;
  /** A recurring occurrence that was moved or edited away from the series. */
  isException: boolean;
  /** Trimmed because it overlapped a stronger meeting. */
  wasClipped: boolean;
  /**
   * A time entry for this meeting already exists.
   *
   * Only ever true when the caller asked to keep logged meetings: the day
   * panel wants what is left to do, while the picker inside the entry form
   * wants the whole day marked, so "Já registrado" stays visible instead of
   * a meeting silently disappearing from the list.
   */
  alreadyLogged: boolean;
  confidence: "high" | "medium" | "low";
  /** One-line pt-BR justification shown under the item. */
  evidence: string;
}

export interface MeetingExclusion {
  id: string;
  subject: string;
  reason: MeetingExclusionReason;
  minutes: number;
}

// ─── Daily activity portrait (Viva Insights) ──────────────────────────

export type ActivityKind = "meeting" | "call" | "chat" | "email" | "focus";

export interface ActivitySlice {
  kind: ActivityKind;
  minutes: number;
}

/** Why the portrait is missing, when it is. */
export type PortraitAvailability =
  | "ok"
  | "missing_scope"
  | "unlicensed"
  | "no_token"
  | "unavailable";

export interface DayPortrait {
  date: string;
  slices: ActivitySlice[];
  /** meeting + call + chat + email. */
  collaborationMinutes: number;
  focusMinutes: number;
  totalMinutes: number;
  availability: PortraitAvailability;
}

// ─── Mailbox settings (working hours, timezone, out of office) ────────

export type MailboxAvailability =
  | "ok"
  | "missing_scope"
  | "no_token"
  | "unavailable";

export interface WorkingHours {
  /** ISO weekday numbers the person works: 1 = Monday … 7 = Sunday. */
  daysOfWeek: number[];
  /** Minutes from midnight, in `timeZone`. */
  startMinute: number;
  endMinute: number;
  /** Length of the working window — an upper bound, not the target. */
  windowMinutes: number;
  /** IANA name, resolved from the Windows name Graph returns. */
  timeZone: string | null;
}

/** An active out-of-office auto-reply. */
export interface AwayPeriod {
  /** "always" when the auto-reply carries no schedule. */
  kind: "always" | "scheduled";
  startIso: string | null;
  endIso: string | null;
}

export interface MailboxProfile {
  workingHours: WorkingHours | null;
  /** Mailbox timezone (IANA); falls back for `workingHours.timeZone`. */
  timeZone: string | null;
  away: AwayPeriod | null;
  availability: MailboxAvailability;
}

/** How the day's target was reached — shown so the number is never a mystery. */
export type DailyTargetBasis =
  | "working_hours"
  | "weekly_capacity"
  | "non_working_day";

export interface DailyTarget {
  minutes: number;
  basis: DailyTargetBasis;
  /** False when the person does not work this weekday. */
  isWorkingDay: boolean;
  /** Working days per week, from the mailbox or the 5-day default. */
  workingDaysPerWeek: number;
}

// ─── Composed response ────────────────────────────────────────────────

export interface CollaborationSources {
  calendar: boolean;
  portrait: boolean;
  /** Working hours and out-of-office came from the mailbox, not a default. */
  mailbox: boolean;
}

export interface CollaborationDay {
  date: string;
  meetings: MeetingSignal[];
  exclusions: MeetingExclusion[];
  portrait: DayPortrait | null;
  /** Minutes already registered as time entries for the day. */
  loggedMinutes: number;
  /** Sum of `minutes` across meetings not yet logged. */
  suggestedMinutes: number;
  /** How much this person is expected to log on this specific day. */
  target: DailyTarget;
  /** Set when an out-of-office auto-reply covers the day. */
  away: AwayPeriod | null;
  sources: CollaborationSources;
  warnings: string[];
  /**
   * A Microsoft permission the session does not carry yet. The UI turns this
   * into a one-click "entrar novamente", since only a full login adds scopes.
   */
  needsReauth: boolean;
}
