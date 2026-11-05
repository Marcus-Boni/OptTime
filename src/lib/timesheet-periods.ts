import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPeriodRange, getWeekPeriod, parseLocalDate } from "@/lib/utils";

/**
 * Timesheet periods split at month boundaries.
 *
 * The unit of approval is the ISO week, but month closing (billing, payroll,
 * Azure DevOps reports) is monthly. A week that crosses a month boundary is
 * therefore stored as two independent timesheets — one per competence month —
 * so approving the September slice of a week never locks its October days.
 *
 *   2026-W41            → 05–11 out (single segment, key = ISO week)
 *   2026-W40@2026-09    → 28–30 set (segment of a split week)
 *   2026-W40@2026-10    → 01–04 out (segment of a split week)
 *
 * Keys still sort lexicographically in chronological order, so every existing
 * `period < currentPeriod` comparison keeps working. Everything here is pure
 * and safe to call on the client.
 */

export const SPLIT_PERIOD_SEPARATOR = "@";

const WEEK_PERIOD_PATTERN = /^\d{4}-W\d{2}$/;
const COMPETENCE_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export interface TimesheetSegment {
  /** Storage key: `2026-W41` or `2026-W40@2026-09`. */
  period: string;
  /** ISO week the segment belongs to: `2026-W40`. */
  weekPeriod: string;
  /** Competence month of the segment: `2026-09`. */
  competence: string;
  /** First day (YYYY-MM-DD), inclusive. */
  start: string;
  /** Last day (YYYY-MM-DD), inclusive. */
  end: string;
  /** True when the ISO week crosses a month boundary. */
  isSplit: boolean;
}

/** ISO week of any weekly key: `2026-W40@2026-09` → `2026-W40`. */
export function getBaseWeekPeriod(period: string): string {
  return period.split(SPLIT_PERIOD_SEPARATOR)[0] ?? period;
}

/** Competence of a split segment, or `null` for a whole-week key. */
export function getPeriodCompetence(period: string): string | null {
  const competence = period.split(SPLIT_PERIOD_SEPARATOR)[1];
  return competence && COMPETENCE_PATTERN.test(competence) ? competence : null;
}

export function isSplitPeriod(period: string): boolean {
  return getPeriodCompetence(period) !== null;
}

/** Zero-padded ISO week number of a weekly key: `2026-W40@2026-09` → `40`. */
export function getPeriodWeekNumber(period: string): string {
  return getBaseWeekPeriod(period).split("-W")[1] ?? "";
}

/**
 * The timesheet segments of an ISO week: one when the week stays inside a
 * month, two when it crosses a month boundary.
 */
export function getWeekSegments(weekPeriod: string): TimesheetSegment[] {
  const base = getBaseWeekPeriod(weekPeriod);
  const { start, end } = getPeriodRange(base, "weekly");
  const startCompetence = start.slice(0, 7);
  const endCompetence = end.slice(0, 7);

  if (startCompetence === endCompetence) {
    return [
      {
        period: base,
        weekPeriod: base,
        competence: startCompetence,
        start,
        end,
        isSplit: false,
      },
    ];
  }

  return [startCompetence, endCompetence].map((competence) => {
    const period = `${base}${SPLIT_PERIOD_SEPARATOR}${competence}`;
    const range = getPeriodRange(period, "weekly");
    return {
      period,
      weekPeriod: base,
      competence,
      start: range.start,
      end: range.end,
      isSplit: true,
    };
  });
}

/** The timesheet segment that owns a given day. */
export function getTimesheetSegmentForDate(
  date: string | Date,
): TimesheetSegment {
  const day = typeof date === "string" ? date : format(date, "yyyy-MM-dd");
  const segments = getWeekSegments(getWeekPeriod(day));
  const owner = segments.find(
    (segment) => day >= segment.start && day <= segment.end,
  );
  // Segments cover the whole week by construction; the fallback only keeps
  // the return type honest.
  return owner ?? (segments[0] as TimesheetSegment);
}

/** Timesheet storage key for a given day. */
export function getTimesheetPeriodForDate(date: string | Date): string {
  return getTimesheetSegmentForDate(date).period;
}

/**
 * Every key the timesheets of an ISO week can be stored under. Use it to
 * replace `eq(timesheet.period, weekPeriod)` when a query is about the week.
 */
export function getTimesheetPeriodsForWeek(weekPeriod: string): string[] {
  return getWeekSegments(weekPeriod).map((segment) => segment.period);
}

/**
 * True when `period` is a key the system creates: a monthly period, a whole
 * ISO week that stays inside one month, or one segment of a split week.
 * Rejects a bare week key for a split week, which would span two months.
 */
export function isCanonicalTimesheetPeriod(
  period: string,
  periodType: string,
): boolean {
  if (periodType === "monthly") return COMPETENCE_PATTERN.test(period);

  const base = getBaseWeekPeriod(period);
  if (!WEEK_PERIOD_PATTERN.test(base)) return false;

  try {
    return getTimesheetPeriodsForWeek(base).includes(period);
  } catch {
    return false;
  }
}

/** Human range of a period, e.g. `28–30 de set` or `29 de dez – 4 de jan`. */
export function formatPeriodRangeLabel(start: string, end: string): string {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);

  if (start === end) {
    return format(startDate, "d 'de' MMM", { locale: ptBR });
  }

  const sameMonth =
    startDate.getMonth() === endDate.getMonth() &&
    startDate.getFullYear() === endDate.getFullYear();

  return sameMonth
    ? `${format(startDate, "d")}–${format(endDate, "d 'de' MMM", { locale: ptBR })}`
    : `${format(startDate, "d 'de' MMM", { locale: ptBR })} – ${format(endDate, "d 'de' MMM", { locale: ptBR })}`;
}

/**
 * Human label for a timesheet period.
 *
 * @example getTimesheetPeriodLabel("2026-W41") => "Semana 41 · 5–11 de out"
 * @example getTimesheetPeriodLabel("2026-W40@2026-09") => "Semana 40 · 28–30 de set"
 * @example getTimesheetPeriodLabel("2026-03", "monthly") => "março de 2026"
 */
export function getTimesheetPeriodLabel(
  period: string,
  periodType = "weekly",
): string {
  try {
    const { start, end } = getPeriodRange(period, periodType);

    if (periodType === "monthly") {
      return format(parseLocalDate(start), "MMMM 'de' yyyy", { locale: ptBR });
    }

    return `Semana ${getPeriodWeekNumber(period)} · ${formatPeriodRangeLabel(start, end)}`;
  } catch {
    return period;
  }
}

/** Short competence label of a split segment, e.g. `set` — empty otherwise. */
export function getPeriodCompetenceLabel(period: string): string {
  const competence = getPeriodCompetence(period);
  if (!competence) return "";
  return format(parseLocalDate(`${competence}-01`), "MMM", { locale: ptBR });
}

/**
 * True when the period has days after `today`. Approving such a period would
 * lock days the collaborator has not lived yet, so approval asks for an
 * explicit confirmation.
 */
export function isPeriodOpenAfter(
  period: string,
  periodType: string,
  today: string,
): boolean {
  return getPeriodRange(period, periodType).end > today;
}
