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
  /**
   * The occurrence was moved out of the slot the series had reserved for it.
   *
   * Graph only reports `originalStart` on exceptions, so this is never true
   * for a one-off meeting that was dragged around before anyone accepted it.
   */
  wasRescheduled: boolean;
  /** Where the occurrence was originally scheduled, when it was moved. */
  originalStartIso: string | null;
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
  /** meeting + call + chat + email — time that was occupied. */
  collaborationMinutes: number;
  /**
   * Microsoft's "focus hours": the sum of every block of at least two
   * consecutive hours with no meeting, inside the configured working hours.
   *
   * This is **availability, not measured work**, and it must never be added to
   * `collaborationMinutes` in the UI — an empty calendar would read as a week
   * of deep work.
   */
  focusMinutes: number;
  /** Both of the above. Kept for "is there anything to show", never rendered. */
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

// ─── Source health ────────────────────────────────────────────────────

export type SourceId = "calendar" | "portrait" | "mailbox" | "azure_devops";

export type SourceHealth =
  /** Answered normally. */
  | "ok"
  /** Granted in Entra, but this session predates the consent. */
  | "needs_reauth"
  /** The person never connected this integration. */
  | "not_connected"
  /** Connected, but the account has no licence for it. */
  | "unlicensed"
  /** Transient: the service was unreachable or errored. */
  | "unavailable";

/**
 * What each integration had to say, in a shape the UI can act on.
 *
 * Free-text warnings were the first attempt and failed the people who needed
 * them most: "reconecte sua conta" ended up as grey 11px text at the bottom of
 * a page of zeros. A status carries the reason *and* the button that fixes it.
 */
export interface SourceStatus {
  id: SourceId;
  /** How the person calls this integration. */
  label: string;
  health: SourceHealth;
  /** One sentence explaining the consequence, not the HTTP error. */
  detail: string;
  /** What the UI should offer. `null` when there is nothing to do. */
  action: "reauth" | "connect_azure_devops" | null;
}

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

// ─── Period analysis (Meu Tempo) ──────────────────────────────────────

/**
 * What happened to the invitations on the calendar over a period.
 *
 * A leader's week is not the list of meetings that happened — it is also the
 * ones that were cancelled at the last minute, moved twice and double-booked.
 * Counting only what survived hides exactly the churn that explains why the
 * week felt full and the timesheet looks empty.
 */
export type MeetingOutcome =
  | "attended"
  | "rescheduled"
  | "cancelled"
  | "declined"
  | "overlapped"
  | "tentative"
  | "not_responded"
  | "skipped";

export interface LedgerBucket {
  count: number;
  minutes: number;
}

export type MeetingLedger = Record<MeetingOutcome, LedgerBucket>;

/** One person the user shared calendar time with. */
export interface CollaboratorTime {
  /** Lowercased e-mail, or the folded display name when there is no e-mail. */
  key: string;
  name: string;
  email: string | null;
  isExternal: boolean;
  minutes: number;
  meetings: number;
  /** Meetings where this person was alone with the user. */
  oneOnOnes: number;
  lastMeetingIso: string;
}

/** A recurring series, collapsed into one row. */
export interface RitualTime {
  key: string;
  title: string;
  occurrences: number;
  minutes: number;
  averageParticipants: number;
  isOrganizer: boolean;
  /** Occurrences that were moved out of their original slot. */
  rescheduled: number;
  /** Occurrences cancelled inside the period. */
  cancelled: number;
}

/** A single day of the period, from every source at once. */
export interface PeriodDay {
  date: string;
  /** 0 = Sunday … 6 = Saturday, in the person's own timezone. */
  weekday: number;
  isWorkingDay: boolean;
  targetMinutes: number;
  loggedMinutes: number;
  /** Sum of `minutes` across the day's meeting signals. */
  meetingMinutes: number;
  meetingCount: number;
  /** Viva focus minutes, when the portrait is available. */
  focusMinutes: number;
  collaborationMinutes: number;
  /** Minutes in Teams calls without a calendar invite. */
  callMinutes: number;
  hasPortrait: boolean;
  away: boolean;
}

