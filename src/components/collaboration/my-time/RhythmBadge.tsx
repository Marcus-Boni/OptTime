"use client";

import {
  CircleHelp,
  Layers,
  type LucideIcon,
  ShieldCheck,
  Users,
  Waves,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { RhythmKind, WeekRhythm } from "@/types/collaboration";

const STYLES: Record<RhythmKind, { icon: LucideIcon; className: string }> = {
  protected: {
    icon: ShieldCheck,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  balanced: {
    icon: Waves,
    className:
      "border-brand-500/30 bg-brand-500/10 text-brand-600 dark:text-brand-400",
  },
  fragmented: {
    icon: Layers,
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  heavy: {
    icon: Users,
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  unknown: {
    icon: CircleHelp,
    className: "border-border bg-muted/40 text-muted-foreground",
  },
};

export interface RhythmBadgeProps {
  rhythm: WeekRhythm;
}

/**
 * The period in two words, next to the title.
 *
 * Describes how the time was arranged, never how much of it there was: a
 * quiet week and a packed one can both be "equilibrada", and neither label
 * congratulates someone for working longer.
 */
export function RhythmBadge({ rhythm }: RhythmBadgeProps) {
  const style = STYLES[rhythm.kind];
  const Icon = style.icon;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-help items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium",
            style.className,
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
          {rhythm.label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">
        {rhythm.description}
      </TooltipContent>
    </Tooltip>
  );
}
