import {
  addDays,
  endOfISOWeek,
  endOfMonth,
  format,
  startOfISOWeek,
  startOfMonth,
  subDays,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/utils";

export type PeriodKey =
  | "today"
  | "yesterday"
  | "this_week"
  | "last_week"
  | "this_month"
  | "last_month"
  | "last_7_days"
  | "last_30_days"
  | "custom";

export const PERIOD_KEYS: PeriodKey[] = [
  "today",
  "yesterday",
  "this_week",
  "last_week",
  "this_month",
  "last_month",
  "last_7_days",
  "last_30_days",
  "custom",
];

export interface ResolvedPeriod {
  from: string;
  to: string;
  label: string;
  /** Number of business days (Mon–Fri) inside the range. */
  businessDays: number;
}

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function toIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

function countBusinessDays(from: string, to: string): number {
  let cursor = parseLocalDate(from);
  const end = parseLocalDate(to);
  let count = 0;

  // Hard cap protects against pathological ranges coming from the model.
  for (let guard = 0; cursor <= end && guard < 400; guard++) {
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) count++;
    cursor = addDays(cursor, 1);
  }

  return count;
}

/**
 * Resolves a natural-language period key into a concrete date range,
 * anchored on the user's "today" so timezone drift never shifts the week.
 */
export function resolvePeriod(
  period: PeriodKey | undefined,
  today: string,
  customFrom?: string,
  customTo?: string,
): ResolvedPeriod {
  const anchor = parseLocalDate(today);
  const key: PeriodKey = period ?? "this_week";

  if (key === "custom" || (customFrom && customTo)) {
    const from =
      customFrom && DATE_PATTERN.test(customFrom) ? customFrom : today;
    const to = customTo && DATE_PATTERN.test(customTo) ? customTo : today;
    const [start, end] = from <= to ? [from, to] : [to, from];

    return {
      from: start,
      to: end,
      label: `${formatDayLabel(start)} a ${formatDayLabel(end)}`,
      businessDays: countBusinessDays(start, end),
    };
  }

  switch (key) {
    case "today":
      return withBusinessDays(today, today, "hoje");

    case "yesterday": {
      const day = toIso(subDays(anchor, 1));
      return withBusinessDays(day, day, "ontem");
    }

    case "last_week": {
      const ref = subWeeks(anchor, 1);
      return withBusinessDays(
        toIso(startOfISOWeek(ref)),
        toIso(endOfISOWeek(ref)),
        "semana passada",
      );
    }

    case "this_month":
      return withBusinessDays(
        toIso(startOfMonth(anchor)),
        toIso(endOfMonth(anchor)),
        `${format(anchor, "MMMM 'de' yyyy", { locale: ptBR })}`,
      );

    case "last_month": {
      const ref = subMonths(anchor, 1);
      return withBusinessDays(
        toIso(startOfMonth(ref)),
        toIso(endOfMonth(ref)),
        `${format(ref, "MMMM 'de' yyyy", { locale: ptBR })}`,
      );
    }

    case "last_7_days":
      return withBusinessDays(
        toIso(subDays(anchor, 6)),
        today,
        "últimos 7 dias",
      );

    case "last_30_days":
      return withBusinessDays(
        toIso(subDays(anchor, 29)),
        today,
        "últimos 30 dias",
      );

    default:
      return withBusinessDays(
        toIso(startOfISOWeek(anchor)),
        toIso(endOfISOWeek(anchor)),
        "esta semana",
      );
  }
}

function withBusinessDays(
  from: string,
  to: string,
  label: string,
): ResolvedPeriod {
  return { from, to, label, businessDays: countBusinessDays(from, to) };
}

export function formatDayLabel(date: string): string {
  return format(parseLocalDate(date), "dd/MM/yyyy");
}

export function formatWeekdayLabel(date: string): string {
  return format(parseLocalDate(date), "EEEE", { locale: ptBR });
}

export function isWeekend(date: string): boolean {
  const day = parseLocalDate(date).getDay();
  return day === 0 || day === 6;
}

/** Human label for an ISO week period id such as "2026-W12". */
export function formatPeriodLabel(period: string): string {
  const [year, week] = period.split("-W");
  if (!year || !week) return period;
  return `semana ${Number(week)} de ${year}`;
}

/** All dates between from/to inclusive (capped for safety). */
export function eachDate(from: string, to: string): string[] {
  const dates: string[] = [];
  let cursor = parseLocalDate(from);
  const end = parseLocalDate(to);

  for (let guard = 0; cursor <= end && guard < 400; guard++) {
    dates.push(toIso(cursor));
    cursor = addDays(cursor, 1);
  }

  return dates;
}
