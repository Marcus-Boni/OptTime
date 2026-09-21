"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  ACTIVITY_DESCRIPTIONS,
  ACTIVITY_LABELS,
  FOCUS_DISCLAIMER,
  PORTRAIT_SOURCE_NOTE,
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
  /** Overridden by Meu Tempo, which renders the same bar for a whole period. */
  label?: string;
  /**
   * "detailed" spells out what each activity means next to the legend.
   *
   * The compact form is for the day panel, where the bar is a footnote under
   * the meeting list and the names are already familiar from the page around
   * it. Meu Tempo is where people arrive cold, so it gets the full text.
   */
  variant?: "compact" | "detailed";
  /**
   * Minutes of working window in the period.
   *
   * Without it "43h30 livres" is an impossible-looking number for someone who
   * contracts 40h a week. With it, the sentence becomes "43h30 de 50h de
   * expediente" and the arithmetic explains itself.
   */
  capacityMinutes?: number;
  /** The Outlook window as a wall clock, e.g. "08:00–17:00". */
  windowLabel?: string;
}

/**
 * Where the Microsoft 365 hours went, as Viva Insights measured them.
 *
 * Two readings that must never share a bar: the four **collaboration**
 * activities are time that was occupied, while **focus** is the opposite — the
 * sum of 2h+ gaps the calendar left free inside working hours. Adding them
 * produced a single total of 52h in one week and made an empty calendar look
 * like a week of deep work, which is exactly backwards.
 *
 * Descriptive only — it never scores the day and never compares people.
 */
export function ActivityPortraitBar({
  portrait,
  label = "Seu dia no Microsoft 365",
  variant = "compact",
  capacityMinutes,
  windowLabel,
}: ActivityPortraitBarProps) {
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

  const collaboration = portrait.slices.filter(
    (slice) => slice.kind !== "focus",
  );
  const detailed = variant === "detailed";

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          {label}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="text-muted-foreground/70 transition-colors hover:text-foreground"
                aria-label="De onde vêm estes números"
              >
                <Info className="size-3" aria-hidden="true" />
              </button>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs leading-relaxed">
              {PORTRAIT_SOURCE_NOTE}
            </TooltipContent>
          </Tooltip>
        </p>

        {collaboration.length > 0 && (
          <p className="font-mono text-xs tabular-nums text-muted-foreground">
            {formatDuration(portrait.collaborationMinutes)} ocupado
          </p>
        )}
      </div>

      {collaboration.length > 0 && (
        <>
          <div
            className="flex h-2 w-full overflow-hidden rounded-full bg-muted/50"
            role="img"
            aria-label={`Tempo ocupado: ${collaboration
              .map(
                (slice) =>
                  `${ACTIVITY_LABELS[slice.kind]} ${formatDuration(slice.minutes)}`,
              )
              .join(", ")}`}
          >
            {collaboration.map((slice) => (
              <motion.div
                key={slice.kind}
                className={cn("h-full", ACTIVITY_STYLES[slice.kind].bar)}
                initial={prefersReducedMotion ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                style={{
                  width: `${(slice.minutes / portrait.collaborationMinutes) * 100}%`,
                  transformOrigin: "left",
                }}
                transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </div>

          <ul
            className={cn(
              detailed
                ? "grid gap-2 sm:grid-cols-2"
                : "flex flex-wrap gap-x-4 gap-y-1",
            )}
          >
            {collaboration.map((slice) => (
              <li
                key={slice.kind}
                className={cn(
                  detailed
                    ? "flex gap-2"
                    : "flex items-center gap-1.5 text-[11px] text-muted-foreground",
                )}
              >
                <span
                  className={cn(
                    "shrink-0 rounded-full",
                    ACTIVITY_STYLES[slice.kind].dot,
                    detailed ? "mt-1.5 size-2" : "size-1.5",
                  )}
                  aria-hidden="true"
                />

                {detailed ? (
                  <span className="min-w-0">
                    <span className="flex flex-wrap items-baseline gap-x-2">
                      <span className="text-xs font-medium text-foreground">
                        {ACTIVITY_LABELS[slice.kind]}
                      </span>
                      <span className="font-mono text-xs tabular-nums text-muted-foreground">
                        {formatDuration(slice.minutes)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">
                      {ACTIVITY_DESCRIPTIONS[slice.kind]}
                    </span>
                  </span>
                ) : (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex cursor-help items-center gap-1.5">
                        {ACTIVITY_LABELS[slice.kind]}
                        <span className="font-mono tabular-nums text-foreground/70">
                          {formatDuration(slice.minutes)}
                        </span>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs leading-relaxed">
                      {ACTIVITY_DESCRIPTIONS[slice.kind]}
                    </TooltipContent>
                  </Tooltip>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {portrait.focusMinutes > 0 && (
        <div className="border-t border-border/50 pt-3">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="flex items-center gap-2 text-xs font-medium text-foreground">
              <span
                className="size-2 rounded-full bg-muted-foreground/40"
                aria-hidden="true"
              />
              {ACTIVITY_LABELS.focus}
            </span>
            <span className="font-mono text-xs tabular-nums text-muted-foreground">
              {formatDuration(portrait.focusMinutes)}
              {capacityMinutes ? ` de ${formatDuration(capacityMinutes)}` : ""}
            </span>
          </p>

          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {detailed
              ? `${ACTIVITY_DESCRIPTIONS.focus} ${FOCUS_DISCLAIMER}`
              : FOCUS_DISCLAIMER}
            {capacityMinutes && windowLabel
              ? ` A referência é a janela ${windowLabel} do Outlook, que inclui o almoço e por isso é maior que a jornada de 8h.`
              : ""}
          </p>
        </div>
      )}
    </div>
  );
}
