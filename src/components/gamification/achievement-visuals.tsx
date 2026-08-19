"use client";

import {
  Activity,
  AlarmClock,
  Award,
  CalendarCheck,
  CalendarHeart,
  CheckCircle2,
  Flame,
  HeartPulse,
  Layers,
  type LucideIcon,
  PenLine,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Target,
} from "lucide-react";
import type {
  AchievementCategory,
  AchievementTier,
  InsightTone,
} from "@/lib/gamification/types";

/**
 * Icons are stored as names in the catalogue so the server never ships React
 * components; this map is the single place that resolves them.
 */
const ICONS: Record<string, LucideIcon> = {
  Activity,
  AlarmClock,
  Award,
  CalendarCheck,
  CalendarHeart,
  CheckCircle2,
  Flame,
  HeartPulse,
  Layers,
  PenLine,
  ShieldCheck,
  Sparkles,
  Sunrise,
  Target,
};

export function resolveIcon(name: string): LucideIcon {
  return ICONS[name] ?? Award;
}

export interface TierVisual {
  label: string;
  /** Badge medallion surface. */
  surface: string;
  /** Icon and text colour on the medallion. */
  ink: string;
  /** Ring around the medallion. */
  ring: string;
  /** Small pill used in lists and the mural. */
  pill: string;
  /** Solid fill for the tier progress dots. */
  dot: string;
}

export const TIER_VISUALS: Record<AchievementTier, TierVisual> = {
  bronze: {
    label: "Bronze",
    surface: "bg-amber-700/15",
    ink: "text-amber-600 dark:text-amber-500",
    ring: "ring-amber-700/30",
    pill: "border-amber-700/30 bg-amber-700/10 text-amber-700 dark:text-amber-400",
    dot: "bg-amber-700",
  },
  silver: {
    label: "Prata",
    surface: "bg-slate-400/15",
    ink: "text-slate-500 dark:text-slate-300",
    ring: "ring-slate-400/35",
    pill: "border-slate-400/35 bg-slate-400/10 text-slate-600 dark:text-slate-300",
    dot: "bg-slate-400",
  },
  gold: {
    label: "Ouro",
    surface: "bg-amber-400/20",
    ink: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-400/45",
    pill: "border-amber-400/40 bg-amber-400/10 text-amber-700 dark:text-amber-300",
    dot: "bg-amber-400",
  },
  platinum: {
    label: "Platina",
    surface: "bg-cyan-400/15",
    ink: "text-cyan-600 dark:text-cyan-300",
    ring: "ring-cyan-400/40",
    pill: "border-cyan-400/40 bg-cyan-400/10 text-cyan-700 dark:text-cyan-300",
    dot: "bg-cyan-400",
  },
};

export const LOCKED_VISUAL: TierVisual = {
  label: "Bloqueada",
  surface: "bg-muted/60",
  ink: "text-muted-foreground",
  ring: "ring-border",
  pill: "border-border bg-muted/50 text-muted-foreground",
  dot: "bg-muted",
};

export const CATEGORY_LABEL: Record<AchievementCategory, string> = {
  ritmo: "Ritmo",
  qualidade: "Qualidade",
  "bem-estar": "Bem-estar",
  marco: "Marcos",
};

export const CATEGORY_ORDER: readonly AchievementCategory[] = [
  "ritmo",
  "qualidade",
  "bem-estar",
  "marco",
];

export const TONE_CLASS: Record<InsightTone, string> = {
  positive: "text-emerald-600 dark:text-emerald-400",
  neutral: "text-muted-foreground",
  attention: "text-amber-600 dark:text-amber-400",
};

export const TONE_SURFACE: Record<InsightTone, string> = {
  positive: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  neutral: "bg-muted text-muted-foreground",
  attention: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};
