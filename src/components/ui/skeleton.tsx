import type * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/75 dark:bg-muted/45 before:pointer-events-none before:absolute before:inset-0 before:-translate-x-full before:animate-[shimmer_2s_infinite] before:bg-gradient-to-r before:from-transparent before:via-foreground/[0.06] dark:before:via-white/[0.07] before:to-transparent motion-reduce:animate-pulse motion-reduce:before:hidden",
        className,
      )}
      {...props}
    />
  );
}

const CHART_BAR_HEIGHTS = [
  "h-[42%]",
  "h-[68%]",
  "h-[85%]",
  "h-[54%]",
  "h-[92%]",
  "h-[64%]",
  "h-[36%]",
] as const;

export interface ChartSkeletonProps extends React.ComponentProps<"output"> {
  bars?: number;
}

function ChartSkeleton({
  className,
  bars = 7,
  ...props
}: ChartSkeletonProps): React.ReactElement {
  const barKeys = Array.from({ length: bars }, (_, idx) => ({
    id: `chart-skeleton-bar-${idx}`,
    heightClass: CHART_BAR_HEIGHTS[idx % CHART_BAR_HEIGHTS.length] ?? "h-1/2",
  }));

  return (
    <output
      aria-label="Carregando gráfico..."
      className={cn(
        "flex h-[280px] w-full flex-col justify-between rounded-xl border border-border/40 bg-muted/15 p-4",
        className,
      )}
      {...props}
    >
      <div className="flex flex-1 items-end gap-3 border-b border-border/40 pb-3 pt-4">
        {barKeys.map((bar) => (
          <div key={bar.id} className="flex h-full flex-1 flex-col justify-end">
            <Skeleton className={cn("w-full rounded-t-lg", bar.heightClass)} />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-3">
        {barKeys.map((bar) => (
          <Skeleton key={`${bar.id}-label`} className="h-2.5 flex-1 rounded" />
        ))}
      </div>
    </output>
  );
}

function DonutSkeleton({
  className,
  ...props
}: React.ComponentProps<"output">): React.ReactElement {
  return (
    <output
      aria-label="Carregando distribuição..."
      className={cn("flex w-full flex-col gap-5 py-2", className)}
      {...props}
    >
      <div className="relative mx-auto flex h-44 w-44 items-center justify-center">
        <Skeleton className="h-44 w-44 rounded-full" />
        <div className="absolute h-28 w-28 rounded-full bg-card" />
        <div className="absolute flex flex-col items-center gap-1.5">
          <Skeleton className="h-5 w-16 rounded" />
          <Skeleton className="h-2.5 w-12 rounded" />
        </div>
      </div>
      <div className="space-y-3">
        {["donut-row-a", "donut-row-b", "donut-row-c", "donut-row-d"].map(
          (rowKey) => (
            <div key={rowKey} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-2.5 w-2.5 rounded-full" />
                  <Skeleton className="h-3 w-28 rounded" />
                </div>
                <Skeleton className="h-3 w-12 rounded" />
              </div>
              <Skeleton className="h-1.5 w-full rounded-full" />
            </div>
          ),
        )}
      </div>
    </output>
  );
}

function TimesheetWorkspaceSkeleton({
  className,
  ...props
}: React.ComponentProps<"output">): React.ReactElement {
  return (
    <output
      aria-label="Carregando registros de tempo..."
      className={cn(
        "block space-y-4 rounded-2xl border border-border/50 bg-card/60 p-4 sm:p-5",
        className,
      )}
      {...props}
    >
      {/* Top date navigation & progress summary skeleton */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-4">
        <div className="flex items-center gap-2">
          <Skeleton className="size-9 rounded-lg" />
          <Skeleton className="h-6 w-44 rounded-lg" />
          <Skeleton className="size-9 rounded-lg" />
        </div>
        <div className="flex items-center gap-3">
          <Skeleton className="h-2 w-32 rounded-full" />
          <Skeleton className="h-6 w-20 rounded-md" />
        </div>
      </div>

      {/* Entry rows skeleton */}
      <div className="space-y-3">
        {["ts-row-1", "ts-row-2", "ts-row-3"].map((rowKey) => (
          <div
            key={rowKey}
            className="flex items-center justify-between gap-4 rounded-xl border border-border/40 bg-background/50 p-3.5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Skeleton className="h-10 w-1.5 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-3.5 w-36 rounded" />
                  <Skeleton className="h-4 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-3/5 rounded" />
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Skeleton className="h-7 w-16 rounded-lg" />
              <Skeleton className="size-8 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </output>
  );
}

export { ChartSkeleton, DonutSkeleton, Skeleton, TimesheetWorkspaceSkeleton };
