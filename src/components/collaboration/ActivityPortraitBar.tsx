"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Info } from "lucide-react";
import {
  ACTIVITY_LABELS,
  PORTRAIT_UNAVAILABLE_MESSAGES,
} from "@/lib/collaboration/analytics";
import { cn, formatDuration } from "@/lib/utils";
import type { ActivityKind, DayPortrait } from "@/types/collaboration";

/**
 * Tailwind classes per activity, kept off the brand orange so the bar never
 * competes with the page's single primary action.
 */
const ACTIVITY_STYLES: Record<ActivityKind, { bar: string; dot: string }> = {
  meeting: { bar: "bg-brand-500", dot: "bg-brand-500" },
  call: { bar: "bg-sky-500", dot: "bg-sky-500" },
  chat: { bar: "bg-violet-500", dot: "bg-violet-500" },
  email: { bar: "bg-amber-500", dot: "bg-amber-500" },
  focus: { bar: "bg-emerald-500", dot: "bg-emerald-500" },
};

export interface ActivityPortraitBarProps {
  portrait: DayPortrait;
}

/**
 * The Viva Insights day at a glance: one stacked bar of where the hours went.
 *
 * Descriptive only — it never scores the day and never compares people.
 */
export function ActivityPortraitBar({ portrait }: ActivityPortraitBarProps) {
  const prefersReducedMotion = useReducedMotion();

  // "unavailable" means a transient Graph problem the person can do nothing
  // about — and Viva only computes these overnight, so "today" is legitimately
  // empty for most of the day. Saying nothing beats a permanent error box on an
  // optional extra; the cause is in the server log either way.
  if (portrait.availability === "unavailable") return null;

  if (portrait.availability !== "ok") {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
        <Info
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="text-xs text-muted-foreground">
          {PORTRAIT_UNAVAILABLE_MESSAGES[portrait.availability]}
        </p>
      </div>
    );
  }

  if (portrait.totalMinutes === 0) return null;

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-xs font-medium text-muted-foreground">
          Seu dia no Microsoft 365
        </p>
        <p className="font-mono text-xs tabular-nums text-muted-foreground">
          {formatDuration(portrait.totalMinutes)}
        </p>
      </div>

      <div
        className="flex h-2 w-full overflow-hidden rounded-full bg-muted/50"
        role="img"
        aria-label={`Distribuição do dia: ${portrait.slices
          .map(
            (slice) =>
              `${ACTIVITY_LABELS[slice.kind]} ${formatDuration(slice.minutes)}`,
          )
          .join(", ")}`}
      >
        {portrait.slices.map((slice) => (
          <motion.div
            key={slice.kind}
            className={cn("h-full", ACTIVITY_STYLES[slice.kind].bar)}
            initial={prefersReducedMotion ? false : { scaleX: 0 }}
            animate={{ scaleX: 1 }}
            style={{
              width: `${(slice.minutes / portrait.totalMinutes) * 100}%`,
              transformOrigin: "left",
            }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {portrait.slices.map((slice) => (
          <li
            key={slice.kind}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground"
          >
            <span
              className={cn(
                "size-1.5 rounded-full",
                ACTIVITY_STYLES[slice.kind].dot,
              )}
              aria-hidden="true"
            />
            {ACTIVITY_LABELS[slice.kind]}
            <span className="font-mono tabular-nums text-foreground/70">
              {formatDuration(slice.minutes)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
