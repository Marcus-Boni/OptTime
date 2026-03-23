"use client";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { cn, formatDuration } from "@/lib/utils";

interface WeekProgressBarProps {
  totalMinutes: number;
  /** Em horas (ex: 40) */
  weeklyCapacity: number;
  className?: string;
}

export function WeekProgressBar({
  totalMinutes,
  weeklyCapacity,
  className,
}: WeekProgressBarProps) {
  if (!weeklyCapacity || weeklyCapacity <= 0) return null;

  const capacityMinutes = weeklyCapacity * 60;
  const percentage = Math.min((totalMinutes / capacityMinutes) * 100, 100);
  const isOver = totalMinutes > capacityMinutes;
  const isComplete = !isOver && percentage === 100;

  const progressClass = cn(
    "h-1.5",
    isOver || isComplete
      ? "[&>div]:bg-green-500"
      : percentage >= 50
        ? "[&>div]:bg-amber-500"
        : "",
  );

  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {formatDuration(totalMinutes)} de {weeklyCapacity}h
        </span>
        {isOver && (
          <Badge
            variant="outline"
            className="h-4 border-green-300 bg-green-500/10 px-1.5 text-[10px] text-green-700 dark:text-green-400"
          >
            Acima da meta
          </Badge>
        )}
      </div>
      <Progress value={percentage} className={progressClass} />
    </div>
  );
}
