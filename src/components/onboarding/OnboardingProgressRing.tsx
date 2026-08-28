"use client";

import { cn } from "@/lib/utils";

export interface OnboardingProgressRingProps {
  completed: number;
  total: number;
  /** Outer diameter in pixels. */
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** Renders `n/total` inside the ring. */
  showLabel?: boolean;
}

/**
 * Circular progress for the first-steps checklist.
 *
 * Only `stroke-dashoffset` animates, so the ring never triggers layout — it is
 * rendered inside the sticky header and in list rows.
 */
export function OnboardingProgressRing({
  completed,
  total,
  size = 44,
  strokeWidth = 4,
  className,
  showLabel = true,
}: OnboardingProgressRingProps) {
  const safeTotal = Math.max(total, 1);
  const ratio = Math.min(Math.max(completed / safeTotal, 0), 1);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - ratio);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`${completed} de ${total} passos concluídos`}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted-foreground/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="stroke-brand-500 transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>

      {showLabel ? (
        <span
          className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-semibold text-foreground"
          aria-hidden="true"
        >
          {completed}/{total}
        </span>
      ) : null}
    </div>
  );
}

export default OnboardingProgressRing;
