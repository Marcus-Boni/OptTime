import { DEFAULT_WORKING_DAYS_PER_WEEK } from "@/lib/collaboration/mailbox";

export const DEFAULT_WEEKLY_CAPACITY_HOURS = 40;
export const INCOMPLETE_DAY_TARGET_RATIO = 0.75;
export const OVERWORK_DAY_RATIO = 1.25;
export const SUSTAINABLE_WEEKLY_RATIO = 1.125;

export function resolveWeeklyCapacityHours(
  weeklyCapacityHours: number | null | undefined,
): number {
  return Number.isFinite(weeklyCapacityHours) && (weeklyCapacityHours ?? 0) > 0
    ? Math.max(0, weeklyCapacityHours ?? 0)
    : DEFAULT_WEEKLY_CAPACITY_HOURS;
}

export function weeklyCapacityMinutes(
  weeklyCapacityHours: number | null | undefined,
): number {
  return Math.round(resolveWeeklyCapacityHours(weeklyCapacityHours) * 60);
}

export function dailyTargetMinutes(
  weeklyCapacityHours: number | null | undefined,
  workingDaysPerWeek = DEFAULT_WORKING_DAYS_PER_WEEK,
): number {
  const days = Number.isFinite(workingDaysPerWeek)
    ? Math.max(1, Math.round(workingDaysPerWeek))
    : DEFAULT_WORKING_DAYS_PER_WEEK;

  return Math.round(weeklyCapacityMinutes(weeklyCapacityHours) / days);
}

export function incompleteDayThresholdMinutes(
  weeklyCapacityHours: number | null | undefined,
  workingDaysPerWeek = DEFAULT_WORKING_DAYS_PER_WEEK,
): number {
  return Math.round(
    dailyTargetMinutes(weeklyCapacityHours, workingDaysPerWeek) *
      INCOMPLETE_DAY_TARGET_RATIO,
  );
}

export function overworkDayThresholdMinutes(
  weeklyCapacityHours: number | null | undefined,
  workingDaysPerWeek = DEFAULT_WORKING_DAYS_PER_WEEK,
): number {
  return Math.round(
    dailyTargetMinutes(weeklyCapacityHours, workingDaysPerWeek) *
      OVERWORK_DAY_RATIO,
  );
}

export function sustainableWeeklyThresholdMinutes(
  weeklyCapacityHours: number | null | undefined,
): number {
  return Math.round(
    weeklyCapacityMinutes(weeklyCapacityHours) * SUSTAINABLE_WEEKLY_RATIO,
  );
}

export function capacityPercentage(
  loggedMinutes: number,
  targetMinutes: number,
): number {
  return targetMinutes > 0
    ? Math.round((loggedMinutes / targetMinutes) * 100)
    : 0;
}

export function isWeekdayDateString(dateStr: string): boolean {
  const clean = dateStr.split("T")[0] ?? dateStr;
  const parsed = new Date(`${clean}T12:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return true;
  const day = parsed.getUTCDay();
  return day >= 1 && day <= 5;
}

export function countWeekdayHolidaysInRange(
  start: string,
  end: string,
  holidayDates: Iterable<string>,
): number {
  const uniqueDates = new Set<string>();
  for (const raw of holidayDates) {
    const clean = raw.split("T")[0] ?? raw;
    if (clean >= start && clean <= end && isWeekdayDateString(clean)) {
      uniqueDates.add(clean);
    }
  }
  return uniqueDates.size;
}

export function adjustedWeeklyCapacityMinutes(
  weeklyCapacityHours: number | null | undefined,
  weekdayHolidayCount = 0,
  workingDaysPerWeek = DEFAULT_WORKING_DAYS_PER_WEEK,
): number {
  const baseWeekly = weeklyCapacityMinutes(weeklyCapacityHours);
  const safeHolidays = Math.max(0, Math.round(weekdayHolidayCount));
  if (safeHolidays === 0) return baseWeekly;

  const dailyBase = dailyTargetMinutes(weeklyCapacityHours, workingDaysPerWeek);
  return Math.max(0, baseWeekly - safeHolidays * dailyBase);
}

export function adjustedDailyTargetMinutes(
  weeklyCapacityHours: number | null | undefined,
  dateStr: string,
  holidayDates: ReadonlySet<string>,
  workingDaysPerWeek = DEFAULT_WORKING_DAYS_PER_WEEK,
): number {
  const clean = dateStr.split("T")[0] ?? dateStr;
  if (!isWeekdayDateString(clean) || holidayDates.has(clean)) {
    return 0;
  }
  return dailyTargetMinutes(weeklyCapacityHours, workingDaysPerWeek);
}
