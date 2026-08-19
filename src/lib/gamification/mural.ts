import { subDays, subWeeks } from "date-fns";
import { and, desc, eq, gte, inArray, or, sql } from "drizzle-orm";
import type { ActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import {
  timesheet,
  user,
  userAchievement,
  userGamification,
} from "@/lib/db/schema";
import { getWeekPeriod } from "@/lib/utils";
import { getAchievement, getTierLabel } from "./achievements";
import { COLLECTIVE_GOAL, MURAL_HISTORY_WEEKS } from "./constants";
import { formatPeriodLabel } from "./format";
import { resolveLevel } from "./levels";
import { isRankingEnabled } from "./settings";
import type {
  AchievementTier,
  MuralHighlight,
  MuralRankingRow,
  MuralWeekPulse,
  TeamMural,
} from "./types";

const HIGHLIGHT_WINDOW_DAYS = 10;
const HIGHLIGHT_LIMIT = 8;
const RANKING_LIMIT = 10;

/**
 * Who shares a mural with the actor.
 *
 * Admins see the whole active org, managers see their direct reports, and a
 * member sees the peers reporting to the same manager. Nobody sees a group
 * they are not already part of.
 */
async function resolveTeamMemberIds(actor: ActorContext): Promise<string[]> {
  if (actor.role === "admin") {
    const rows = await db.query.user.findMany({
      where: eq(user.isActive, true),
      columns: { id: true },
    });
    return rows.map((row) => row.id);
  }

  if (actor.role === "manager") {
    const rows = await db.query.user.findMany({
      where: and(eq(user.isActive, true), eq(user.managerId, actor.userId)),
      columns: { id: true },
    });
    return [...new Set([actor.userId, ...rows.map((row) => row.id)])];
  }

  const self = await db.query.user.findFirst({
    where: eq(user.id, actor.userId),
    columns: { managerId: true },
  });

  if (!self?.managerId) return [actor.userId];

  const peers = await db.query.user.findMany({
    where: and(
      eq(user.isActive, true),
      or(eq(user.managerId, self.managerId), eq(user.id, self.managerId)),
    ),
    columns: { id: true },
  });

  return [...new Set([actor.userId, ...peers.map((row) => row.id)])];
}

function buildPeriods(reference: Date, count: number): string[] {
  const periods: string[] = [];
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    periods.push(getWeekPeriod(subWeeks(reference, offset)));
  }
  return periods;
}

function emptyMural(
  rankingEnabled: boolean,
  viewerOptedOut: boolean,
): TeamMural {
  const period = getWeekPeriod(new Date());
  return {
    teamSize: 0,
    currentWeek: {
      period,
      label: formatPeriodLabel(period),
      closed: 0,
      total: 0,
      rate: 0,
    },
    history: [],
    collectiveStreak: 0,
    collectiveGoal: COLLECTIVE_GOAL,
    highlights: [],
    ranking: null,
    rankingEnabled,
    viewerOptedOut,
  };
}

/**
 * Build the team culture mural: how the group is closing its weeks, which
 * achievements teammates unlocked recently, and — only when an admin turned it
 * on — the opt-in XP ranking.
 */
