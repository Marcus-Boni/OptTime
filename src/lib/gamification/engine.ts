import { addDays, subDays } from "date-fns";
import { and, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  gamificationEvent,
  timeEntry,
  userAchievement,
  userGamification,
} from "@/lib/db/schema";
import { getPeriodRange, getWeekPeriod, parseLocalDate } from "@/lib/utils";
import { ACHIEVEMENTS, getTierLabel, highestTierFor } from "./achievements";
import { QUALITY_THRESHOLDS, XP_RULES } from "./constants";
import { formatPeriodLabel } from "./format";
import { resolveLevel } from "./levels";
import type {
  AchievementUnlock,
  CelebrationPayload,
  GamificationMetric,
  WeekSignals,
  XpReason,
} from "./types";
import { computeWeekSignals } from "./week-signals";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = typeof db | Transaction;

type GamificationRow = typeof userGamification.$inferSelect;

export type CounterMap = Record<GamificationMetric, number>;

export function toCounters(row: GamificationRow): CounterMap {
  return {
    submittedWeeks: row.submittedWeeks,
    onTimeWeeks: row.onTimeWeeks,
    consistentWeeks: row.consistentWeeks,
    balancedWeeks: row.balancedWeeks,
    detailedWeeks: row.detailedWeeks,
    approvedWeeks: row.approvedWeeks,
    bestStreak: row.bestStreak,
  };
}

/** Read the user's gamification row, creating the default one on first touch. */
export async function ensureGamificationState(
  userId: string,
  executor: Executor = db,
): Promise<GamificationRow> {
  const existing = await executor.query.userGamification.findFirst({
    where: eq(userGamification.userId, userId),
  });
  if (existing) return existing;

  const [created] = await executor
    .insert(userGamification)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return created;

  // Lost the race against a concurrent insert — re-read the winner's row.
  const row = await executor.query.userGamification.findFirst({
    where: eq(userGamification.userId, userId),
  });
  if (!row) throw new Error("Failed to initialise gamification state");
  return row;
}

/** ISO week immediately before `period`. */
function previousWeekPeriod(period: string): string {
  const { start } = getPeriodRange(period, "weekly");
  return getWeekPeriod(subDays(parseLocalDate(start), 1));
}

/**
 * Weekly deadline: Monday noon after the period closes.
 *
 * Deliberately not Friday evening — a deadline that lands during the weekend
 * turns "close your week" into unpaid Sunday work.
 */
export function submissionDeadline(periodEnd: string): Date {
  const deadline = addDays(parseLocalDate(periodEnd), 1);
  deadline.setHours(QUALITY_THRESHOLDS.deadlineHour, 0, 0, 0);
  return deadline;
}

async function loadWeekSignals(
  userId: string,
  period: string,
  periodType: string,
  executor: Executor,
): Promise<WeekSignals> {
  const { start, end } = getPeriodRange(period, periodType);

  const entries = await executor
    .select({
      date: timeEntry.date,
      duration: timeEntry.duration,
      description: timeEntry.description,
    })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.userId, userId),
        sql`${timeEntry.date} >= ${start}`,
        sql`${timeEntry.date} <= ${end}`,
        isNull(timeEntry.deletedAt),
      ),
    );

  return computeWeekSignals(period, start, end, entries);
}

interface UnlockResult {
  unlocked: AchievementUnlock[];
  xp: number;
}

/**
 * Persist every tier the updated counters just crossed.
 *
 * The unique index on (user, achievement, tier) is the source of truth, so a
 * replayed award credits XP exactly once even under concurrent writes.
 */
async function unlockAchievements(
  userId: string,
  counters: CounterMap,
  period: string | null,
  executor: Executor,
): Promise<UnlockResult> {
  const unlocked: AchievementUnlock[] = [];
  let xp = 0;

  for (const definition of ACHIEVEMENTS) {
    const value = counters[definition.metric] ?? 0;
    const reachedTier = highestTierFor(definition, value);
    if (!reachedTier) continue;

    for (const tier of definition.tiers) {
      if (value < tier.threshold) continue;

      const inserted = await executor
        .insert(userAchievement)
        .values({
          id: crypto.randomUUID(),
          userId,
          achievementKey: definition.key,
          tier: tier.tier,
          period,
        })
        .onConflictDoNothing()
        .returning({ id: userAchievement.id });

      if (inserted.length === 0) continue;

      xp += tier.xp;
      unlocked.push({
        key: definition.key,
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        category: definition.category,
        tier: tier.tier,
        tierLabel: getTierLabel(tier.tier),
        xp: tier.xp,
      });
    }
  }

  return { unlocked, xp };
}

