import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeEntry, timesheet } from "@/lib/db/schema";
import {
  getBaseWeekPeriod,
  getWeekSegments,
  isSplitPeriod,
} from "@/lib/timesheet-periods";

/**
 * Resolves which period gamification should credit after a timesheet moves
 * to `closedStatuses`.
 *
 * Rewards stay per ISO week even though a week that crosses a month boundary
 * is closed in two slices: crediting each slice would pay twice for the same
 * week. The week is credited once, when its last slice with entries closes.
 *
 * Returns the period to credit (the week itself for regular weeks, the base
 * ISO week for split ones) or `null` while a sibling slice with entries is
 * still open.
 */
export async function resolveClosedWeekAwardPeriod(
  userId: string,
  period: string,
  periodType: string,
  closedStatuses: readonly string[],
): Promise<string | null> {
  if (periodType !== "weekly" || !isSplitPeriod(period)) return period;

  const siblings = getWeekSegments(period).filter(
    (segment) => segment.period !== period,
  );
  if (siblings.length === 0) return getBaseWeekPeriod(period);

  const records = await db.query.timesheet.findMany({
    where: and(
      eq(timesheet.userId, userId),
      inArray(
        timesheet.period,
        siblings.map((segment) => segment.period),
      ),
    ),
    columns: { period: true, status: true },
  });
  const statusByPeriod = new Map(
    records.map((record) => [record.period, record.status]),
  );

  for (const sibling of siblings) {
    const status = statusByPeriod.get(sibling.period);
    if (status && closedStatuses.includes(status)) continue;

    const [row] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, sibling.start),
          lte(timeEntry.date, sibling.end),
          isNull(timeEntry.deletedAt),
        ),
      );

    // An empty slice never gets submitted, so it must not hold the week back.
    if (Number(row?.count ?? 0) > 0) return null;
  }

  return getBaseWeekPeriod(period);
}
