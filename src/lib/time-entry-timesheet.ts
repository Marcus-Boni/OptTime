import { eq } from "drizzle-orm";
import { timeEntry, timesheet } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/time-assistant/apply-day-plan";
import { assertTimesheetDatesUnlocked } from "@/lib/time-entry-locks";
import { getPeriodRange } from "@/lib/utils";

interface EntryDate {
  userId: string;
  date: string;
}

type TimeEntrySnapshot = Pick<
  typeof timeEntry.$inferSelect,
  "id" | "userId" | "date" | "projectId" | "timesheetId" | "deletedAt"
>;

/**
 * Check period locks first, in the same order as submissions. Reject a stale
 * snapshot if the entry has moved, been linked, or changed its deletion state.
 */
export async function lockTimeEntryForMutation(
  tx: DbTransaction,
  source: TimeEntrySnapshot,
  destination?: EntryDate,
): Promise<typeof timeEntry.$inferSelect | null> {
  const moving =
    destination &&
    (destination.userId !== source.userId || destination.date !== source.date);
  await assertTimesheetDatesUnlocked(
    tx,
    moving ? [source, destination] : [source],
  );
  const [current] = await tx
    .select()
    .from(timeEntry)
    .where(eq(timeEntry.id, source.id))
    .for("update");
  if (
    !current ||
    current.userId !== source.userId ||
    current.date !== source.date ||
    current.projectId !== source.projectId ||
    current.timesheetId !== source.timesheetId ||
    current.deletedAt?.getTime() !== source.deletedAt?.getTime()
  ) {
    return null;
  }
  return current;
}

/**
 * When an entry moves, keep the current link only if the timesheet still
 * owns its destination. An authorized submission can collect it again.
 */
export async function getRetainedTimeEntryTimesheetId(
  tx: DbTransaction,
  source: EntryDate & { timesheetId: string | null },
  destination: EntryDate,
): Promise<string | null> {
  if (!source.timesheetId || source.userId !== destination.userId) return null;
  if (source.date === destination.date) return source.timesheetId;

  const linked = await tx.query.timesheet.findFirst({
    where: eq(timesheet.id, source.timesheetId),
    columns: { userId: true, period: true, periodType: true },
  });
  if (!linked || linked.userId !== destination.userId) return null;

  const { start, end } = getPeriodRange(linked.period, linked.periodType);
  return destination.date >= start && destination.date <= end
    ? source.timesheetId
    : null;
}