async function recordEvent(
  executor: Executor,
  input: {
    userId: string;
    kind: string;
    label: string;
    xpDelta: number;
    period: string | null;
    metadata?: unknown;
  },
): Promise<void> {
  await executor.insert(gamificationEvent).values({
    id: crypto.randomUUID(),
    userId: input.userId,
    kind: input.kind,
    label: input.label,
    xpDelta: input.xpDelta,
    period: input.period,
    metadata: input.metadata ? JSON.stringify(input.metadata) : null,
  });
}

export interface AwardSubmissionInput {
  userId: string;
  period: string;
  periodType: string;
  submittedAt: Date;
  totalMinutes: number;
}

/**
 * Credit a closed week: XP, streak, counters and any achievement tiers it
 * crossed. Returns everything the client needs to run the celebration.
 *
 * Idempotent per period — resubmitting an already-credited week returns the
 * current state with `alreadyCredited: true` and awards nothing.
 */
export async function awardWeekSubmission(
  input: AwardSubmissionInput,
): Promise<CelebrationPayload> {
  const { userId, period, periodType, submittedAt, totalMinutes } = input;

  const signals = await loadWeekSignals(userId, period, periodType, db);

  return db.transaction(async (tx) => {
    const state = await ensureGamificationState(userId, tx);
    const previousLevel = resolveLevel(state.xp);
    const periodLabel = formatPeriodLabel(period, periodType);

    if (state.lastSubmittedPeriod === period) {
      return {
        period,
        periodLabel,
        totalMinutes,
        xpGained: 0,
        xpTotal: state.xp,
        reasons: [],
        streak: state.currentStreak,
        bestStreak: state.bestStreak,
        streakExtended: false,
        isPersonalBest: false,
        onTime: false,
        balanced: signals.isBalanced,
        level: previousLevel,
        leveledUp: false,
        previousLevel: previousLevel.level,
        unlocked: [],
        celebrationsEnabled: state.celebrationsEnabled,
        alreadyCredited: true,
      } satisfies CelebrationPayload;
    }

    const { end } = getPeriodRange(period, periodType);
    const onTime = submittedAt <= submissionDeadline(end);

    // Backfilling an older week must not break the streak that later weeks
    // already earned, so only forward progress touches it.
    const isForwardProgress =
      periodType === "weekly" &&
      (!state.lastSubmittedPeriod || period > state.lastSubmittedPeriod);
    const continuesStreak =
      isForwardProgress &&
      state.lastSubmittedPeriod === previousWeekPeriod(period);

    let currentStreak = state.currentStreak;
    if (isForwardProgress) {
      currentStreak = continuesStreak ? state.currentStreak + 1 : 1;
    }
    const bestStreak = Math.max(state.bestStreak, currentStreak);
    const isPersonalBest =
      isForwardProgress &&
      currentStreak > state.bestStreak &&
      currentStreak > 1;

    const reasons: XpReason[] = [
      {
        key: "week_submitted",
        label: "Semana fechada",
        xp: XP_RULES.weekSubmitted,
      },
    ];
    if (onTime) {
      reasons.push({
        key: "on_time",
        label: "Dentro do prazo",
        xp: XP_RULES.onTime,
      });
    }
    if (signals.isConsistent) {
      reasons.push({
        key: "consistency",
        label: "Dias úteis apontados",
        xp: XP_RULES.consistency,
      });
    }
    if (signals.isBalanced) {
      reasons.push({
        key: "balance",
        label: "Ritmo equilibrado",
        xp: XP_RULES.balance,
      });
    }
    if (signals.isDetailed) {
      reasons.push({
        key: "detail",
        label: "Descrições completas",
        xp: XP_RULES.detail,
      });
    }
    if (currentStreak > 1) {
      const streakWeeks = Math.min(currentStreak, XP_RULES.streakCap);
      reasons.push({
        key: "streak",
        label: `Sequência de ${currentStreak} semanas`,
        xp: streakWeeks * XP_RULES.streakPerWeek,
      });
    }

    const baseXp = reasons.reduce((total, reason) => total + reason.xp, 0);

    const counters: CounterMap = {
      submittedWeeks: state.submittedWeeks + 1,
      onTimeWeeks: state.onTimeWeeks + (onTime ? 1 : 0),
      consistentWeeks: state.consistentWeeks + (signals.isConsistent ? 1 : 0),
      balancedWeeks: state.balancedWeeks + (signals.isBalanced ? 1 : 0),
      detailedWeeks: state.detailedWeeks + (signals.isDetailed ? 1 : 0),
      approvedWeeks: state.approvedWeeks,
      bestStreak,
    };

    const { unlocked, xp: achievementXp } = await unlockAchievements(
      userId,
      counters,
      period,
      tx,
    );

    const xpGained = baseXp + achievementXp;
    const xpTotal = state.xp + xpGained;

    await tx
      .update(userGamification)
      .set({
        xp: xpTotal,
        currentStreak,
        bestStreak,
        lastSubmittedPeriod: isForwardProgress
          ? period
          : state.lastSubmittedPeriod,
        lastSubmittedAt: submittedAt,
        submittedWeeks: counters.submittedWeeks,
        onTimeWeeks: counters.onTimeWeeks,
        consistentWeeks: counters.consistentWeeks,
        balancedWeeks: counters.balancedWeeks,
        detailedWeeks: counters.detailedWeeks,
      })
      .where(eq(userGamification.userId, userId));

    await recordEvent(tx, {
      userId,
      kind: "week_submitted",
      label: `${periodLabel} fechada`,
      xpDelta: baseXp,
      period,
      metadata: { reasons, onTime, signals },
    });

    if (isForwardProgress && currentStreak > 1) {
      await recordEvent(tx, {
        userId,
        kind: "streak_extended",
        label: `Sequência de ${currentStreak} semanas`,
        xpDelta: 0,
        period,
      });
    } else if (isForwardProgress && state.currentStreak > 1) {
      await recordEvent(tx, {
        userId,
        kind: "streak_reset",
        label: `Sequência reiniciada (era ${state.currentStreak} semanas)`,
        xpDelta: 0,
        period,
      });
    }

    for (const achievement of unlocked) {
      await recordEvent(tx, {
        userId,
        kind: "achievement_unlocked",
        label: `${achievement.name} · ${achievement.tierLabel}`,
        xpDelta: achievement.xp,
        period,
        metadata: { key: achievement.key, tier: achievement.tier },
      });
    }

    const level = resolveLevel(xpTotal);

    return {
      period,
      periodLabel,
      totalMinutes,
      xpGained,
      xpTotal,
      reasons,
      streak: currentStreak,
      bestStreak,
      streakExtended: continuesStreak,
      isPersonalBest,
      onTime,
      balanced: signals.isBalanced,
      level,
      leveledUp: level.level > previousLevel.level,
      previousLevel: previousLevel.level,
      unlocked,
      celebrationsEnabled: state.celebrationsEnabled,
      alreadyCredited: false,
    } satisfies CelebrationPayload;
  });
}

