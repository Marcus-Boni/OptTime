"use client";

import { ChevronDown } from "lucide-react";
import { useState } from "react";
import { EXCLUSION_LABELS } from "@/lib/collaboration/meetings";
import { cn } from "@/lib/utils";
import type { MeetingExclusion } from "@/types/collaboration";

/** A long tail of exclusions stops being informative and starts being a wall. */
const MAX_LISTED = 12;

export interface MeetingExclusionsNoteProps {
  exclusions: MeetingExclusion[];
  className?: string;
}

/**
 * "5 eventos não considerados", expandable item by item.
 *
 * The whole point of the collaboration layer is that it drops things — and a
 * person whose calendar is constantly rescheduled needs to see that the system
 * noticed, not wonder where a meeting went. Shared by every surface that lists
 * meetings, so the explanation is identical wherever it appears.
 */
export function MeetingExclusionsNote({
  exclusions,
  className,
}: MeetingExclusionsNoteProps) {
  const [open, setOpen] = useState(false);

  if (exclusions.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/40 bg-muted/10",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
      >
        <span className="text-xs text-muted-foreground">
          {exclusions.length}{" "}
          {exclusions.length === 1
            ? "evento não considerado"
            : "eventos não considerados"}
        </span>
        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <ul className="space-y-1 border-t border-border/40 px-3 py-2">
          {exclusions.slice(0, MAX_LISTED).map((exclusion) => (
            <li
              key={exclusion.id}
              className="flex items-baseline justify-between gap-3 text-[11px]"
            >
              <span className="truncate text-muted-foreground">
                {exclusion.subject}
              </span>
              <span className="shrink-0 text-muted-foreground/70">
                {EXCLUSION_LABELS[exclusion.reason]}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
