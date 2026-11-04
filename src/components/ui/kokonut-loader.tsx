"use client";

import type { ReactElement } from "react";
import { cn } from "@/lib/utils";

export interface KokonutOrbitalLoaderProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_MAP = {
  sm: "size-4",
  md: "size-5",
  lg: "size-7",
} as const;

/**
 * Kokonut UI-inspired dual orbital ring loader with pulsing core.
 * Uses only transform & opacity and respects prefers-reduced-motion.
 */
export function KokonutOrbitalLoader({
  size = "sm",
  className,
}: KokonutOrbitalLoaderProps): ReactElement {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center",
        SIZE_MAP[size],
        className,
      )}
    >
      <span className="absolute inset-0 animate-spin rounded-full border-2 border-current border-r-transparent border-b-transparent opacity-90 motion-reduce:animate-none" />
      <span className="absolute inset-[3px] animate-[spin_1.4s_linear_infinite_reverse] rounded-full border border-current border-t-transparent border-l-transparent opacity-45 motion-reduce:animate-none" />
      <span className="size-1 rounded-full bg-current opacity-80" />
    </span>
  );
}

export interface KokonutStepLoaderProps {
  label?: string;
  description?: string;
  className?: string;
}

/**
 * Indeterminate loading feedback for workflows without real progress events.
 * The status stays stable until the caller replaces the loading state.
 */
export function KokonutStepLoader({
  label = "Preparando informações",
  description,
  className,
}: KokonutStepLoaderProps): ReactElement {
  return (
    <div className={cn("space-y-3 px-6 py-8", className)}>
      <output
        aria-live="polite"
        aria-atomic="true"
        className="flex items-center gap-3 text-sm font-medium text-foreground"
      >
        <KokonutOrbitalLoader size="md" className="text-brand-500" />
        <span>{label}</span>
      </output>
      {description ? (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      ) : null}
    </div>
  );
}
