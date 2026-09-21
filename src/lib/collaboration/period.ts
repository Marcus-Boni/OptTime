/**
 * Period-level reading of a person's calendar — the arithmetic behind Meu Tempo.
 *
 * `buildMeetingSignals` answers "what happened today". This module answers the
 * questions a day cannot: which ritual eats the week, who the person actually
 * spends time with, how much of the agenda was churn instead of work, and
 * whether there was ever a block long enough to think in.
 *
 * Pure by construction — every input arrives as an argument, so the verify
 * script exercises the same code the page renders.
 */

import { dateOfInstantInTimeZone, shiftDay } from "@/lib/timezone";
import type {
  ActivitySlice,
  CollaboratorTime,
  LedgerBucket,
  MeetingExclusion,
  MeetingLedger,
  MeetingSignal,
  PeriodDay,
  RitualTime,
  TimeShape,
  WorkingHours,
} from "@/types/collaboration";

/** Two months is the widest window the UI offers; past it the reads get slow. */
export const MAX_PERIOD_DAYS = 62;
/** Gap below which two meetings count as back-to-back. */
const BACK_TO_BACK_TOLERANCE_MINUTES = 5;
/** Used when the mailbox never answered: the classic Brazilian office day. */
const DEFAULT_WINDOW_START_MINUTE = 9 * 60;
const DEFAULT_WINDOW_END_MINUTE = 18 * 60;
/** A gap shorter than this is a coffee break, not a focus block. */
const MIN_FOCUS_BLOCK_MINUTES = 30;
/** Rows beyond these caps are noise in a side panel. */
const MAX_COLLABORATORS = 12;
const MAX_RITUALS = 8;

function emptyBucket(): LedgerBucket {
  return { count: 0, minutes: 0 };
}

function add(bucket: LedgerBucket, minutes: number): void {
  bucket.count += 1;
  bucket.minutes += Math.round(minutes);
}

// ─── Calendar helpers ─────────────────────────────────────────────────

/** Every date from `from` to `to`, inclusive, capped at {@link MAX_PERIOD_DAYS}. */
export function enumerateDates(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = from;
  let guard = 0;

  while (cursor <= to && guard < MAX_PERIOD_DAYS) {
    dates.push(cursor);
    cursor = shiftDay(cursor, 1);
    guard += 1;
  }

  return dates;
}

/**
 * `Date.getDay()` for a YYYY-MM-DD.
 *
 * Read as a calendar date through UTC rather than as an instant, so the
 * weekday of a date never depends on the timezone of the process asking.
 */
export function weekdayOf(date: string): number {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1),
  ).getUTCDay();
}

// ─── Local clock helpers ──────────────────────────────────────────────

const clockFormatters = new Map<string, Intl.DateTimeFormat>();

function clockFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = clockFormatters.get(timeZone);
  if (cached) return cached;

  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  clockFormatters.set(timeZone, formatter);
  return formatter;
}

/**
 * Minutes since local midnight for an instant, in the person's own timezone.
 *
 * Meetings arrive as UTC instants; "fora do horário" is a statement about the
 * wall clock of whoever attended, so the conversion cannot be skipped.
 */
export function localMinutesOfDay(iso: string, timeZone: string): number {
  const instant = new Date(iso);
  if (Number.isNaN(instant.getTime())) return 0;

  const parts = clockFormatter(timeZone).formatToParts(instant);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? "0",
  );
  return hour * 60 + minute;
}

// ─── Ledger ───────────────────────────────────────────────────────────

/**
 * Counts what became of every invitation in the period.
 *
 * `rescheduled`, `tentative` and `not_responded` are **subsets** of
 * `attended` — they qualify meetings that happened rather than replacing them.
 * Only `attended`, `cancelled`, `declined`, `overlapped` and `skipped` are
 * mutually exclusive, and only those five may be summed.
 */
