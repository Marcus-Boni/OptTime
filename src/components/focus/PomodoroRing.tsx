"use client";

import { motion, useReducedMotion } from "framer-motion";
import { PHASE_META } from "@/lib/focus/constants";
import type { FocusPhase } from "@/lib/focus/types";
import { cn } from "@/lib/utils";

export interface PomodoroRingProps {
  phase: FocusPhase;
  /** Ring completion in the 0–1 range. */
  progress: number;
  /** Formatted countdown, e.g. `24:59`. */
  countdown: string;
  isRunning: boolean;
  /** Focus blocks completed in the current cycle. */
  blocksInCycle: number;
  /** Blocks needed to unlock a long break. */
  blocksBeforeLongBreak: number;
  /** Accessible description of the phase. */
  phaseLabel: string;
}

// Sized so the whole stage — task context, ring, controls and the sound bed —
// fits a 820px-tall viewport without scrolling.
const SIZE = 300;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * The centrepiece of Focus Mode: a countdown ring wrapped around the remaining
 * time. Progress is driven by `stroke-dashoffset` and the aura by `transform`
 * and `opacity` only, so nothing here can shift layout.
 */
export function PomodoroRing({
  phase,
  progress,
  countdown,
  isRunning,
  blocksInCycle,
  blocksBeforeLongBreak,
  phaseLabel,
}: PomodoroRingProps) {
  const prefersReducedMotion = useReducedMotion();
  const meta = PHASE_META[phase];
  const gradientId = `pomodoro-ring-${phase}`;
  const dashOffset = CIRCUMFERENCE * (1 - Math.min(1, Math.max(0, progress)));

  return (
    // Fluid width with a desktop cap: the SVG scales via its viewBox, so a
    // 375px phone gets breathing room instead of an edge-to-edge ring.
    <div className="relative flex w-full max-w-[248px] items-center justify-center sm:max-w-[300px]">
      {/* Breathing aura — decorative, so it stays out of the a11y tree. */}
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, rgba(${meta.auraRgb}, 0.30) 0%, transparent 68%)`,
        }}
        animate={
          prefersReducedMotion || !isRunning
            ? { opacity: 0.5, scale: 1 }
            : { opacity: [0.4, 0.85, 0.4], scale: [1, 1.14, 1] }
        }
        transition={
          prefersReducedMotion || !isRunning
            ? { duration: 0.4 }
            : {
                duration: 6,
                repeat: Number.POSITIVE_INFINITY,
                ease: "easeInOut",
              }
        }
      />

      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="relative h-auto w-full -rotate-90"
        role="img"
        aria-label={`${phaseLabel}: ${countdown} restantes`}
      >
        <title>{`${phaseLabel} — ${countdown} restantes`}</title>
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={meta.gradientFrom} />
            <stop offset="100%" stopColor={meta.gradientTo} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={STROKE}
          className="stroke-border"
          strokeOpacity={0.55}
        />

        {/* Progress */}
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          animate={{ strokeDashoffset: dashOffset }}
          initial={false}
          transition={{
            duration: prefersReducedMotion ? 0 : 0.4,
            ease: "linear",
          }}
          style={{
            filter: `drop-shadow(0 0 12px rgba(${meta.auraRgb}, 0.45))`,
          }}
        />
      </svg>

      {/* Readout */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <span
          className={cn(
            "font-medium text-xs uppercase tracking-[0.22em]",
            meta.textClass,
          )}
        >
          {meta.label}
        </span>

        <span
          className="font-mono font-bold text-5xl text-foreground tabular-nums sm:text-6xl"
          aria-live="off"
        >
          {countdown}
        </span>

        <CycleDots
          blocksInCycle={blocksInCycle}
          blocksBeforeLongBreak={blocksBeforeLongBreak}
          phase={phase}
        />
      </div>
    </div>
  );
}

interface CycleDotsProps {
  blocksInCycle: number;
  blocksBeforeLongBreak: number;
  phase: FocusPhase;
}

/** Progress toward the next long break, one dot per focus block. */
function CycleDots({
  blocksInCycle,
  blocksBeforeLongBreak,
  phase,
}: CycleDotsProps) {
  const total = Math.max(1, blocksBeforeLongBreak);
  const filled = Math.min(total, blocksInCycle);
  const label = `${filled} de ${total} blocos concluídos neste ciclo`;

  // One dot per block, keyed by its block number — a stable identity even when
  // the cycle length changes in settings.
  const blockNumbers = Array.from({ length: total }, (_, index) => index + 1);

  return (
    <div className="flex items-center gap-1.5" aria-label={label} role="img">
      {blockNumbers.map((blockNumber) => {
        const isFilled = blockNumber <= filled;
        const isCurrent = blockNumber === filled + 1 && phase === "focus";

        return (
          <span
            key={`cycle-dot-${blockNumber}`}
            className={cn(
              "h-1.5 rounded-full transition-all duration-300",
              isFilled
                ? "w-5 bg-brand-500"
                : isCurrent
                  ? "w-5 bg-brand-500/40"
                  : "w-1.5 bg-border",
            )}
          />
        );
      })}
    </div>
  );
}