/**
 * Credit a manager approval. Fire-and-forget from the approval route: a
 * failure here must never block the approval itself.
 */
export async function awardWeekApproval(
  userId: string,
  period: string,
  periodType = "weekly",
): Promise<void> {
  const alreadyCredited = await db.query.gamificationEvent.findFirst({
    where: and(
      eq(gamificationEvent.userId, userId),
      eq(gamificationEvent.kind, "week_approved"),
      eq(gamificationEvent.period, period),
    ),
    columns: { id: true },
  });
  if (alreadyCredited) return;

  await db.transaction(async (tx) => {
    const state = await ensureGamificationState(userId, tx);
    const counters: CounterMap = {
      ...toCounters(state),
      approvedWeeks: state.approvedWeeks + 1,
    };

    const { unlocked, xp: achievementXp } = await unlockAchievements(
      userId,
      counters,
      period,
      tx,
    );
    const xpGained = XP_RULES.weekApproved + achievementXp;

    await tx
      .update(userGamification)
      .set({
        xp: state.xp + xpGained,
        approvedWeeks: counters.approvedWeeks,
      })
      .where(eq(userGamification.userId, userId));

    await recordEvent(tx, {
      userId,
      kind: "week_approved",
      label: `${formatPeriodLabel(period, periodType)} aprovada`,
      xpDelta: XP_RULES.weekApproved,
      period,
    });

    for (const achievement of unlocked) {
      await recordEvent(tx, {
        userId,
        kind: "achievement_unlocked",
        label: `${achievement.name} · ${achievement.tierLabel}`,
        xpDelta: achievement.xp,
        period,
        metadata: { key: achievement.key, tier: achievement.tier },
      });
    }
  });
}