export function buildMeetingLedger(
  meetings: MeetingSignal[],
  exclusions: MeetingExclusion[],
): MeetingLedger {
  const ledger: MeetingLedger = {
    attended: emptyBucket(),
    rescheduled: emptyBucket(),
    cancelled: emptyBucket(),
    declined: emptyBucket(),
    overlapped: emptyBucket(),
    tentative: emptyBucket(),
    not_responded: emptyBucket(),
    skipped: emptyBucket(),
  };

  for (const meeting of meetings) {
    add(ledger.attended, meeting.minutes);
    if (meeting.wasRescheduled) add(ledger.rescheduled, meeting.minutes);
    if (meeting.acceptance === "tentative") {
      add(ledger.tentative, meeting.minutes);
    }
    if (meeting.acceptance === "not_responded") {
      add(ledger.not_responded, meeting.minutes);
    }
  }

  for (const exclusion of exclusions) {
    switch (exclusion.reason) {
      case "cancelled":
        add(ledger.cancelled, exclusion.minutes);
        break;
      case "declined":
        add(ledger.declined, exclusion.minutes);
        break;
      case "overlapped":
        add(ledger.overlapped, exclusion.minutes);
        break;
      // A recurrence rule is not a moment in the day; counting it would
      // inflate every ritual by one phantom occurrence.
      case "series_master":
        break;
      default:
        add(ledger.skipped, exclusion.minutes);
    }
  }

  return ledger;
}

// ─── People ───────────────────────────────────────────────────────────

function collaboratorKey(name: string, email: string | null): string {
  const normalized = email?.trim().toLowerCase();
  if (normalized) return normalized;
  return `name:${name.trim().toLowerCase()}`;
}

/**
 * Who the person actually spent calendar time with, heaviest first.
 *
 * Minutes are attributed in full to every participant: a one-hour meeting with
 * three people is one hour with each of them, not twenty minutes each. The
 * question being answered is "how much of my time does this person occupy",
 * and splitting the hour would make every group meeting look trivial.
 */