/**
 * Descriptive shape of the person's calendar — the part a bar chart cannot
 * show. Every number is derived from the meeting signals alone.
 */
export interface TimeShape {
  /** Meetings starting within 5 minutes of the previous one ending. */
  backToBackCount: number;
  /** Longest uninterrupted gap between meetings on a working day, in minutes. */
  longestFocusBlockMinutes: number;
  /** The day that block happened on. */
  longestFocusBlockDate: string | null;
  /** Meeting minutes outside the mailbox working window. */
  afterHoursMinutes: number;
  /** Meeting minutes on a day the person does not work. */
  weekendMinutes: number;
  /**
   * Share of the **contracted** working day consumed by meetings, 0–100.
   *
   * Measured against `contractedMinutes`, not against the Outlook window.
   * Everyone here works 8h a day; the Outlook window is wider because it
   * spans lunch, and dividing by it made every agenda look emptier than it
   * felt.
   */
  meetingLoadPercent: number;
  /**
   * Meeting minutes that fell **inside** the Outlook window — the numerator of
   * `meetingLoadPercent`.
   *
   * Published because it differs from the headline "tempo em reuniões": a
   * 17:00–18:00 meeting counts in full there and barely counts here. Without
   * the number, "6h30" next to "14%" looks like arithmetic nobody can
   * reproduce.
   */
  meetingMinutesInWindow: number;
  /** Minutes from midnight where the Outlook working window opens and closes. */
  windowStartMinute: number;
  windowEndMinute: number;
  /** Length of the Outlook window on one working day — lunch included. */
  windowMinutes: number;
  /** `windowMinutes` × working days. The denominator of the Viva free space. */
  windowCapacityMinutes: number;
  /**
   * The actual working day, summed over the period: 8h × working days.
   *
   * Taken from each day's own target, so a part-time contract or a
   * four-day week produces the right number without a special case.
   */
  contractedMinutes: number;
  /** Meetings the person organised, as a share of the total, 0–100. */
  organizerPercent: number;
  /** Minutes with at least one participant outside the company. */
  externalMinutes: number;
  /** Weekday with the most meeting minutes, or null with no meetings. */
  heaviestWeekday: number | null;
}

/**
 * One thing the person did, from any integrated source.
 *
 * Meetings come from the period response itself; everything else needs an
 * Azure DevOps round-trip and is fetched separately so the page can paint
 * before the slowest integration answers.
 */
export type PeriodActionKind =
  | "meeting"
  | "call"
  | "pull_request"
  | "commit"
  | "work_item";

export interface PeriodAction {
  id: string;
  kind: PeriodActionKind;
  title: string;
  /** Local date (YYYY-MM-DD) the action belongs to. */
  date: string;
  /** Instant used for ordering inside a day. */
  timestampIso: string;
  /** Repository, project or meeting shape — one short qualifier. */
  context: string | null;
  /** Minutes, when the source knows them (meetings only). */
  minutes: number | null;
  url: string | null;
}

/** Where the actions came from, so the UI can explain an empty list. */
export interface ActionSources {
  /** The Azure DevOps integration answered. */
  azureDevOps: boolean;
  /** It is configured for this person, whether or not it answered. */
  azureDevOpsConfigured: boolean;
}

/** Response of the Azure DevOps side of the activity timeline. */
export interface PeriodActionsResult {
  from: string;
  to: string;
  actions: PeriodAction[];
  sources: ActionSources;
  /** Azure DevOps, in the same shape as the Microsoft sources. */
  status: SourceStatus;
  warnings: string[];
}

