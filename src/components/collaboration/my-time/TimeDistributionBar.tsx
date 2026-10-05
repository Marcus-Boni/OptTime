"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatDuration } from "@/lib/utils";
import type { CollaborationPeriod } from "@/types/collaboration";

interface Segment {
  key: string;
  label: string;
  minutes: number;
  bar: string;
  dot: string;
  hint: string;
  /** Renders the segment with a call to action instead of a plain legend. */
  needsAction?: boolean;
}

export interface TimeDistributionBarProps {
  period: CollaborationPeriod;
  /** Fired by the "sem registro" segment. */
  onLogMeetings?: () => void;
}

/**
 * Where the period's committed hours went, in one bar.
 *
 * The three segments are **mutually exclusive by construction**: hours logged
 * against something other than a meeting, hours logged that came from a
 * meeting, and meetings that happened but were never logged. Nothing is
 * counted twice, so the bar's total is a real number.
 *
 * The total is framed against the **configured capacity**, not against the
 * Outlook window. A working window can span lunch and belongs to a different
 * question.
 *
 * Microsoft's "espaço livre na agenda" used to sit here as a highlighted box
 * and was removed. It is the complement of the meeting load — a week with few
 * meetings mechanically produces "97% da agenda vaga" — so it competed, as the
 * largest number on the screen, with the figures that actually mean something,
 * and needed three lines of caveat not to mislead. It now lives as one more
 * muted row inside the Microsoft 365 card, with the other Viva readings.
 */
export function TimeDistributionBar({
  period,
  onLogMeetings,
}: TimeDistributionBarProps) {
  const prefersReduced = useReducedMotion();
  const { totals } = period;

  const segments = useMemo<Segment[]>(() => {
    const loggedFromMeetings = Math.min(
      totals.loggedMeetingMinutes,
      totals.loggedMinutes,
    );
    const loggedElsewhere = Math.max(
      0,
      totals.loggedMinutes - loggedFromMeetings,
    );
    const unloggedMeetings = Math.max(
      0,
      totals.meetingMinutes - totals.loggedMeetingMinutes,
    );
    const unloggedCalls = (period.calls ?? [])
      .filter((call) => call.alreadyLogged !== true)
      .reduce((sum, call) => sum + (call.minutes || 0), 0);

    const baseSegments: Segment[] = [
      {
        key: "work",
        label: "Trabalho apontado",
        minutes: loggedElsewhere,
        bar: "bg-brand-500",
        dot: "bg-brand-500",
        hint: "Horas que você registrou e que não vieram de uma reunião da agenda.",
      },
      {
        key: "meetings",
        label: "Reuniões apontadas",
        minutes: loggedFromMeetings,
        bar: "bg-violet-500",
        dot: "bg-violet-500",
        hint: "Reuniões da agenda que já viraram registro de horas.",
      },
      {
        key: "pending",
        label: "Reuniões sem registro",
        minutes: unloggedMeetings,
        bar: "bg-amber-500",
        dot: "bg-amber-500",
        hint: "Aconteceram na agenda e ainda não têm apontamento correspondente.",
        needsAction: true,
      },
    ];

    if (unloggedCalls > 0) {
      baseSegments.push({
        key: "calls_pending",
        label: "Chamadas sem registro",
        minutes: unloggedCalls,
        bar: "bg-sky-500",
        dot: "bg-sky-500",
        hint: "Chamadas medidas no Teams que ainda não têm apontamento correspondente.",
        needsAction: true,
      });
    }

    return baseSegments.filter((segment) => segment.minutes > 0);
  }, [totals, period.calls]);

  const total = segments.reduce((sum, segment) => sum + segment.minutes, 0);

  if (total === 0) return null;

  return (
    <div
      className="space-y-3 rounded-2xl border border-border bg-card/60 px-5 py-4"
      data-tour="my-time-distribution"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-base font-bold text-foreground">
          O seu tempo comprometido
        </h2>
        <span className="font-mono text-sm tabular-nums text-foreground">
          {formatDuration(total)}
          {period.shape.contractedMinutes > 0 && (
            <span className="ml-1.5 font-sans text-xs text-muted-foreground">
              de {formatDuration(period.shape.contractedMinutes)} de jornada
            </span>
          )}
        </span>
      </div>

      {total > 0 && (
        <>
          <div
            className="flex h-3 w-full overflow-hidden rounded-full bg-muted/60"
            role="img"
            aria-label={segments
              .map(
                (segment) =>
                  `${segment.label}: ${formatDuration(segment.minutes)}`,
              )
              .join(", ")}
          >
            {segments.map((segment) => (
              <motion.div
                key={segment.key}
                className={cn("h-full", segment.bar)}
                initial={prefersReduced ? false : { scaleX: 0 }}
                animate={{ scaleX: 1 }}
                style={{
                  width: `${(segment.minutes / total) * 100}%`,
                  transformOrigin: "left",
                }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
              />
            ))}
          </div>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {segments.map((segment) => (
              <li key={segment.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="flex cursor-help items-center gap-1.5 text-xs text-muted-foreground">
                      <span
                        className={cn("size-2 rounded-full", segment.dot)}
                        aria-hidden="true"
                      />
                      {segment.label}
                      <span className="font-mono tabular-nums text-foreground">
                        {formatDuration(segment.minutes)}
                      </span>
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs leading-relaxed">
                    {segment.hint}
                  </TooltipContent>
                </Tooltip>
              </li>
            ))}

            {onLogMeetings &&
              segments.some((segment) => segment.needsAction) && (
                <li>
                  <button
                    type="button"
                    onClick={onLogMeetings}
                    className="rounded-md text-xs font-medium text-brand-500 underline-offset-4 transition-colors hover:text-brand-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                  >
                    Apontar agora
                  </button>
                </li>
              )}
          </ul>
        </>
      )}
    </div>
  );
}
