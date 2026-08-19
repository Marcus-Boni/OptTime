import { eachDayOfInterval, isWeekend } from "date-fns";
import { parseLocalDate } from "@/lib/utils";
import { QUALITY_THRESHOLDS } from "./constants";
import type { WeekSignals } from "./types";

/** Minimum shape `computeWeekSignals` needs from a time entry. */
export interface WeekSignalEntry {
  date: string;
  duration: number;
  description: string;
}

function countBusinessDays(start: string, end: string): number {
  try {
    return eachDayOfInterval({
      start: parseLocalDate(start),
      end: parseLocalDate(end),
    }).filter((day) => !isWeekend(day)).length;
  } catch {
    return 5;
  }
}

/**
 * Derive the quality signals for one week.
 *
 * These signals drive the bonus XP, the wellbeing achievements and the balance
 * report. They deliberately measure *how* the week was logged, never how much.
 */
export function computeWeekSignals(
  period: string,
  start: string,
  end: string,
  entries: WeekSignalEntry[],
): WeekSignals {
  const minutesByDay = new Map<string, number>();
  let totalMinutes = 0;
  let weekendMinutes = 0;
  let richDescriptions = 0;

  for (const entry of entries) {
    const duration = Math.max(0, entry.duration);
    totalMinutes += duration;
    minutesByDay.set(
      entry.date,
      (minutesByDay.get(entry.date) ?? 0) + duration,
    );

    if (isWeekend(parseLocalDate(entry.date))) {
      weekendMinutes += duration;
    }

    if (
      entry.description.trim().length >= QUALITY_THRESHOLDS.richDescriptionChars
    ) {
      richDescriptions += 1;
    }
  }

  let maxDayMinutes = 0;
  let overworkedDays = 0;
  let businessDaysCovered = 0;

  for (const [date, minutes] of minutesByDay) {
    if (minutes > maxDayMinutes) maxDayMinutes = minutes;
    if (minutes > QUALITY_THRESHOLDS.overworkDayMinutes) overworkedDays += 1;
    if (minutes > 0 && !isWeekend(parseLocalDate(date))) {
      businessDaysCovered += 1;
    }
  }

  const businessDaysInPeriod = countBusinessDays(start, end);
  const entryCount = entries.length;
  const richDescriptionRatio =
    entryCount > 0 ? richDescriptions / entryCount : 0;

  return {
    period,
    start,
    end,
    totalMinutes,
    entryCount,
    businessDaysInPeriod,
    businessDaysCovered,
    maxDayMinutes,
    overworkedDays,
    weekendMinutes,
    richDescriptionRatio,
    // One day off should not cost the badge — pressuring people to log during
    // PTO is exactly the behaviour this feature must not create.
    isConsistent:
      businessDaysCovered >=
      Math.min(businessDaysInPeriod, QUALITY_THRESHOLDS.consistencyMinDays),
    isBalanced:
      entryCount > 0 &&
      overworkedDays === 0 &&
      weekendMinutes === 0 &&
      totalMinutes <= QUALITY_THRESHOLDS.sustainableWeeklyMinutes,
    isDetailed:
      entryCount > 0 &&
      richDescriptionRatio >= QUALITY_THRESHOLDS.richDescriptionRatio,
  };
}