export interface PeriodTotals {
  /** Minutes registered as time entries. */
  loggedMinutes: number;
  /** Expected minutes, summed from each day's own target. */
  targetMinutes: number;
  /** Meeting minutes detected on the calendar. */
  meetingMinutes: number;
  /** Viva collaboration minutes (meeting + call + chat + e-mail). */
  collaborationMinutes: number;
  /** Viva call minutes, when available. */
  callMinutes?: number;
  /** Free 2h+ calendar blocks — availability. See `DayPortrait.focusMinutes`. */
  focusMinutes: number;
  /** Meeting minutes that already have a matching time entry. */
  loggedMeetingMinutes: number;
  workingDays: number;
  awayDays: number;
}

/** Minutes registered per project, for the allocation chart. */
export interface ProjectAllocation {
  projectId: string;
  name: string;
  color: string;
  minutes: number;
  billableMinutes: number;
}

export interface CollaborationPeriod {
  from: string;
  to: string;
  /** Label already formatted in pt-BR, e.g. "15–21 de setembro". */
  label: string;
  days: PeriodDay[];
  totals: PeriodTotals;
  ledger: MeetingLedger;
  meetings: MeetingSignal[];
  collaborators: CollaboratorTime[];
  rituals: RitualTime[];
  shape: TimeShape;
  allocations: ProjectAllocation[];
  slices: ActivitySlice[];
  /** Teams direct / ad-hoc calls in the period (when available). */
  calls?: TeamCallSignal[];
  /** Daily portraits from Viva Insights, keyed by YYYY-MM-DD. */
  portraitsByDate?: Record<string, DayPortrait>;
  sources: CollaborationSources;
  /** One entry per Microsoft source, whether or not it answered. */
  statuses: SourceStatus[];
  warnings: string[];
  needsReauth: boolean;
}

export interface TeamCallSignal {
  id: string;
  startIso: string;
  endIso: string;
  minutes: number;
  otherParticipantName: string;
  callerName: string | null;
  calleeName: string | null;
  callType: "peerToPeer" | "groupCall";
  mediaTypes: string[];
}

// ─── Assistant layer ──────────────────────────────────────────────────

/**
 * How a finding should read.
 *
 * `action` is the only one that asks the person to do something, and it is the
 * only one allowed to carry a button. `attention` is reserved for the health
 * of the routine — a week that was fragmented or invaded — never for "you owe
 * hours": this page reports, it does not collect.
 */
export type InsightTone = "action" | "positive" | "neutral" | "attention";

/** One-word read of how the period was arranged. */
export type RhythmKind =
  | "protected"
  | "balanced"
  | "fragmented"
  | "heavy"
  | "unknown";

export interface WeekRhythm {
  kind: RhythmKind;
  /** Two or three words, shown as a pill next to the page title. */
  label: string;
  /** One sentence explaining how the label was reached. */
  description: string;
}

/**
 * What Azure DevOps reported for a period, reduced to three integers.
 *
 * The assistant needs the counts, not the timeline. Passing them around like
 * this lets the narrative endpoint mention deliveries without sweeping every
 * repository a second time.
 */
export interface DeliveryCounts {
  pullRequests: number;
  commits: number;
  workItems: number;
}

/**
 * One finding about the period, computed deterministically.
 *
 * These are the assistant's actual intelligence: every sentence is derived
 * from a number the user can verify elsewhere on the page. The AI narrative
 * sits on top of them and is allowed to rephrase, never to add.
 */
export interface PeriodInsight {
  id: string;
  tone: InsightTone;
  /** Lucide icon name, resolved on the client. */
  icon: string;
  title: string;
  description: string;
  /** Turned into a link by the UI when present. */
  actionLabel: string | null;
  actionHref: string | null;
  /**
   * Handled in place instead of navigating away.
   *
   * Only "log-meetings" today: it opens the batch dialog already loaded with
   * the meetings the period found unregistered.
   */
  quickAction: "log-meetings" | null;
}

export interface PeriodNarrative {
  text: string;
  /** "ai" when a provider wrote it, "deterministic" for the local writer. */
  source: "ai" | "deterministic";
}

export interface PeriodAssistantResult {
  from: string;
  to: string;
  insights: PeriodInsight[];
  narrative: PeriodNarrative;
}
