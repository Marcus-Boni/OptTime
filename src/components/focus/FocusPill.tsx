"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Maximize2, Pause, Play } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { isBreakPhase, PHASE_META } from "@/lib/focus/constants";
import type { FocusPhase } from "@/lib/focus/types";
import { cn } from "@/lib/utils";

export interface FocusPillProps {
  phase: FocusPhase;
  countdown: string;
  isRunning: boolean;
  onExpand: () => void;
  onToggleRun: () => void;
}

/**
 * Floating reminder shown while a Pomodoro session runs with the overlay
 * minimised. Sits above the TimeBot bubble so the two never overlap.
 */
export function FocusPill({
  phase,
  countdown,
  isRunning,
  onExpand,
  onToggleRun,
}: FocusPillProps) {
  const prefersReducedMotion = useReducedMotion();
  const meta = PHASE_META[phase];
  const onBreak = isBreakPhase(phase);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 12 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: 12 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      style={{ position: "fixed", bottom: "96px", right: "24px", zIndex: 9989 }}
      className={cn(
        "flex items-center gap-1 rounded-full border py-1 pr-1 pl-3 shadow-xl backdrop-blur-md",
        "border-border bg-card/95 shadow-black/20",
        onBreak ? "border-info/30" : "border-brand-500/30",
      )}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            onClick={onToggleRun}
            aria-label={isRunning ? "Pausar o Pomodoro" : "Retomar o Pomodoro"}
            className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors duration-150 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
          >
            {isRunning ? (
              <Pause className="size-3" />
            ) : (
              <Play className="size-3" />
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {isRunning ? "Pausar" : "Retomar"}
        </TooltipContent>
      </Tooltip>

      <button
        type="button"
        onClick={onExpand}
        aria-label={`Abrir o Modo Foco — ${meta.label}, ${countdown} restantes`}
        className="flex cursor-pointer items-center gap-2 rounded-full px-2 py-0.5 transition-colors duration-150 hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50"
      >
        <span
          aria-hidden
          className={cn(
            "size-1.5 rounded-full",
            onBreak ? "bg-info" : "bg-brand-500",
            isRunning && !prefersReducedMotion && !onBreak && "pulse-glow",
          )}
        />
        <span className="font-mono text-sm font-semibold text-foreground tabular-nums">
          {countdown}
        </span>
        <span
          className={cn(
            "text-[10px] font-medium uppercase tracking-wider",
            meta.textClass,
          )}
        >
          {meta.shortLabel}
        </span>
        <Maximize2 className="size-3 text-muted-foreground" aria-hidden />
      </button>
    </motion.div>
  );
}
