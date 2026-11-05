import { subWeeks } from "date-fns";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  gamificationEvent,
  timeEntry,
  timesheet,
  user,
  userAchievement,
} from "@/lib/db/schema";
import { getTimesheetPeriodsForWeek } from "@/lib/timesheet-periods";
import { summarizeTimesheetWeek } from "@/lib/timesheet-week-status";
import { getPeriodRange, getWeekPeriod } from "@/lib/utils";
import { buildAchievementProgress } from "./achievements";
import { ensureGamificationState, toCounters } from "./engine";
import { formatPeriodLabel } from "./format";
import { resolveLevel } from "./levels";
import type {
  GamificationActivityItem,
  GamificationEventKind,
  GamificationProfile,
} from "./types";

const ACTIVITY_LIMIT = 12;

/**
 * Assemble everything the Journey page and the sidebar widget need for one
 * user, in a single round of queries.
 */
export async function getGamificationProfile(
  userId: string,
): Promise<GamificationProfile> {
  const now = new Date();
  const currentPeriod = getWeekPeriod(now);
  const previousPeriod = getWeekPeriod(subWeeks(now, 1));
  const { start, end } = getPeriodRange(currentPeriod, "weekly");

  const state = await ensureGamificationState(userId);

  const [userRow, unlockedRows, events, currentSheets, currentEntries] =
    await Promise.all([
      db.query.user.findFirst({
        where: eq(user.id, userId),
        columns: { name: true },
      }),
      db.query.userAchievement.findMany({
        where: eq(userAchievement.userId, userId),
        columns: { achievementKey: true, tier: true, unlockedAt: true },
      }),
      db.query.gamificationEvent.findMany({
        where: eq(gamificationEvent.userId, userId),
        orderBy: [desc(gamificationEvent.createdAt)],
        limit: ACTIVITY_LIMIT,
      }),
      db.query.timesheet.findMany({
        where: and(
          eq(timesheet.userId, userId),
          inArray(timesheet.period, getTimesheetPeriodsForWeek(currentPeriod)),
        ),
        columns: { period: true, status: true },
      }),
      db.query.timeEntry.findMany({
        where: and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, start),
          lte(timeEntry.date, end),
          isNull(timeEntry.deletedAt),
        ),
        columns: { date: true },
      }),
    ]);

  // A stale `current_streak` would keep showing a chain that already broke, so
  // the displayed streak is validated against the last credited week.
  const streakAlive =
    state.lastSubmittedPeriod === currentPeriod ||
    state.lastSubmittedPeriod === previousPeriod;
  const currentStreak = streakAlive ? state.currentStreak : 0;

  const currentPeriodStatus =
    summarizeTimesheetWeek(
      currentPeriod,
      currentSheets,
      currentEntries.map((entry) => entry.date),
    ).status ?? "open";

  const counters = { ...toCounters(state), bestStreak: state.bestStreak };

  const recentActivity: GamificationActivityItem[] = events.map((event) => ({
    id: event.id,
    kind: event.kind as GamificationEventKind,
    label: event.label,
    xpDelta: event.xpDelta,
    period: event.period,
    createdAt: event.createdAt.toISOString(),
  }));

  return {
    userId,
    userName: userRow?.name ?? "",
    xp: state.xp,
    level: resolveLevel(state.xp),
    currentStreak,
    bestStreak: state.bestStreak,
    lastSubmittedPeriod: state.lastSubmittedPeriod,
    currentPeriod,
    currentPeriodLabel: formatPeriodLabel(currentPeriod),
    currentPeriodStatus,
    streakAtRisk:
      currentStreak > 0 &&
      state.lastSubmittedPeriod === previousPeriod &&
      currentPeriodStatus !== "submitted" &&
      currentPeriodStatus !== "approved",
    counters,
    achievements: buildAchievementProgress(counters, unlockedRows),
    recentActivity,
    preferences: {
      publicProfile: state.publicProfile,
      celebrationsEnabled: state.celebrationsEnabled,
    },
  };
}
