"use client";

import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface ProgressRingProps {
  /** 0–100. Values above 100 are clamped; the ring never overflows. */
  value: number;
  /** Outer diameter in pixels. */
  size?: number;
  strokeWidth?: number;
  /** Tailwind text colour class driving the arc, e.g. "text-brand-500". */
  className?: string;
  /** Rendered in the middle — usually two or three characters. */
  children?: React.ReactNode;
  /** Read by screen readers in place of the arc. */
  label: string;
}

/**
 * A single-value progress arc.
 *
 * `currentColor` on the stroke so the arc inherits whatever text colour the
 * KPI sets, which keeps every state — brand, amber, emerald — one class away
 * instead of a prop with a colour table behind it.
 */
export function ProgressRing({
  value,
  size = 44,
  strokeWidth = 4,
  className,
  children,
  label,
}: ProgressRingProps) {
  const prefersReduced = useReducedMotion();

  const clamped = Math.max(0, Math.min(100, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);

  return (
    <div
      className={cn("relative shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          className="stroke-muted"
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          stroke="currentColor"
          strokeDasharray={circumference}
          initial={prefersReduced ? false : { strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>

      {children && (
        <span className="absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold tabular-nums">
          {children}
        </span>
      )}
    </div>
  );
}
