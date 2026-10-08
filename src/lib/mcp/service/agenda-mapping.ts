import { fuseMeetingsAndCalls } from "@/lib/collaboration/fusion";
import type { RawCalendarEvent } from "@/lib/collaboration/meetings";
import { buildMeetingSignals } from "@/lib/collaboration/meetings";
import { cleanSubject, foldText } from "@/lib/collaboration/naming";
import type { OutlookEvent } from "@/lib/microsoft-graph";
import { matchProjectBySubject } from "@/lib/time-assistant/reconstruct";
import {
  dateOfInstantInTimeZone,
  formatInstantWithOffset,
  startOfDayInstant,
} from "@/lib/timezone";
import type { TeamCallSignal } from "@/types/collaboration";

/**
 * Pure translation of Graph calendar events into the agent agenda contract.
 *
 * Kept free of I/O on purpose: time-zone conversion, the all-day edge cases and
 * the "already registered" signal are the parts an assistant would silently get
 * wrong, so they are verified offline against fixtures (`verify:assistant-gateway`).
 */

export type AgendaEventType =
  | "singleInstance"
  | "occurrence"
  | "exception"
  | "seriesMaster";

export type AgendaResponseStatus =
  | "organizer"
  | "accepted"
  | "tentativelyAccepted"
  | "declined"
  | "notResponded"
  | "none";

export type AgendaShowAs =
  | "free"
  | "tentative"
  | "busy"
  | "oof"
  | "workingElsewhere"
  | "unknown";

export type AgendaSensitivity =
  | "normal"
  | "personal"
  | "private"
  | "confidential";

export type AgendaAttendeeType = "required" | "optional" | "resource";

export interface AgendaAttendee {
  name: string | null;
  email: string | null;
  type: AgendaAttendeeType;
}

export interface AgendaEvent {
  id: string;
  iCalUId: string;
  seriesMasterId: string | null;
  type: AgendaEventType;
  subject: string;
  start: string;
  end: string;
  durationMinutes: number;
  isAllDay: boolean;
  isOnline: boolean;
  joinUrl: string | null;
  organizer: { name: string | null; email: string | null };
  isOrganizer: boolean;
  responseStatus: AgendaResponseStatus;
  attendeeCount: number;
  attendees: AgendaAttendee[];
  location: string | null;
  showAs: AgendaShowAs;
  sensitivity: AgendaSensitivity;
  webLink: string | null;
  description: string | null;
  suggestedProject: { id: string; code: string | null; name: string } | null;
  loggedMinutes: number;
  /** Presence measured in Teams; null when no call record matches the event. */
  attendance: AgendaAttendance | null;
}

export interface AgendaAttendance {
  joined: boolean;
  minutes: number;
}

export interface AgendaProjectCandidate {
  id: string;
  code: string;
  name: string;
  clientName: string | null;
}

export interface AgendaEntryRow {
  date: string;
  description: string;
  duration: number;
}

export interface MapAgendaInput {
  events: OutlookEvent[];
  timeZone: string;
  projects: AgendaProjectCandidate[];
  /** The user's entries over the range — the source of `loggedMinutes`. */
  entries: AgendaEntryRow[];
  userEmail: string | null;
  /** Everything outside this domain counts as an external participant. */
  internalDomain: string;
  includeDeclined: boolean;
  includeDescription: boolean;
  /**
   * The user's Teams call records over the range, or null when they could not
   * be read. Only used to fill `attendance`.
   */
  calls?: ReadonlyArray<TeamCallSignal> | null;
}

/** Most attendees echoed per event; `attendeeCount` still carries the total. */
export const MAX_AGENDA_ATTENDEES = 20;
/** Event descriptions are clipped so one long thread cannot flood the context. */
export const MAX_AGENDA_DESCRIPTION = 500;

const EVENT_TYPES: readonly AgendaEventType[] = [
  "singleInstance",
  "occurrence",
  "exception",
  "seriesMaster",
];
const RESPONSES: readonly AgendaResponseStatus[] = [
  "organizer",
  "accepted",
  "tentativelyAccepted",
  "declined",
  "notResponded",
  "none",
];
const SHOW_AS: readonly AgendaShowAs[] = [
  "free",
  "tentative",
  "busy",
  "oof",
  "workingElsewhere",
  "unknown",
];
const SENSITIVITIES: readonly AgendaSensitivity[] = [
  "normal",
  "personal",
  "private",
  "confidential",
];
const ATTENDEE_TYPES: readonly AgendaAttendeeType[] = [
  "required",
  "optional",
  "resource",
];

/** Case-insensitive pick from a closed list, with a fallback for new values. */
function pick<T extends string>(
  value: string | null | undefined,
  allowed: readonly T[],
  fallback: T,
): T {
  const lowered = value?.toLowerCase();
  return allowed.find((item) => item.toLowerCase() === lowered) ?? fallback;
}

