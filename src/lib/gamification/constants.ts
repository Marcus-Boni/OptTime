import type { AchievementTier, LevelDefinition } from "./types";

/**
 * XP is awarded for behaviours that make the timesheet trustworthy — closing
 * the week, closing it on time, describing the work, keeping a sustainable
 * rhythm. It is never awarded for the number of hours logged, so the system
 * cannot be gamed by inflating time, and it never rewards overwork.
 */
export const XP_RULES = {
  /** Closing a week, regardless of how many hours it holds. */
  weekSubmitted: 100,
  /** Closed before the Monday-noon deadline. */
  onTime: 50,
  /** Every business day of the week has at least one entry. */
  consistency: 40,
  /** No overwork day, no weekend work, weekly total within a sane ceiling. */
  balance: 30,
  /** Most entries carry a description that will still make sense next month. */
  detail: 20,
  /** Per consecutive week, capped by `streakCap`. */
  streakPerWeek: 10,
  streakCap: 10,
  /** Credited when a manager approves the week. */
  weekApproved: 50,
} as const;

export const TIER_XP: Record<AchievementTier, number> = {
  bronze: 50,
  silver: 120,
  gold: 250,
  platinum: 500,
};

export const TIER_LABEL: Record<AchievementTier, string> = {
  bronze: "Bronze",
  silver: "Prata",
  gold: "Ouro",
  platinum: "Platina",
};

export const TIER_ORDER: readonly AchievementTier[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
];

export const QUALITY_THRESHOLDS = {
  /** A single day above this counts as overwork. */
  overworkDayMinutes: 10 * 60,
  /** Descriptions shorter than this are treated as placeholders. */
  richDescriptionChars: 15,
  /** Share of entries that must be descriptive for the detail bonus. */
  richDescriptionRatio: 0.8,
  /**
   * Business days with entries needed for the consistency bonus. Below the
   * full five on purpose: a day off must not cost the badge.
   */
  consistencyMinDays: 4,
  /** Weekly total above this is unsustainable, even if spread out. */
  sustainableWeeklyMinutes: 45 * 60,
  /** Hour of Monday (local) by which the previous week must be closed. */
  deadlineHour: 12,
} as const;

/** Weeks the balance report and personal insights look back over. */
export const INSIGHT_WINDOW_WEEKS = 8;

/** Share of the team that must close a week for the collective streak. */
export const COLLECTIVE_GOAL = 0.8;

/** Weeks shown on the team mural pulse chart. */
export const MURAL_HISTORY_WEEKS = 6;

/** System setting key for the admin-controlled XP ranking. */
export const RANKING_SETTING_KEY = "gamification.ranking_enabled";

/**
 * Level ladder. Titles describe reliability, not volume — a deliberate choice
 * so the top of the ladder reads as "dependable", never as "works the most".
 */
export const LEVELS: readonly LevelDefinition[] = [
  {
    level: 1,
    xp: 0,
    title: "Iniciante",
    blurb: "Primeiros passos no registro de horas.",
  },
  {
    level: 2,
    xp: 250,
    title: "Aprendiz",
    blurb: "Já pegou o jeito de fechar a semana.",
  },
  {
    level: 3,
    xp: 600,
    title: "Consistente",
    blurb: "Registro presente semana após semana.",
  },
  {
    level: 4,
    xp: 1100,
    title: "Ritmo Certo",
    blurb: "Rotina estabelecida, sem correria na sexta.",
  },
  {
    level: 5,
    xp: 1800,
    title: "Metronômico",
    blurb: "Previsível no melhor dos sentidos.",
  },
  {
    level: 6,
    xp: 2700,
    title: "Confiável",
    blurb: "Seus dados sustentam decisões da equipe.",
  },
  {
    level: 7,
    xp: 3900,
    title: "Referência",
    blurb: "Exemplo de como fechar uma semana bem feita.",
  },
  {
    level: 8,
    xp: 5400,
    title: "Mestre do Tempo",
    blurb: "Qualidade e pontualidade viraram hábito.",
  },
  {
    level: 9,
    xp: 7300,
    title: "Guardião do Ritmo",
    blurb: "Sustenta o padrão mesmo em semanas difíceis.",
  },
  {
    level: 10,
    xp: 9600,
    title: "Lenda OptSolv",
    blurb: "Referência absoluta em disciplina de apontamento.",
  },
] as const;

/** XP added per level once the named ladder ends. */
export const XP_PER_PRESTIGE_LEVEL = 2600;
