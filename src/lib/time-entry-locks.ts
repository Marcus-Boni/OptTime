import { createHash } from "node:crypto";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { timesheet } from "@/lib/db/schema";
import { getTimesheetSegmentForDate } from "@/lib/timesheet-periods";
import { isTimesheetLockedStatus } from "@/lib/timesheet-status";
import { getPeriodRange } from "@/lib/utils";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

interface TimeEntryDate {
  userId: string;
  date: string;
  timesheetId?: string | null;
}

export const TIMESHEET_PERIOD_LOCKED_MESSAGE =
  "Não foi possível alterar o apontamento porque a semana correspondente já foi submetida ou o período está fechado. Para realizar ajustes, é necessário que o período seja reaberto pelo fluxo autorizado.";

export interface WeeklyTimesheetStatusForDate {
  /** Weekly timesheet key for the date, including its month segment. */
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
  lockedPeriod: string | null;
}

export class LockedTimesheetPeriodError extends Error {
  constructor(
    readonly date: string,
    readonly timesheetStatus: string,
    readonly period?: string,
  ) {
    super(TIMESHEET_PERIOD_LOCKED_MESSAGE);
    this.name = "LockedTimesheetPeriodError";
  }
}

/**
 * Effective status for `date`. An open or reopened week can still be locked
 * by a submitted or approved monthly timesheet.
 *
 * A week that crosses a month boundary has one timesheet per month, so the
 * weekly lock is resolved against the segment containing the day.
 */
export async function getWeeklyTimesheetStatusForDate(
  userId: string,
  date: string,
): Promise<WeeklyTimesheetStatusForDate> {
  return getTimeEntryDateStatus({ userId, date }, db);
}

async function getTimeEntryDateStatus(
  { userId, date, timesheetId }: TimeEntryDate,
  reader: Pick<typeof db, "query">,
): Promise<WeeklyTimesheetStatusForDate> {
  const segment = getTimesheetSegmentForDate(date);
  const records = await reader.query.timesheet.findMany({
    where: or(
      and(
        eq(timesheet.userId, userId),
        inArray(timesheet.period, [segment.period, segment.competence]),
      ),
      timesheetId ? eq(timesheet.id, timesheetId) : undefined,
    ),
    columns: {
      id: true,
      userId: true,
      period: true,
      periodType: true,
      status: true,
    },
  });

  const weekly = records.find(
    (record) =>
      record.userId === userId &&
      record.period === segment.period &&
      record.periodType === "weekly",
  );
  const closedMonth = records.find(
    (record) =>
      record.userId === userId &&
      record.period === segment.competence &&
      record.periodType === "monthly" &&
      isTimesheetLockedStatus(record.status),
  );
  const closedLinkedSheet = records.find(
    (record) =>
      record.id === timesheetId && isTimesheetLockedStatus(record.status),
  );
  const effective = isTimesheetLockedStatus(weekly?.status)
    ? weekly
    : (closedMonth ?? closedLinkedSheet ?? weekly);
  const locked = isTimesheetLockedStatus(effective?.status);

  return {
    period: segment.period,
    periodStart: segment.start,
    periodEnd: segment.end,
    isSplit: segment.isSplit,
    timesheetId: effective?.id ?? null,
    status: effective?.status ?? null,
    locked,
    lockedPeriod: locked ? (effective?.period ?? null) : null,
  };
}

async function lockCompetences(
  tx: Transaction,
  dates: readonly TimeEntryDate[],
): Promise<void> {
  const keys = new Set(
    dates.map(({ userId, date }) =>
      createHash("sha256")
        .update(JSON.stringify([userId, date.slice(0, 7)]))
        .digest()
        .readInt32BE(),
    ),
  );

  // Take locks in numeric key order, even when two logical keys hash alike.
  for (const key of [...keys].sort((a, b) => a - b)) {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext('harvest:timesheet-period'), ${key})`,
    );
  }
}

/** Serialize a timesheet transition with entry writes in the affected month. */
export async function lockTimesheetPeriod(
  tx: Transaction,
  userId: string,
  period: string,
  periodType: string,
): Promise<void> {
  const { start, end } = getPeriodRange(period, periodType);
  await lockCompetences(tx, [
    { userId, date: start },
    { userId, date: end },
  ]);
}

/** Acquire all affected locks before re-reading status or locking entry rows. */
export async function assertTimesheetDatesUnlocked(
  tx: Transaction,
  dates: readonly TimeEntryDate[],
): Promise<void> {
  const linkedIds = [
    ...new Set(
      dates.flatMap(({ timesheetId }) => (timesheetId ? [timesheetId] : [])),
    ),
  ];
  // Existing links can point to an older period after an entry moves. Resolve
  // the immutable period keys now and read their current status after locking.
  const linkedPeriods = linkedIds.length
    ? await tx.query.timesheet.findMany({
        where: inArray(timesheet.id, linkedIds),
        columns: { userId: true, period: true, periodType: true },
      })
    : [];
  await lockCompetences(tx, [
    ...dates,
    ...linkedPeriods.flatMap(({ userId, period, periodType }) => {
      const { start, end } = getPeriodRange(period, periodType);
      return [
        { userId, date: start },
        { userId, date: end },
      ];
    }),
  ]);

  for (const date of dates) {
    await assertTimeEntryDateUnlocked(date, tx);
  }
}

export async function assertWeeklyTimesheetDateUnlocked(
  userId: string,
  date: string,
): Promise<WeeklyTimesheetStatusForDate> {
  return assertTimeEntryDateUnlocked({ userId, date });
}

/** Preview a single mutation. Persistence must use the transactional guard. */
export async function assertTimeEntryDateUnlocked(
  entry: TimeEntryDate,
  reader: Pick<typeof db, "query"> = db,
): Promise<WeeklyTimesheetStatusForDate> {
  const status = await getTimeEntryDateStatus(entry, reader);

  if (status.locked && status.status) {
    throw new LockedTimesheetPeriodError(
      entry.date,
      status.status,
      status.lockedPeriod ?? status.period,
    );
  }

  return status;
}
