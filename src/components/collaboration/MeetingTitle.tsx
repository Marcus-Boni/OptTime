"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface MeetingTitleProps {
  title: string;
  /** Original calendar subject, shown when the generated title hides it. */
  subject?: string;
  className?: string;
}

/**
 * A meeting title that is always truncated in the layout, so it always needs a
 * tooltip — the full name is the one thing a person needs to tell two similar
 * meetings apart, and it is exactly what `truncate` takes away.
 *
 * Also surfaces the raw calendar subject when the generated title replaced it
 * ("Reunião com Marcus Boni" hides that the invite said "Sync").
 */
export function MeetingTitle({ title, subject, className }: MeetingTitleProps) {
  const trimmedSubject = subject?.trim();
  const showsSubject = Boolean(
    trimmedSubject && trimmedSubject !== title.trim(),
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "block min-w-0 cursor-help truncate underline-offset-4 decoration-brand-500/20 hover:underline",
            className,
          )}
        >
          {title}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-[320px]">
        <p className="font-medium">{title}</p>
        {showsSubject && (
          <p className="mt-1 text-xs opacity-80">Na agenda: {trimmedSubject}</p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
