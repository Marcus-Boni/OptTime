"use client";

import { motion } from "framer-motion";
import { cn, formatDuration } from "@/lib/utils";

interface WeeklyCapacityBarProps {
  loggedMinutes: number;
  capacityMinutes: number;
  remainingMinutes: number;
  percentage: number;
}

export function WeeklyCapacityBar({
  loggedMinutes,
  capacityMinutes,
  remainingMinutes,
  percentage,
}: WeeklyCapacityBarProps) {
  const isOver = remainingMinutes < 0;
  const clampedPercent = Math.min(Math.max(percentage, 0), 100);

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="font-medium text-foreground">Semana</span>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="font-mono text-muted-foreground">
            {formatDuration(loggedMinutes)} / {formatDuration(capacityMinutes)}
          </span>
          {isOver ? (
            <span className="font-mono font-semibold text-orange-500">
              +{formatDuration(Math.abs(remainingMinutes))}
            </span>
          ) : (
            <span className="font-mono text-muted-foreground">
              faltam {formatDuration(remainingMinutes)}
            </span>
          )}
        </div>
      </div>

      <div className="relative h-2.5 overflow-hidden rounded-full bg-muted/50">
        <motion.div
          className={cn(
            "h-full rounded-full",
            isOver
              ? "bg-orange-500"
              : percentage >= 80
                ? "bg-green-500"
                : "bg-brand-500",
          )}
          initial={{ width: 0 }}
          animate={{ width: `${clampedPercent}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}
