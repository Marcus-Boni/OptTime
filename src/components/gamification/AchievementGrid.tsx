"use client";

import { motion } from "framer-motion";
import { Lock } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CATEGORY_LABEL,
  CATEGORY_ORDER,
  LOCKED_VISUAL,
  resolveIcon,
  TIER_VISUALS,
} from "@/components/gamification/achievement-visuals";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  AchievementCategory,
  AchievementProgress,
} from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

export interface AchievementGridProps {
  achievements: AchievementProgress[];
}

type Filter = AchievementCategory | "all";

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
} as const;

function AchievementCard({
  achievement,
}: {
  achievement: AchievementProgress;
}) {
  const Icon = resolveIcon(achievement.icon);
  const visual = achievement.unlockedTier
    ? TIER_VISUALS[achievement.unlockedTier]
    : LOCKED_VISUAL;
  const isComplete = achievement.nextTier === null;
  const progressPercent = Math.round(achievement.progress * 100);

  return (
    <motion.div variants={itemVariants} className="h-full">
      <div
        className={cn(
          "group flex h-full flex-col rounded-xl border bg-background/60 p-4 transition-colors duration-150",
          achievement.unlockedTier
            ? "border-border/60 hover:border-brand-500/30"
            : "border-dashed border-border/60 hover:border-border",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-2",
              visual.surface,
              visual.ring,
            )}
          >
            <Icon className={cn("h-5 w-5", visual.ink)} aria-hidden="true" />
            {!achievement.unlockedTier ? (
              <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full border border-border bg-card">
                <Lock
                  className="h-2.5 w-2.5 text-muted-foreground"
                  aria-hidden="true"
                />
              </span>
            ) : null}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-foreground">
                {achievement.name}
              </h3>
              {achievement.unlockedTier ? (
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider",
                    visual.pill,
                  )}
                >
                  {visual.label}
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              {achievement.description}
            </p>
          </div>
        </div>

        <div className="mt-4 flex-1" />

        <div>
          <div className="mb-1.5 flex items-baseline justify-between text-xs">
            <span className="font-mono font-semibold tabular-nums text-foreground">
              {achievement.current}
              {isComplete ? "" : ` / ${achievement.target}`}
            </span>
            <span className="text-muted-foreground">
              {isComplete
                ? "Completa"
                : `${CATEGORY_LABEL[achievement.category]} · ${achievement.nextTier ? TIER_VISUALS[achievement.nextTier.tier].label : ""}`}
            </span>
          </div>
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label={`${achievement.name}: ${progressPercent}% do próximo nível`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-500",
                isComplete ? "bg-emerald-500" : "bg-brand-500",
              )}
              style={{ width: `${Math.max(progressPercent, 2)}%` }}
            />
          </div>

          <div className="mt-2.5 flex items-center gap-1">
            {achievement.tiers.map((tier) => {
              const unlocked = achievement.unlockedTiers.includes(tier.tier);
              return (
                <Tooltip key={tier.tier}>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "h-1.5 flex-1 cursor-help rounded-full",
                        unlocked ? TIER_VISUALS[tier.tier].dot : "bg-muted",
                      )}
                    />
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    <p className="font-medium">
                      {TIER_VISUALS[tier.tier].label} · {tier.label}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {unlocked ? "Desbloqueada" : `+${tier.xp} XP ao alcançar`}
                    </p>
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

/** Full achievement catalogue with a category filter. */
export function AchievementGrid({ achievements }: AchievementGridProps) {
  const [filter, setFilter] = useState<Filter>("all");

  const unlockedCount = useMemo(
    () =>
      achievements.reduce(
        (total, achievement) => total + achievement.unlockedTiers.length,
        0,
      ),
    [achievements],
  );
  const totalTiers = useMemo(
    () =>
      achievements.reduce(
        (total, achievement) => total + achievement.tiers.length,
        0,
      ),
    [achievements],
  );

  const visible = useMemo(
    () =>
      filter === "all"
        ? achievements
        : achievements.filter((achievement) => achievement.category === filter),
    [achievements, filter],
  );

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Todas" },
    ...CATEGORY_ORDER.map((category) => ({
      value: category as Filter,
      label: CATEGORY_LABEL[category],
    })),
  ];

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="font-display text-base">Conquistas</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {unlockedCount}
            </span>{" "}
            de {totalTiers} medalhas desbloqueadas.
          </p>
        </div>

        <fieldset className="m-0 flex flex-wrap gap-1 border-0 p-0">
          <legend className="sr-only">Filtrar conquistas por categoria</legend>
          {filters.map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? "secondary" : "ghost"}
              size="sm"
              className={cn(
                "h-7 px-3 text-xs",
                filter === option.value && "text-brand-500",
              )}
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
      </CardHeader>

      <CardContent>
        <motion.div
          key={filter}
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
        >
          {visible.map((achievement) => (
            <AchievementCard key={achievement.key} achievement={achievement} />
          ))}
        </motion.div>

        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nenhuma conquista nesta categoria ainda.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
