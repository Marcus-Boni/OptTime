import { TIER_LABEL, TIER_ORDER, TIER_XP } from "./constants";
import type {
  AchievementDefinition,
  AchievementProgress,
  AchievementTier,
  GamificationMetric,
} from "./types";

/**
 * Achievement catalogue.
 *
 * Every family is driven by a counter on `user_gamification`, which keeps tier
 * resolution, progress bars and the "next tier" hint on a single code path.
 * No family rewards hours logged — see `XP_RULES` for the reasoning.
 */
export const ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    key: "closer",
    name: "Fechador de Semanas",
    description: "Semanas submetidas ao longo da sua jornada.",
    rationale:
      "Fechar a semana é o que transforma apontamento em dado confiável para o time.",
    icon: "CheckCircle2",
    category: "marco",
    metric: "submittedWeeks",
    unit: "semanas",
    tiers: [
      { tier: "bronze", threshold: 1, xp: TIER_XP.bronze, label: "1 semana" },
      {
        tier: "silver",
        threshold: 10,
        xp: TIER_XP.silver,
        label: "10 semanas",
      },
      { tier: "gold", threshold: 26, xp: TIER_XP.gold, label: "26 semanas" },
      {
        tier: "platinum",
        threshold: 52,
        xp: TIER_XP.platinum,
        label: "52 semanas",
      },
    ],
  },
  {
    key: "streak",
    name: "Ritmo Constante",
    description: "Semanas seguidas fechadas, sem pular nenhuma.",
    rationale:
      "Constância vale mais que volume: um registro previsível elimina retrabalho no fechamento.",
    icon: "Flame",
    category: "ritmo",
    metric: "bestStreak",
    unit: "semanas seguidas",
    tiers: [
      { tier: "bronze", threshold: 2, xp: TIER_XP.bronze, label: "2 seguidas" },
      { tier: "silver", threshold: 4, xp: TIER_XP.silver, label: "4 seguidas" },
      { tier: "gold", threshold: 8, xp: TIER_XP.gold, label: "8 seguidas" },
      {
        tier: "platinum",
        threshold: 16,
        xp: TIER_XP.platinum,
        label: "16 seguidas",
      },
    ],
  },
  {
    key: "punctual",
    name: "Pontualidade",
    description: "Semanas fechadas até segunda-feira ao meio-dia.",
    rationale:
      "Fechar dentro do prazo destrava a aprovação e o faturamento sem cobranças.",
    icon: "AlarmClock",
    category: "ritmo",
    metric: "onTimeWeeks",
    unit: "semanas no prazo",
    tiers: [
      { tier: "bronze", threshold: 3, xp: TIER_XP.bronze, label: "3 no prazo" },
      { tier: "silver", threshold: 8, xp: TIER_XP.silver, label: "8 no prazo" },
      { tier: "gold", threshold: 20, xp: TIER_XP.gold, label: "20 no prazo" },
      {
        tier: "platinum",
        threshold: 40,
        xp: TIER_XP.platinum,
        label: "40 no prazo",
      },
    ],
  },
  {
    key: "consistency",
    name: "Dia a Dia",
    description: "Semanas com todos os dias úteis apontados.",
    rationale:
      "Registrar no mesmo dia evita reconstruir a semana de memória — e reconstruir de memória erra.",
    icon: "CalendarCheck",
    category: "qualidade",
    metric: "consistentWeeks",
    unit: "semanas completas",
    tiers: [
      { tier: "bronze", threshold: 1, xp: TIER_XP.bronze, label: "1 semana" },
      { tier: "silver", threshold: 5, xp: TIER_XP.silver, label: "5 semanas" },
      { tier: "gold", threshold: 12, xp: TIER_XP.gold, label: "12 semanas" },
      {
        tier: "platinum",
        threshold: 25,
        xp: TIER_XP.platinum,
        label: "25 semanas",
      },
    ],
  },
  {
    key: "balance",
    name: "Equilíbrio",
    description:
      "Semanas sem dia acima de 10h, sem fim de semana e dentro de um total saudável.",
    rationale:
      "Ritmo sustentável é resultado, não sorte. Esta conquista existe para deixar isso explícito.",
    icon: "HeartPulse",
    category: "bem-estar",
    metric: "balancedWeeks",
    unit: "semanas equilibradas",
    tiers: [
      { tier: "bronze", threshold: 2, xp: TIER_XP.bronze, label: "2 semanas" },
      { tier: "silver", threshold: 6, xp: TIER_XP.silver, label: "6 semanas" },
      { tier: "gold", threshold: 15, xp: TIER_XP.gold, label: "15 semanas" },
      {
        tier: "platinum",
        threshold: 30,
        xp: TIER_XP.platinum,
        label: "30 semanas",
      },
    ],
  },
  {
    key: "craft",
    name: "Bom de Detalhe",
    description: "Semanas em que as descrições contam o que foi feito.",
    rationale:
      "Uma descrição clara hoje é o que responde à pergunta do cliente três meses depois.",
    icon: "PenLine",
    category: "qualidade",
    metric: "detailedWeeks",
    unit: "semanas detalhadas",
    tiers: [
      { tier: "bronze", threshold: 2, xp: TIER_XP.bronze, label: "2 semanas" },
      { tier: "silver", threshold: 6, xp: TIER_XP.silver, label: "6 semanas" },
      { tier: "gold", threshold: 15, xp: TIER_XP.gold, label: "15 semanas" },
      {
        tier: "platinum",
        threshold: 30,
        xp: TIER_XP.platinum,
        label: "30 semanas",
      },
    ],
  },
  {
    key: "trusted",
    name: "Selo de Aprovação",
    description: "Semanas aprovadas pela gestão.",
    rationale:
      "Aprovação limpa significa que o registro sobreviveu à revisão de quem presta contas.",
    icon: "ShieldCheck",
    category: "marco",
    metric: "approvedWeeks",
    unit: "semanas aprovadas",
    tiers: [
      { tier: "bronze", threshold: 1, xp: TIER_XP.bronze, label: "1 aprovada" },
      {
        tier: "silver",
        threshold: 5,
        xp: TIER_XP.silver,
        label: "5 aprovadas",
      },
      { tier: "gold", threshold: 15, xp: TIER_XP.gold, label: "15 aprovadas" },
      {
        tier: "platinum",
        threshold: 30,
        xp: TIER_XP.platinum,
        label: "30 aprovadas",
      },
    ],
  },
] as const;