/**
 * Graph answers in UTC (`Prefer: outlook.timezone="UTC"`) with seven fractional
 * digits and no suffix. Normalise to a Date.
 */
export function parseGraphUtc(dateTime: string): Date {
  const trimmed = dateTime.replace(/(\.\d{3})\d+/, "$1");
  return new Date(
    /(Z|[+-]\d{2}:\d{2})$/.test(trimmed) ? trimmed : `${trimmed}Z`,
  );
}

/**
 * Resolves one edge of an event to an instant.
 *
 * All-day events are anchored at midnight, but Graph may express that midnight
 * in UTC (`…T00:00:00`, "floating") or already in the mailbox zone (`…T03:00:00`
 * for São Paulo). A floating midnight means "that calendar date", so it is
 * re-anchored to local midnight; anything else is already the right instant.
 */
export function resolveBoundary(
  dateTime: string,
  isAllDay: boolean,
  timeZone: string,
): Date {
  const instant = parseGraphUtc(dateTime);
  if (!isAllDay) return instant;

  const isUtcMidnight =
    instant.getUTCHours() === 0 &&
    instant.getUTCMinutes() === 0 &&
    instant.getUTCSeconds() === 0;

  return isUtcMidnight
    ? startOfDayInstant(instant.toISOString().slice(0, 10), timeZone)
    : instant;
}

function plainText(
  body: OutlookEvent["body"],
  maxLength: number,
): string | null {
  const content = body?.content;
  if (!content) return null;

  const text =
    body?.contentType?.toLowerCase() === "html"
      ? content
          .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
          .replace(/<br\s*\/?>|<\/(p|div|li|tr)>/gi, "\n")
          .replace(/<[^>]+>/g, " ")
          .replace(/&nbsp;/gi, " ")
          .replace(/&amp;/gi, "&")
          .replace(/&lt;/gi, "<")
          .replace(/&gt;/gi, ">")
          .replace(/&quot;/gi, '"')
      : content;

  const collapsed = text
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();

  return collapsed ? collapsed.slice(0, maxLength) : null;
}

