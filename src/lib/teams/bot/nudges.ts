/**
 * Ledger of the "sua reunião terminou" nudges.
 *
 * Claiming a row before the card is sent is what keeps overlapping cron runs
 * from asking twice about the same meeting; the same table remembers what the
 * person answered, and which recurring series they asked to never hear about.
 */

import { and, count, eq, notLike } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  type TeamsMeetingNudgeStatus,
  teamsMeetingNudge,
  user,
} from "@/lib/db/schema";

const SERIES_PREFIX = "series:";

export interface ClaimNudgeInput {
  userId: string;
  meetingId: string;
  meetingDate: string;
  proposalId: string;
}

/** True when this run owns the nudge; false when it was already sent. */
export async function claimNudge(input: ClaimNudgeInput): Promise<boolean> {
  const [claimed] = await db
    .insert(teamsMeetingNudge)
    .values({ id: crypto.randomUUID(), ...input, status: "sent" })
    .onConflictDoNothing()
    .returning({ id: teamsMeetingNudge.id });
  return Boolean(claimed);
}

export async function setNudgeStatus(
  proposalId: string,
  status: TeamsMeetingNudgeStatus,
): Promise<void> {
  await db
    .update(teamsMeetingNudge)
    .set({ status })
    .where(eq(teamsMeetingNudge.proposalId, proposalId));
}

/** Nudges already sent today, for the daily cap. Series mutes don't count. */
export async function countNudgesOn(
  userId: string,
  meetingDate: string,
): Promise<number> {
  const [row] = await db
    .select({ total: count() })
    .from(teamsMeetingNudge)
    .where(
      and(
        eq(teamsMeetingNudge.userId, userId),
        eq(teamsMeetingNudge.meetingDate, meetingDate),
        notLike(teamsMeetingNudge.meetingId, `${SERIES_PREFIX}%`),
      ),
    );
  return row?.total ?? 0;
}

/** Recurring series this person asked to stop hearing about. */
export async function loadMutedSeries(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ meetingId: teamsMeetingNudge.meetingId })
    .from(teamsMeetingNudge)
    .where(
      and(
        eq(teamsMeetingNudge.userId, userId),
        eq(teamsMeetingNudge.status, "muted"),
      ),
    );
  return new Set(
    rows
      .map((row) => row.meetingId)
      .filter((id) => id.startsWith(SERIES_PREFIX))
      .map((id) => id.slice(SERIES_PREFIX.length)),
  );
}

export async function muteSeries(
  userId: string,
  seriesId: string,
  meetingDate: string,
): Promise<void> {
  await db
    .insert(teamsMeetingNudge)
    .values({
      id: crypto.randomUUID(),
      userId,
      meetingId: `${SERIES_PREFIX}${seriesId}`,
      meetingDate,
      proposalId: crypto.randomUUID(),
      status: "muted",
    })
    .onConflictDoNothing();
}

export async function disableMeetingNudges(userId: string): Promise<void> {
  await db
    .update(user)
    .set({ teamsMeetingNudgeEnabled: false })
    .where(eq(user.id, userId));
}
