import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { timesheet } from "@/lib/db/schema";
import {
  getTimesheetSegmentForDate,
  isSplitPeriod,
} from "@/lib/timesheet-periods";
import {
  getTimesheetStatusLabel,
  isTimesheetLockedStatus,
} from "@/lib/timesheet-status";

export interface WeeklyTimesheetStatusForDate {
  /** Timesheet key that owns the date — a week or one month segment of it. */
  period: string;
  /** First day of that timesheet period. */
  periodStart: string;
  /** Last day of that timesheet period. */
  periodEnd: string;
  /** True when the date's week crosses a month boundary. */
  isSplit: boolean;
  timesheetId: string | null;
  status: string | null;
  locked: boolean;
}

export class LockedTimesheetPeriodError extends Error {
  constructor(
    readonly date: string,
    readonly timesheetStatus: string,
    readonly period?: string,
  ) {
    super(
      `Não é possível registrar horas em ${date} porque ${
        period && isSplitPeriod(period) ? "esse período" : "a semana desse dia"
      } já foi ${getTimesheetStatusLabel(timesheetStatus)}.`,
    );
    this.name = "LockedTimesheetPeriodError";
  }
}

/**
 * Status of the timesheet that owns `date`.
 *
 * A week that crosses a month boundary has one timesheet per month, so the
 * lock is resolved against the segment containing the day, never the whole
 * week: approving the September slice leaves the October days editable.
 */
export async function getWeeklyTimesheetStatusForDate(
  userId: string,
  date: string,
): Promise<WeeklyTimesheetStatusForDate> {
  const segment = getTimesheetSegmentForDate(date);
  const weeklyTimesheet = await db.query.timesheet.findFirst({
    where: and(
      eq(timesheet.userId, userId),
      eq(timesheet.period, segment.period),
      eq(timesheet.periodType, "weekly"),
    ),
    columns: {
      id: true,
      status: true,
    },
  });

  return {
    period: segment.period,
    periodStart: segment.start,
    periodEnd: segment.end,
    isSplit: segment.isSplit,
    timesheetId: weeklyTimesheet?.id ?? null,
    status: weeklyTimesheet?.status ?? null,
    locked: isTimesheetLockedStatus(weeklyTimesheet?.status),
  };
}

export async function assertWeeklyTimesheetDateUnlocked(
  userId: string,
  date: string,
): Promise<WeeklyTimesheetStatusForDate> {
  const status = await getWeeklyTimesheetStatusForDate(userId, date);

  if (status.status && isTimesheetLockedStatus(status.status)) {
    throw new LockedTimesheetPeriodError(date, status.status, status.period);
  }

  return status;
}
