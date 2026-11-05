"use client";

import { useReducedMotion } from "framer-motion";
import {
  type ComponentProps,
  type MouseEvent,
  type ReactElement,
  useEffect,
  useRef,
  useState,
} from "react";
import { Card } from "@/components/ui/card";
import { cn, formatDuration } from "@/lib/utils";

export interface SpotlightCardProps extends ComponentProps<typeof Card> {
  /** Accent tint for the radial spotlight. Defaults to brand orange. */
  spotlightColor?: string;
}

/**
 * React Bits-inspired SpotlightCard surface.
 * Tracks pointer position via CSS variables without triggering React re-renders.
 */
export function SpotlightCard({
  className,
  children,
  spotlightColor = "color-mix(in srgb, var(--primary) 11%, transparent)",
  onMouseMove,
  ...props
}: SpotlightCardProps): ReactElement {
  const cardRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  function handlePointerMove(event: MouseEvent<HTMLDivElement>): void {
    onMouseMove?.(event);
    if (prefersReducedMotion || !cardRef.current) return;

    const rect = cardRef.current.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    cardRef.current.style.setProperty("--spotlight-x", `${x}px`);
    cardRef.current.style.setProperty("--spotlight-y", `${y}px`);
  }

  return (
    <Card
      ref={cardRef}
      onMouseMove={handlePointerMove}
      className={cn(
        "group/spotlight relative min-w-0 transition-colors duration-200 hover:border-brand-500/30",
        className,
      )}
      {...props}
    >
      {!prefersReducedMotion && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover/spotlight:opacity-100"
          style={{
            background: `radial-gradient(360px circle at var(--spotlight-x, 50%) var(--spotlight-y, 50%), ${spotlightColor}, transparent 65%)`,
          }}
        />
      )}
      {children}
    </Card>
  );
}
export interface AnimatedMetricProps {
  /** Target numeric value to interpolate toward. */
  value: number;
  /** Format mode: "duration" (minutes -> "6h 30m"), "percent" ("84%"), or "integer" ("24"). */
  formatMode?: "duration" | "percent" | "integer";
  /** Optional custom formatter overriding formatMode. */
  formatter?: (value: number) => string;
  /** Optional suffix appended to formatted value. */
  suffix?: string;
  className?: string;
}

/**
 * Anime.js / React Bits CountUp-inspired tabular metric counter.
 * Smoothly interpolates numeric changes on filter transitions in 360ms.
 */
export function AnimatedMetric({
  value,
  formatMode = "integer",
  formatter,
  suffix = "",
  className,
}: AnimatedMetricProps): ReactElement {
  const prefersReducedMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState<number>(value);
  const previousValueRef = useRef<number>(value);

  useEffect(() => {
    if (prefersReducedMotion) {
      setDisplayValue(value);
      previousValueRef.current = value;
      return;
    }

    const fromValue = previousValueRef.current;
    const toValue = value;

    if (fromValue === toValue) {
      setDisplayValue(toValue);
      return;
    }

    let frameId = 0;
    let startTime = 0;
    const durationMs = 360;

    function tick(timestamp: number): void {
      if (!startTime) startTime = timestamp;
      const elapsed = timestamp - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Cubic ease-out
      const eased = 1 - (1 - progress) ** 3;
      const current = Math.round(fromValue + (toValue - fromValue) * eased);
      previousValueRef.current = current;
      setDisplayValue(current);

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick);
      }
    }

    frameId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frameId);
  }, [prefersReducedMotion, value]);

  const baseFormatted = formatter
    ? formatter(displayValue)
    : formatMode === "duration"
      ? formatDuration(displayValue)
      : formatMode === "percent"
        ? `${displayValue}%`
        : displayValue.toLocaleString("pt-BR");

  const formatted = `${baseFormatted}${suffix}`;

  return (
    <span className={cn("font-mono tabular-nums", className)}>{formatted}</span>
  );
}