function toRawCalendarEvent(
  event: OutlookEvent,
  start: Date,
  end: Date,
): RawCalendarEvent {
  return {
    id: event.id,
    subject: event.subject ?? "",
    startIso: start.toISOString(),
    endIso: end.toISOString(),
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

interface ResolvedEvent {
  event: OutlookEvent;
  start: Date;
  end: Date;
  localDate: string;
}

interface MeetingFacts {
  /** Minutes already registered for each meeting. */
  logged: Map<string, number>;
  /** Presence measured by Teams call records, for the meetings that have one. */
  attendance: Map<string, AgendaAttendance>;
}

/**
 * What the OptTime already knows about each meeting.
 *
 * Both facts come from the signals the "Preencher meu dia" flow builds
 * (`buildMeetingSignals` with `keepLogged`):
 *  - an entry counts for a meeting when its description equals the meeting's
 *    generated title or its cleaned subject. The signal is a flag, so the minutes
 *    are the sum of the entries that triggered it;
 *  - presence is the duration `fuseMeetingsAndCalls` measured from Teams call
 *    records. A meeting no record matches has no presence at all — `null`, not
 *    "absent": records arrive late and a phone join leaves none.
 */
function computeMeetingFacts(
  resolved: ResolvedEvent[],
  entries: AgendaEntryRow[],
  calls: ReadonlyArray<TeamCallSignal> | null,
  userEmail: string | null,
  internalDomain: string,
): MeetingFacts {
  const logged = new Map<string, number>();
  const attendance = new Map<string, AgendaAttendance>();
  const byDay = new Map<string, ResolvedEvent[]>();

  for (const item of resolved) {
    const bucket = byDay.get(item.localDate) ?? [];
    bucket.push(item);
    byDay.set(item.localDate, bucket);
  }

  for (const [date, dayEvents] of byDay) {
    const dayEntries = entries.filter((entry) => entry.date === date);
    if (dayEntries.length === 0 && !calls?.length) continue;

    const { meetings } = buildMeetingSignals({
      events: dayEvents.map((item) =>
        toRawCalendarEvent(item.event, item.start, item.end),
      ),
      userEmail,
      internalDomain,
      existingDescriptions: dayEntries.map((entry) => entry.description),
      includePrivate: true,
      keepLogged: true,
    });

    for (const meeting of meetings) {
      if (!meeting.alreadyLogged) continue;

      const keys = new Set([
        foldText(meeting.title),
        foldText(cleanSubject(meeting.subject)),
      ]);
      const minutes = dayEntries
        .filter((entry) => keys.has(foldText(entry.description)))
        .reduce((sum, entry) => sum + entry.duration, 0);

      logged.set(meeting.id, minutes);
    }

    if (calls?.length) {
      const fused = fuseMeetingsAndCalls({ meetings, calls: [...calls] });

      for (const meeting of fused.meetings) {
        if (meeting.measuredMinutes && meeting.measuredMinutes > 0) {
          attendance.set(meeting.id, {
            joined: true,
            minutes: meeting.measuredMinutes,
          });
        }
      }
    }
  }

  return { logged, attendance };
}

/**
 * Maps Graph events to the agent contract: cancelled events dropped, instants
 * rendered with the zone offset, ordered by start.
 */
export function mapAgendaEvents(input: MapAgendaInput): AgendaEvent[] {
  const { timeZone } = input;

  const resolved: ResolvedEvent[] = input.events
    .filter((event) => !event.isCancelled)
    .filter(
      (event) =>
        input.includeDeclined ||
        event.responseStatus?.response?.toLowerCase() !== "declined",
    )
    .flatMap((event) => {
      const isAllDay = Boolean(event.isAllDay);
      const start = resolveBoundary(event.start.dateTime, isAllDay, timeZone);
      const end = resolveBoundary(event.end.dateTime, isAllDay, timeZone);
      if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return [];
      }
      return [
        {
          event,
          start,
          end,
          localDate: dateOfInstantInTimeZone(start, timeZone),
        },
      ];
    });

  const facts = computeMeetingFacts(
    resolved,
    input.entries,
    input.calls ?? null,
    input.userEmail,
    input.internalDomain,
  );

  return resolved
    .sort(
      (a, b) =>
        a.start.getTime() - b.start.getTime() ||
        a.end.getTime() - b.end.getTime() ||
        a.event.id.localeCompare(b.event.id),
    )
    .map(({ event, start, end }): AgendaEvent => {
      const subject = event.subject ?? "";
      const attendees = (event.attendees ?? []).map(
        (attendee): AgendaAttendee => ({
          name: attendee.emailAddress?.name ?? null,
          email: attendee.emailAddress?.address ?? null,
          type: pick(attendee.type, ATTENDEE_TYPES, "required"),
        }),
      );
      const matched = subject
        ? matchProjectBySubject(subject, input.projects)
        : null;
      const isOrganizer = Boolean(event.isOrganizer);

      return {
        id: event.id,
        iCalUId: event.iCalUId ?? event.id,
        seriesMasterId: event.seriesMasterId ?? null,
        type: pick(event.type, EVENT_TYPES, "singleInstance"),
        subject,
        start: formatInstantWithOffset(start, timeZone),
        end: formatInstantWithOffset(end, timeZone),
        durationMinutes: Math.round((end.getTime() - start.getTime()) / 60_000),
        isAllDay: Boolean(event.isAllDay),
        isOnline:
          Boolean(event.isOnlineMeeting) ||
          (event.onlineMeetingProvider ?? "").toLowerCase().includes("teams"),
        joinUrl: event.onlineMeeting?.joinUrl ?? null,
        organizer: {
          name: event.organizer?.emailAddress?.name ?? null,
          email: event.organizer?.emailAddress?.address ?? null,
        },
        isOrganizer,
        responseStatus: isOrganizer
          ? "organizer"
          : pick(event.responseStatus?.response, RESPONSES, "none"),
        attendeeCount: attendees.length,
        attendees: attendees.slice(0, MAX_AGENDA_ATTENDEES),
        location: event.location?.displayName?.trim() || null,
        showAs: pick(event.showAs, SHOW_AS, "unknown"),
        sensitivity: pick(event.sensitivity, SENSITIVITIES, "normal"),
        webLink: event.webLink || null,
        description: input.includeDescription
          ? plainText(event.body, MAX_AGENDA_DESCRIPTION)
          : null,
        suggestedProject: matched
          ? { id: matched.id, code: matched.code ?? null, name: matched.name }
          : null,
        loggedMinutes: facts.logged.get(event.id) ?? 0,
        attendance: facts.attendance.get(event.id) ?? null,
      };
    });
}

const RESPONSE_LABELS: Record<AgendaResponseStatus, string | null> = {
  organizer: "organizador",
  accepted: "aceita",
  tentativelyAccepted: "talvez",
  declined: "recusada",
  notResponded: "sem resposta",
  none: null,
};

/** HH:mm out of an ISO string that already carries the local wall clock. */
function clockOf(iso: string): string {
  return iso.slice(11, 16);
}

/**
 * One line per event, written to be quoted to the user:
 * `09:15–09:30 Daily do time (Teams, aceita)`.
 */
export function formatAgendaLine(event: AgendaEvent): string {
  const when = event.isAllDay
    ? "Dia inteiro"
    : `${clockOf(event.start)}–${clockOf(event.end)}`;

  const where = event.isOnline
    ? (event.joinUrl ?? "").includes("teams")
      ? "Teams"
      : "online"
    : event.location;
  const response = RESPONSE_LABELS[event.responseStatus];
  const tags = [where, response].filter(Boolean).join(", ");

  return `${when} ${event.subject || "(sem assunto)"}${tags ? ` (${tags})` : ""}`;
}