export async function getTeamMural(actor: ActorContext): Promise<TeamMural> {
  const [teamIds, rankingEnabled, viewerState] = await Promise.all([
    resolveTeamMemberIds(actor),
    isRankingEnabled(),
    db.query.userGamification.findFirst({
      where: eq(userGamification.userId, actor.userId),
      columns: { publicProfile: true },
    }),
  ]);

  const viewerOptedOut = viewerState?.publicProfile === false;

  if (teamIds.length <= 1) {
    return emptyMural(rankingEnabled, viewerOptedOut);
  }

  const now = new Date();
  const periods = buildPeriods(now, MURAL_HISTORY_WEEKS);
  const currentPeriod = periods[periods.length - 1] as string;

  const closedRows = await db
    .select({
      period: timesheet.period,
      closed: sql<number>`COUNT(DISTINCT ${timesheet.userId})`,
    })
    .from(timesheet)
    .where(
      and(
        inArray(timesheet.userId, teamIds),
        inArray(timesheet.period, periods),
        inArray(timesheet.status, ["submitted", "approved"]),
      ),
    )
    .groupBy(timesheet.period);

  const closedByPeriod = new Map(
    closedRows.map((row) => [row.period, Number(row.closed)]),
  );

  const history: MuralWeekPulse[] = periods.map((period) => {
    const closed = closedByPeriod.get(period) ?? 0;
    return {
      period,
      label: formatPeriodLabel(period),
      closed,
      total: teamIds.length,
      rate: teamIds.length > 0 ? closed / teamIds.length : 0,
    };
  });

  const currentWeek =
    history[history.length - 1] ??
    ({
      period: currentPeriod,
      label: formatPeriodLabel(currentPeriod),
      closed: 0,
      total: teamIds.length,
      rate: 0,
    } satisfies MuralWeekPulse);

  // The open week is still in progress, so the collective streak is counted
  // from the last finished week backwards.
  let collectiveStreak = 0;
  for (let i = history.length - 2; i >= 0; i -= 1) {
    const week = history[i];
    if (week && week.rate >= COLLECTIVE_GOAL) collectiveStreak += 1;
    else break;
  }

  const highlightRows = await db
    .select({
      userId: userAchievement.userId,
      userName: user.name,
      userImage: user.image,
      achievementKey: userAchievement.achievementKey,
      tier: userAchievement.tier,
      unlockedAt: userAchievement.unlockedAt,
    })
    .from(userAchievement)
    .innerJoin(user, eq(user.id, userAchievement.userId))
    .innerJoin(
      userGamification,
      eq(userGamification.userId, userAchievement.userId),
    )
    .where(
      and(
        inArray(userAchievement.userId, teamIds),
        eq(userGamification.publicProfile, true),
        gte(userAchievement.unlockedAt, subDays(now, HIGHLIGHT_WINDOW_DAYS)),
      ),
    )
    .orderBy(desc(userAchievement.unlockedAt))
    .limit(HIGHLIGHT_LIMIT);

  const highlights: MuralHighlight[] = highlightRows.flatMap((row) => {
    const definition = getAchievement(row.achievementKey);
    if (!definition) return [];
    const tier = row.tier as AchievementTier;

    return [
      {
        userId: row.userId,
        userName: row.userName,
        userImage: row.userImage,
        achievementKey: row.achievementKey,
        achievementName: definition.name,
        icon: definition.icon,
        tier,
        tierLabel: getTierLabel(tier),
        unlockedAt: row.unlockedAt.toISOString(),
      },
    ];
  });

  let ranking: MuralRankingRow[] | null = null;

  // The ranking needs both an org-level switch and the viewer's own opt-in:
  // someone who hid their profile does not get to browse everyone else's.
  if (rankingEnabled && !viewerOptedOut) {
    const rows = await db
      .select({
        userId: userGamification.userId,
        userName: user.name,
        userImage: user.image,
        xp: userGamification.xp,
        currentStreak: userGamification.currentStreak,
      })
      .from(userGamification)
      .innerJoin(user, eq(user.id, userGamification.userId))
      .where(
        and(
          inArray(userGamification.userId, teamIds),
          eq(userGamification.publicProfile, true),
          eq(user.isActive, true),
        ),
      )
      .orderBy(desc(userGamification.xp));

    const full = rows.map<MuralRankingRow>((row, index) => {
      const level = resolveLevel(row.xp);
      return {
        position: index + 1,
        userId: row.userId,
        userName: row.userName,
        userImage: row.userImage,
        xp: row.xp,
        level: level.level,
        levelTitle: level.title,
        currentStreak: row.currentStreak,
        isCurrentUser: row.userId === actor.userId,
      };
    });

    const top = full.slice(0, RANKING_LIMIT);
    const viewerRow = full.find((row) => row.isCurrentUser);
    // Keep the viewer visible even when they sit outside the top slice.
    if (viewerRow && !top.some((row) => row.isCurrentUser)) {
      top.push(viewerRow);
    }
    ranking = top;
  }

  return {
    teamSize: teamIds.length,
    currentWeek,
    history,
    collectiveStreak,
    collectiveGoal: COLLECTIVE_GOAL,
    highlights,
    ranking,
    rankingEnabled,
    viewerOptedOut,
  };
}
