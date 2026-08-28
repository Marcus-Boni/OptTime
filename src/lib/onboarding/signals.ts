import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitation, timeEntry, timesheet } from "@/lib/db/schema";
import type { OnboardingSignals } from "@/lib/onboarding/types";
import type { UserRole } from "@/types/user";

const EMPTY_SIGNALS: OnboardingSignals = {
  hasTimeEntry: false,
  hasTimerEntry: false,
  hasSubmittedTimesheet: false,
  hasApprovedTimesheet: false,
  hasSentInvitation: false,
};

/**
 * Facts about what the user already did, used to tick checklist items without
 * asking them to confirm anything.
 *
 * Every query is an existence check (`limit 1`) against an indexed column, so
 * the whole batch stays cheap enough to run on each dashboard load.
 */
export async function getOnboardingSignals(
  userId: string,
  role: UserRole,
): Promise<OnboardingSignals> {
  const isLeadership = role === "manager" || role === "admin";

  const [entry, timerEntry, submitted, approved, invited] = await Promise.all([
    db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.userId, userId),
        sql`${timeEntry.deletedAt} IS NULL`,
      ),
      columns: { id: true },
    }),
    db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.userId, userId),
        isNotNull(timeEntry.startTime),
        sql`${timeEntry.deletedAt} IS NULL`,
      ),
      columns: { id: true },
    }),
    db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.userId, userId),
        inArray(timesheet.status, ["submitted", "approved", "rejected"]),
      ),
      columns: { id: true },
    }),
    isLeadership
      ? db.query.timesheet.findFirst({
          where: eq(timesheet.approvedBy, userId),
          columns: { id: true },
        })
      : Promise.resolve(undefined),
    role === "admin"
      ? db.query.invitation.findFirst({
          where: eq(invitation.invitedById, userId),
          columns: { id: true },
        })
      : Promise.resolve(undefined),
  ]);

  return {
    hasTimeEntry: Boolean(entry),
    hasTimerEntry: Boolean(timerEntry),
    hasSubmittedTimesheet: Boolean(submitted),
    hasApprovedTimesheet: Boolean(approved),
    hasSentInvitation: Boolean(invited),
  };
}

/** Used when the signal queries fail: the checklist degrades, never breaks. */
export function emptySignals(): OnboardingSignals {
  return { ...EMPTY_SIGNALS };
}