const ACHIEVEMENT_BY_KEY = new Map<string, AchievementDefinition>(
  ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]),
);

export function getAchievement(key: string): AchievementDefinition | null {
  return ACHIEVEMENT_BY_KEY.get(key) ?? null;
}

export function getTierLabel(tier: AchievementTier): string {
  return TIER_LABEL[tier];
}

function tierRank(tier: AchievementTier): number {
  return TIER_ORDER.indexOf(tier);
}

/** Highest tier whose threshold the metric already satisfies. */
export function highestTierFor(
  definition: AchievementDefinition,
  value: number,
): AchievementTier | null {
  let unlocked: AchievementTier | null = null;
  for (const tier of definition.tiers) {
    if (value >= tier.threshold) unlocked = tier.tier;
  }
  return unlocked;
}

export interface UnlockedAchievementRow {
  achievementKey: string;
  tier: string;
  unlockedAt: Date;
}

/**
 * Render the whole catalogue against a user's counters and unlock history.
 * Fully completed families settle at the end of the grid so the badges still
 * within reach stay in front of the user.
 */
export function buildAchievementProgress(
  counters: Record<GamificationMetric, number>,
  unlockedRows: UnlockedAchievementRow[],
): AchievementProgress[] {
  const unlockedByKey = new Map<
    string,
    { tier: AchievementTier; at: Date }[]
  >();

  for (const row of unlockedRows) {
    const tier = row.tier as AchievementTier;
    if (tierRank(tier) < 0) continue;
    const list = unlockedByKey.get(row.achievementKey) ?? [];
    list.push({ tier, at: row.unlockedAt });
    unlockedByKey.set(row.achievementKey, list);
  }

  const items = ACHIEVEMENTS.map<AchievementProgress>((definition) => {
    const current = counters[definition.metric] ?? 0;
    const unlockedList = unlockedByKey.get(definition.key) ?? [];
    const unlockedTiers = unlockedList
      .map((entry) => entry.tier)
      .sort((a, b) => tierRank(a) - tierRank(b));
    const topUnlocked = unlockedTiers[unlockedTiers.length - 1] ?? null;
    const topUnlockedAt = topUnlocked
      ? (unlockedList.find((entry) => entry.tier === topUnlocked)?.at ?? null)
      : null;

    const nextIndex = definition.tiers.findIndex(
      (tier) => current < tier.threshold,
    );
    const nextTier = nextIndex >= 0 ? definition.tiers[nextIndex] : null;
    const floor =
      nextIndex > 0 ? (definition.tiers[nextIndex - 1]?.threshold ?? 0) : 0;
    const span = nextTier ? nextTier.threshold - floor : 0;
    const lastTier = definition.tiers[definition.tiers.length - 1];

    return {
      key: definition.key,
      name: definition.name,
      description: definition.description,
      rationale: definition.rationale,
      icon: definition.icon,
      category: definition.category,
      unit: definition.unit,
      unlockedTier: topUnlocked,
      unlockedAt: topUnlockedAt ? topUnlockedAt.toISOString() : null,
      nextTier: nextTier ?? null,
      current,
      target: nextTier?.threshold ?? lastTier?.threshold ?? 0,
      progress: nextTier
        ? Math.max(0, Math.min(1, span > 0 ? (current - floor) / span : 0))
        : 1,
      tiers: [...definition.tiers],
      unlockedTiers,
    };
  });

  return items.sort((a, b) => {
    const aDone = a.nextTier === null ? 1 : 0;
    const bDone = b.nextTier === null ? 1 : 0;
    if (aDone !== bDone) return aDone - bDone;
    return b.progress - a.progress;
  });
}
