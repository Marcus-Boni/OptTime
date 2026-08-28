/**
 * Workload Matrix helpers — ISO-week enumeration and utilization bands.
 *
 * Pure functions shared by the workload endpoint and (indirectly) the UI:
 * past weeks are classified on logged minutes, future weeks on planned
 * allocation minutes, both against the person's weekly capacity.
 */

import { addWeeks, format, startOfISOWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatLocalDate, getWeekPeriod, parseLocalDate } from "@/lib/utils";
import type { UtilizationLevel, WorkloadWeekDescriptor } from "@/types/hq";

/** Above capacity = overload ("sobrecarga"). */
const OVER_RATIO = 1.0;
/** 85%–100% of capacity reads as fully booked. */
const FULL_RATIO = 0.85;
/** Below 62.5% of capacity (25h on a 40h week) reads as idle capacity. */
const LOW_RATIO = 0.625;

/**
 * Enumerates consecutive ISO weeks around today: `pastWeeks` complete weeks
 * before the current one, the current week, and `futureWeeks` ahead.
 */
export function buildWeekWindow(
  today: string,
  pastWeeks: number,
  futureWeeks: number,
): WorkloadWeekDescriptor[] {
  const currentMonday = startOfISOWeek(parseLocalDate(today));
  const currentWeekId = getWeekPeriod(today);
  const weeks: WorkloadWeekDescriptor[] = [];

  for (let offset = -pastWeeks; offset <= futureWeeks; offset++) {
    const monday = addWeeks(currentMonday, offset);
    const sunday = addWeeks(monday, 1);
    sunday.setDate(sunday.getDate() - 1);

    const weekId = getWeekPeriod(formatLocalDate(monday));

    weeks.push({
      week: weekId,
      start: formatLocalDate(monday),
      end: formatLocalDate(sunday),
      label: buildWeekLabel(monday, sunday),
      isCurrent: weekId === currentWeekId,
      isFuture: offset > 0,
    });
  }

  return weeks;
}

/** "24–30 ago" or "31 ago – 6 set" when the week crosses months. */
function buildWeekLabel(monday: Date, sunday: Date): string {
  const sameMonth = monday.getMonth() === sunday.getMonth();

  if (sameMonth) {
    return `${format(monday, "d", { locale: ptBR })}–${format(sunday, "d MMM", { locale: ptBR })}`;
  }

  return `${format(monday, "d MMM", { locale: ptBR })} – ${format(sunday, "d MMM", { locale: ptBR })}`;
}

/** Utilization band for one cell (minutes vs. weekly capacity). */
export function classifyUtilization(
  minutes: number,
  capacityMinutes: number,
): UtilizationLevel {
  if (minutes <= 0) return "empty";
  if (capacityMinutes <= 0) return "ok";

  const ratio = minutes / capacityMinutes;
  if (ratio > OVER_RATIO) return "over";
  if (ratio >= FULL_RATIO) return "full";
  if (ratio >= LOW_RATIO) return "ok";
  return "low";
}
