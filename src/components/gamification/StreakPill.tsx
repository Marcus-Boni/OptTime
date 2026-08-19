"use client";

import { Flame } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useGamificationProfile } from "@/hooks/use-gamification";
import { cn } from "@/lib/utils";

export interface StreakPillProps {
  /** Hides the pill while the profile is still loading. */
  enabled?: boolean;
  className?: string;
}

/**
 * Compact streak indicator for the sidebar.
 *
 * Turns amber when the streak is one unclosed week away from breaking, which
 * is the only nudge the sidebar ever shows about gamification.
 */
export function StreakPill({ enabled = true, className }: StreakPillProps) {
  const { profile } = useGamificationProfile({ enabled });

  if (!profile || profile.currentStreak <= 0) return null;

  const atRisk = profile.streakAtRisk;
  const label = atRisk
    ? `Sequência de ${profile.currentStreak} ${profile.currentStreak === 1 ? "semana" : "semanas"} — feche a semana atual para mantê-la`
    : `Sequência de ${profile.currentStreak} ${profile.currentStreak === 1 ? "semana" : "semanas"} fechadas`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex h-5 items-center gap-0.5 rounded-full border px-1.5 font-mono text-[10px] font-bold tabular-nums",
            atRisk
              ? "border-amber-500/40 bg-amber-500/15 text-amber-600 dark:text-amber-400"
              : "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400",
            className,
          )}
        >
          <Flame className="h-3 w-3" aria-hidden="true" />
          {profile.currentStreak}
          <span className="sr-only">{label}</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">
        <span>{label}</span>
      </TooltipContent>
    </Tooltip>
  );
}
