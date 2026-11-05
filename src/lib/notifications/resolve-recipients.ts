import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeEntry, timesheet, user } from "@/lib/db/schema";
import { getTimesheetPeriodsForWeek } from "@/lib/timesheet-periods";
import { summarizeTimesheetWeek } from "@/lib/timesheet-week-status";
import { todayInAppTimeZoneAsDate } from "@/lib/timezone";
import { getPeriodRange } from "@/lib/utils";

export interface ReminderRecipient {
  id: string;
  name: string;
  email: string;
}

/** Returns current ISO week period string, e.g. "2026-W14" */
export function getISOWeekPeriod(date: Date = new Date()): string {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );
  const day = d.getUTCDay() || 7; // ISO: Mon=1 … Sun=7
  d.setUTCDate(d.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(
    ((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7,
  );
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export async function resolveReminderRecipients({
  actorId,
  scope,
  condition,
  userIds,
}: {
  actorId: string;
  scope: "all" | "direct_reports";
  condition: "all" | "not_submitted";
  userIds?: string[];
}): Promise<ReminderRecipient[]> {
  let candidates: ReminderRecipient[];

  if (userIds && userIds.length > 0) {
    // Individual selection: fetch only the specified users
    const rows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(inArray(user.id, userIds), eq(user.isActive, true)));
    candidates = rows;
  } else if (scope === "all") {
    // Admin bulk: all active users
    const rows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(eq(user.isActive, true));
    candidates = rows;
  } else {
    // Manager bulk: direct reports only
    const rows = await db
      .select({ id: user.id, name: user.name, email: user.email })
      .from(user)
      .where(and(eq(user.managerId, actorId), eq(user.isActive, true)));
    candidates = rows;
  }

  if (condition !== "not_submitted") {
    return candidates;
  }

  // Filter: keep only users who have NOT submitted their current week timesheet
  const currentPeriod = getISOWeekPeriod(todayInAppTimeZoneAsDate());
  const candidateIds = candidates.map((c) => c.id);

  if (candidateIds.length === 0) return [];

  const { start, end } = getPeriodRange(currentPeriod, "weekly");
  const [sheets, entries] = await Promise.all([
    db.query.timesheet.findMany({
      where: and(
        inArray(timesheet.userId, candidateIds),
        inArray(timesheet.period, getTimesheetPeriodsForWeek(currentPeriod)),
      ),
      columns: { userId: true, period: true, status: true },
    }),
    db
      .select({ userId: timeEntry.userId, date: timeEntry.date })
      .from(timeEntry)
      .where(
        and(
          inArray(timeEntry.userId, candidateIds),
          gte(timeEntry.date, start),
          lte(timeEntry.date, end),
          isNull(timeEntry.deletedAt),
        ),
      )
      .groupBy(timeEntry.userId, timeEntry.date),
  ]);
  return candidates.filter((candidate) => {
    const { status } = summarizeTimesheetWeek(
      currentPeriod,
      sheets.filter((sheet) => sheet.userId === candidate.id),
      entries
        .filter((entry) => entry.userId === candidate.id)
        .map((entry) => entry.date),
    );
    return status !== "submitted" && status !== "approved";
  });
}
