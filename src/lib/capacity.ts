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
