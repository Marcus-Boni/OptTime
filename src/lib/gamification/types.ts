import type { AchievementTier, GamificationEventKind } from "@/lib/db/schema";

export type { AchievementTier, GamificationEventKind };

/**
 * Counters kept on `user_gamification` that achievement progress reads from.
 *
 * Every achievement is metric-driven so progress, tier resolution and the
 * "next tier" hint share one code path.
 */
export type GamificationMetric =
  | "submittedWeeks"
  | "onTimeWeeks"
  | "consistentWeeks"
  | "balancedWeeks"
  | "detailedWeeks"
  | "approvedWeeks"
  | "bestStreak";

export type AchievementCategory = "ritmo" | "qualidade" | "bem-estar" | "marco";

export interface AchievementTierDefinition {
  tier: AchievementTier;
  /** Metric value required to unlock this tier. */
  threshold: number;
  xp: number;
  label: string;
}

export interface AchievementDefinition {
  key: string;
  name: string;
  description: string;
  /** Why this behaviour is worth rewarding — shown on the badge detail. */
  rationale: string;
  /** Lucide icon name, resolved to a component on the client. */
  icon: string;
  category: AchievementCategory;
  metric: GamificationMetric;
  /** Unit label for progress, e.g. "semanas". */
  unit: string;
  tiers: AchievementTierDefinition[];
}

/** An achievement rendered with the current user's progress applied. */
export interface AchievementProgress {
  key: string;
  name: string;
  description: string;
  rationale: string;
  icon: string;
  category: AchievementCategory;
  unit: string;
  /** Highest tier already unlocked, or null when still locked. */
  unlockedTier: AchievementTier | null;
  unlockedAt: string | null;
  /** Next tier to chase, or null once every tier is unlocked. */
  nextTier: AchievementTierDefinition | null;
  current: number;
  target: number;
  /** 0–1 progress toward `nextTier` (1 when fully complete). */
  progress: number;
  tiers: AchievementTierDefinition[];
  unlockedTiers: AchievementTier[];
}

export interface LevelDefinition {
  level: number;
  xp: number;
  title: string;
  blurb: string;
}

export interface ResolvedLevel {
  level: number;
  title: string;
  blurb: string;
  xp: number;
  /** XP at which the current level started. */
  floorXp: number;
  /** XP needed for the next level, or null at the top of the ladder. */
  ceilingXp: number | null;
  xpIntoLevel: number;
  xpForNextLevel: number | null;
  /** 0–1 progress within the current level. */
  progress: number;
  nextTitle: string | null;
}

/** Quality signals derived from one week of entries. */
export interface WeekSignals {
  period: string;
  start: string;
  end: string;
  totalMinutes: number;
  entryCount: number;
  businessDaysInPeriod: number;
  businessDaysCovered: number;
  maxDayMinutes: number;
  overworkedDays: number;
  weekendMinutes: number;
  richDescriptionRatio: number;
  /** Every business day of the week has at least one entry. */
  isConsistent: boolean;
  /** No overwork day, no weekend work, weekly total within a sane ceiling. */
  isBalanced: boolean;
  /** Most entries carry a description worth reading later. */
  isDetailed: boolean;
}

export interface XpReason {
  key: string;
  label: string;
  xp: number;
}

export interface AchievementUnlock {
  key: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: AchievementTier;
  tierLabel: string;
  xp: number;
}

/** Payload returned by the submit endpoint so the client can celebrate. */
export interface CelebrationPayload {
  period: string;
  periodLabel: string;
  totalMinutes: number;
  xpGained: number;
  xpTotal: number;
  reasons: XpReason[];
  streak: number;
  bestStreak: number;
  streakExtended: boolean;
  isPersonalBest: boolean;
  onTime: boolean;
  balanced: boolean;
  level: ResolvedLevel;
  leveledUp: boolean;
  previousLevel: number;
  unlocked: AchievementUnlock[];
  /** False when the user turned celebrations off in settings. */
  celebrationsEnabled: boolean;
  /** True when the week had already been credited (resubmission). */
  alreadyCredited: boolean;
}

export type InsightTone = "positive" | "neutral" | "attention";

export interface PersonalInsight {
  key: string;
  title: string;
  /** Headline figure, already formatted for display. */
  value: string;
  description: string;
  tone: InsightTone;
  icon: string;
  /** Percentage delta against the comparison window, when meaningful. */
  deltaPercentage: number | null;
}

export interface BalanceBreakdownItem {
  key: string;
  label: string;
  detail: string;
  /** Points removed from the 100-point balance score. */
  penalty: number;
  tone: InsightTone;
}

export interface BalanceReport {
  /** 0–100. Higher means a healthier, more sustainable rhythm. */
  score: number;
  label: string;
  summary: string;
  tone: InsightTone;
  breakdown: BalanceBreakdownItem[];
  /** Weeks analysed to produce the score. */
  weeksAnalysed: number;
}

export interface WeeklyTrendPoint {
  period: string;
  label: string;
  shortLabel: string;
  minutes: number;
  /** Timesheet state for the week, when one exists. */
  status: "open" | "submitted" | "approved" | "rejected" | null;
}

export interface PersonalInsightsReport {
  windowWeeks: number;
  insights: PersonalInsight[];
  balance: BalanceReport;
  trend: WeeklyTrendPoint[];
}

export interface GamificationActivityItem {
  id: string;
  kind: GamificationEventKind;
  label: string;
  xpDelta: number;
  period: string | null;
  createdAt: string;
}

export interface GamificationProfile {
  userId: string;
  userName: string;
  xp: number;
  level: ResolvedLevel;
  currentStreak: number;
  bestStreak: number;
  lastSubmittedPeriod: string | null;
  /** Week the user is expected to close next, e.g. "2026-W33". */
  currentPeriod: string;
  currentPeriodLabel: string;
  currentPeriodStatus: "open" | "submitted" | "approved" | "rejected";
  /** True when the streak survives only if the open week gets closed. */
  streakAtRisk: boolean;
  counters: Record<GamificationMetric, number>;
  achievements: AchievementProgress[];
  recentActivity: GamificationActivityItem[];
  preferences: {
    publicProfile: boolean;
    celebrationsEnabled: boolean;
  };
}

export interface MuralHighlight {
  userId: string;
  userName: string;
  userImage: string | null;
  achievementKey: string;
  achievementName: string;
  icon: string;
  tier: AchievementTier;
  tierLabel: string;
  unlockedAt: string;
}

export interface MuralRankingRow {
  position: number;
  userId: string;
  userName: string;
  userImage: string | null;
  xp: number;
  level: number;
  levelTitle: string;
  currentStreak: number;
  isCurrentUser: boolean;
}

export interface MuralWeekPulse {
  period: string;
  label: string;
  closed: number;
  total: number;
  /** 0–1 share of the team that closed the week. */
  rate: number;
}

export interface TeamMural {
  /** Non-empty only when the actor belongs to a team. */
  teamSize: number;
  currentWeek: MuralWeekPulse;
  history: MuralWeekPulse[];
  /** Consecutive weeks the team hit the collective goal. */
  collectiveStreak: number;
  /** Share of the team that must close a week for it to count. */
  collectiveGoal: number;
  highlights: MuralHighlight[];
  /** Populated only when an admin enabled the ranking and the user opted in. */
  ranking: MuralRankingRow[] | null;
  rankingEnabled: boolean;
  /** The viewer opted out, so they are hidden from mural and ranking. */
  viewerOptedOut: boolean;
}