export function buildCollaborators(
  meetings: MeetingSignal[],
): CollaboratorTime[] {
  const byKey = new Map<string, CollaboratorTime>();

  for (const meeting of meetings) {
    for (const person of meeting.participants) {
      const name = person.name.trim();
      if (!name && !person.email) continue;

      const key = collaboratorKey(name, person.email);
      const current = byKey.get(key);

      if (current) {
        current.minutes += meeting.minutes;
        current.meetings += 1;
        if (meeting.shape === "one_on_one") current.oneOnOnes += 1;
        if (meeting.startIso > current.lastMeetingIso) {
          current.lastMeetingIso = meeting.startIso;
        }
        continue;
      }

      byKey.set(key, {
        key,
        name: name || (person.email ?? "").split("@")[0] || "Sem nome",
        email: person.email,
        isExternal: person.isExternal,
        minutes: meeting.minutes,
        meetings: 1,
        oneOnOnes: meeting.shape === "one_on_one" ? 1 : 0,
        lastMeetingIso: meeting.startIso,
      });
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.minutes - a.minutes || b.meetings - a.meetings)
    .slice(0, MAX_COLLABORATORS);
}

// ─── Rituals ──────────────────────────────────────────────────────────

interface RitualAccumulator extends RitualTime {
  participantsTotal: number;
}

/**
 * Collapses recurring series into one row each.
 *
 * One-off meetings are deliberately absent: the point is to expose the
 * standing commitments that quietly consume a week, which is the only number
 * here a person can actually act on.
 */
export function buildRituals(
  meetings: MeetingSignal[],
  cancelledSubjects: string[] = [],
): RitualTime[] {
  const bySeries = new Map<string, RitualAccumulator>();

  for (const meeting of meetings) {
    if (!meeting.isRecurring || !meeting.seriesId) continue;

    const current = bySeries.get(meeting.seriesId);
    if (current) {
      current.occurrences += 1;
      current.minutes += meeting.minutes;
      current.participantsTotal += meeting.participantCount;
      if (meeting.wasRescheduled) current.rescheduled += 1;
      continue;
    }

    bySeries.set(meeting.seriesId, {
      key: meeting.seriesId,
      title: meeting.subject || meeting.title,
      occurrences: 1,
      minutes: meeting.minutes,
      averageParticipants: meeting.participantCount,
      participantsTotal: meeting.participantCount,
      isOrganizer: meeting.isOrganizer,
      rescheduled: meeting.wasRescheduled ? 1 : 0,
      cancelled: 0,
    });
  }

  // A cancelled occurrence never becomes a signal, so the series it belonged
  // to can only be recovered by matching the subject it was dropped under.
  const cancelledCount = new Map<string, number>();
  for (const subject of cancelledSubjects) {
    const key = subject.trim().toLowerCase();
    if (!key) continue;
    cancelledCount.set(key, (cancelledCount.get(key) ?? 0) + 1);
  }

  return [...bySeries.values()]
    .map((ritual) => ({
      key: ritual.key,
      title: ritual.title,
      occurrences: ritual.occurrences,
      minutes: ritual.minutes,
      averageParticipants: Math.round(
        ritual.participantsTotal / ritual.occurrences,
      ),
      isOrganizer: ritual.isOrganizer,
      rescheduled: ritual.rescheduled,
      cancelled: cancelledCount.get(ritual.title.trim().toLowerCase()) ?? 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, MAX_RITUALS);
}

// ─── Shape of the calendar ────────────────────────────────────────────

export interface BuildTimeShapeInput {
  meetings: MeetingSignal[];
  days: PeriodDay[];
  workingHours: WorkingHours | null;
  /** IANA name used to read the wall clock of each meeting. */
  timeZone: string;
}

/**
 * Descriptive read of how the agenda is arranged, not how full it is.
 *
 * Two people with the same twenty meeting hours live completely different
 * weeks depending on whether those hours are stacked or scattered; these are
 * the numbers that tell the two apart.
 */
export function buildTimeShape({
  meetings,
  days,
  workingHours,
  timeZone,
}: BuildTimeShapeInput): TimeShape {
  const windowStart = workingHours?.startMinute ?? DEFAULT_WINDOW_START_MINUTE;
  const windowEnd = workingHours?.endMinute ?? DEFAULT_WINDOW_END_MINUTE;

  // Bucketed by the person's LOCAL date, never by the first ten characters of
  // the ISO string: `startIso` is a UTC instant, so a 21:00 meeting in São
  // Paulo carries tomorrow's UTC date. Slicing it would move that meeting to
  // the next day — and with it the back-to-back count, the focus-block scan
  // and whether it counted as a weekend.
  const byDate = new Map<string, MeetingSignal[]>();
  for (const meeting of meetings) {
    const date = dateOfInstantInTimeZone(meeting.startIso, timeZone);
    const bucket = byDate.get(date);
    if (bucket) bucket.push(meeting);
    else byDate.set(date, [meeting]);
  }

  let backToBackCount = 0;
  let longestFocusBlockMinutes = 0;
  let longestFocusBlockDate: string | null = null;
  let afterHoursMinutes = 0;
  let weekendMinutes = 0;
  let insideWindowMinutes = 0;

  const minutesByWeekday = new Map<number, number>();

  for (const day of days) {
    const dayMeetings = [...(byDate.get(day.date) ?? [])].sort((a, b) =>
      a.startIso.localeCompare(b.startIso),
    );

    const busy: Array<[start: number, end: number]> = [];

    for (const meeting of dayMeetings) {
      const start = localMinutesOfDay(meeting.startIso, timeZone);
      busy.push([start, start + meeting.minutes]);

      minutesByWeekday.set(
        day.weekday,
        (minutesByWeekday.get(day.weekday) ?? 0) + meeting.minutes,
      );

      if (!day.isWorkingDay) {
        weekendMinutes += meeting.minutes;
        continue;
      }

      const inside = Math.max(
        0,
        Math.min(start + meeting.minutes, windowEnd) -
          Math.max(start, windowStart),
      );
      insideWindowMinutes += inside;
      afterHoursMinutes += meeting.minutes - inside;
    }

    for (let index = 1; index < busy.length; index += 1) {
      const gap = busy[index][0] - busy[index - 1][1];
      if (gap >= 0 && gap <= BACK_TO_BACK_TOLERANCE_MINUTES) {
        backToBackCount += 1;
      }
    }

    if (!day.isWorkingDay) continue;

    // Free stretches inside the working window, edges included: a day with a
    // single 11:00 meeting still has a real morning and a real afternoon.
    let cursor = windowStart;
    for (const [start, end] of busy) {
      if (end <= windowStart || start >= windowEnd) continue;
      const gap = Math.max(0, Math.min(start, windowEnd) - cursor);
      if (gap > longestFocusBlockMinutes) {
        longestFocusBlockMinutes = gap;
        longestFocusBlockDate = day.date;
      }
      cursor = Math.max(cursor, Math.min(end, windowEnd));
    }

    const tail = Math.max(0, windowEnd - cursor);
    if (tail > longestFocusBlockMinutes) {
      longestFocusBlockMinutes = tail;
      longestFocusBlockDate = day.date;
    }
  }

  const workingDays = days.filter((day) => day.isWorkingDay).length;
  const windowMinutes = Math.max(1, windowEnd - windowStart);
  const windowCapacityMinutes = workingDays * windowMinutes;

  // The contracted day, not the Outlook window. A 08:00–17:00 window is nine
  // hours because it spans lunch, while the working day is eight — dividing
  // meeting minutes by the window understated every agenda by a ninth.
  const contractedMinutes = days.reduce(
    (sum, day) => (day.isWorkingDay ? sum + day.targetMinutes : sum),
    0,
  );
  const loadDenominator = contractedMinutes || windowCapacityMinutes;
  const organizerCount = meetings.filter(
    (meeting) => meeting.isOrganizer,
  ).length;
  const externalMinutes = meetings.reduce(
    (sum, meeting) => (meeting.externalCount > 0 ? sum + meeting.minutes : sum),
    0,
  );

  let heaviestWeekday: number | null = null;
  let heaviestMinutes = 0;
  for (const [weekday, minutes] of minutesByWeekday) {
    if (minutes > heaviestMinutes) {
      heaviestMinutes = minutes;
      heaviestWeekday = weekday;
    }
  }

  const hasFocusBlock = longestFocusBlockMinutes >= MIN_FOCUS_BLOCK_MINUTES;

  return {
    backToBackCount,
    longestFocusBlockMinutes: hasFocusBlock
      ? Math.round(longestFocusBlockMinutes)
      : 0,
    longestFocusBlockDate: hasFocusBlock ? longestFocusBlockDate : null,
    afterHoursMinutes: Math.round(afterHoursMinutes),
    weekendMinutes: Math.round(weekendMinutes),
    meetingLoadPercent:
      loadDenominator > 0
        ? Math.min(
            100,
            Math.round((insideWindowMinutes / loadDenominator) * 100),
          )
        : 0,
    meetingMinutesInWindow: Math.round(insideWindowMinutes),
    windowStartMinute: windowStart,
    windowEndMinute: windowEnd,
    windowMinutes,
    windowCapacityMinutes,
    contractedMinutes,
    organizerPercent:
      meetings.length > 0
        ? Math.round((organizerCount / meetings.length) * 100)
        : 0,
    externalMinutes: Math.round(externalMinutes),
    heaviestWeekday,
  };
}

// ─── Totals ───────────────────────────────────────────────────────────

/** Folds the per-day portraits into one set of slices for the whole period. */
export function mergeSlices(groups: ActivitySlice[][]): ActivitySlice[] {
  const totals = new Map<ActivitySlice["kind"], number>();

  for (const slices of groups) {
    for (const slice of slices) {
      totals.set(slice.kind, (totals.get(slice.kind) ?? 0) + slice.minutes);
    }
  }

  return [...totals.entries()]
    .map(([kind, minutes]) => ({ kind, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

// ─── Labels ───────────────────────────────────────────────────────────

const MONTHS = [
  "janeiro",
  "fevereiro",
  "março",
  "abril",
  "maio",
  "junho",
  "julho",
  "agosto",
  "setembro",
  "outubro",
  "novembro",
  "dezembro",
];

/** "15 a 21 de setembro" · "setembro de 2026" · "21 de setembro de 2026". */
export function formatPeriodLabel(from: string, to: string): string {
  const [fromYear, fromMonth, fromDay] = from.split("-").map(Number);
  const [toYear, toMonth, toDay] = to.split("-").map(Number);

  const fromMonthName = MONTHS[(fromMonth ?? 1) - 1] ?? "";
  const toMonthName = MONTHS[(toMonth ?? 1) - 1] ?? "";

  if (from === to) return `${fromDay} de ${fromMonthName} de ${fromYear}`;

  if (fromYear === toYear && fromMonth === toMonth) {
    const lastDayOfMonth = new Date(
      Date.UTC(toYear ?? 1970, toMonth ?? 1, 0),
    ).getUTCDate();
    if (fromDay === 1 && toDay === lastDayOfMonth) {
      return `${fromMonthName} de ${fromYear}`;
    }
    return `${fromDay} a ${toDay} de ${fromMonthName}`;
  }

  if (fromYear === toYear) {
    return `${fromDay} de ${fromMonthName} a ${toDay} de ${toMonthName}`;
  }

  return `${fromDay}/${fromMonth}/${fromYear} a ${toDay}/${toMonth}/${toYear}`;
}

/** pt-BR label for each ledger bucket, shared by the chart and the legend. */
export const LEDGER_LABELS: Record<keyof MeetingLedger, string> = {
  attended: "Realizadas",
  rescheduled: "Remarcadas",
  cancelled: "Canceladas",
  declined: "Recusadas",
  overlapped: "Sobrepostas",
  tentative: "Provisórias",
  not_responded: "Sem resposta",
  skipped: "Não consideradas",
};

/** Minutes from midnight as a wall clock, e.g. 480 → "08:00". */
export function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = Math.round(minutes % 60);
  return `${String(hours).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

/** Short pt-BR weekday names, indexed by `Date.getDay()`. */
export const WEEKDAY_LABELS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
];
