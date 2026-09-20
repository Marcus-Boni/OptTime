"use client";

import { CheckCheck, TimerReset, Users } from "lucide-react";
import { MeetingBadges } from "@/components/collaboration/MeetingBadges";
import { MeetingTitle } from "@/components/collaboration/MeetingTitle";
import { Button } from "@/components/ui/button";
import { formatMeetingRange } from "@/hooks/use-collaboration-day";
import { cn, formatDuration } from "@/lib/utils";
import type { MeetingSignal } from "@/types/collaboration";

/** Past this the name list stops helping and starts wrapping. */
const MAX_NAMES = 3;

export interface MeetingCardProps {
  meeting: MeetingSignal;
  onPick: (meeting: MeetingSignal) => void;
  disabled?: boolean;
}

/**
 * One meeting, ready to become a time entry.
 *
 * Used by the picker inside the entry form, where the job is choosing a single
 * meeting to fill the fields — the day panel has its own denser row because it
 * is a multi-select. Both read the same normalized `MeetingSignal`, so the
 * title, the badges and the exclusion rules never disagree between them.
 */
export function MeetingCard({
  meeting,
  onPick,
  disabled = false,
}: MeetingCardProps) {
  const logged = meeting.alreadyLogged;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/80 p-3 shadow-sm transition-colors",
        logged
          ? "border-border/40 opacity-70"
          : "border-border/60 hover:border-brand-500/30",
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <h4 className="min-w-0 flex-1 text-sm font-semibold text-foreground">
          <MeetingTitle title={meeting.title} subject={meeting.subject} />
        </h4>
        <MeetingBadges meeting={meeting} />
      </div>

      <p className="mt-1 text-xs text-muted-foreground">{meeting.evidence}</p>

      {meeting.participants.length > 0 && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
          <Users className="size-3 shrink-0" aria-hidden="true" />
          <span className="truncate">
            {meeting.participants
              .slice(0, MAX_NAMES)
              .map((person) => person.name)
              .join(", ")}
            {meeting.participantCount > MAX_NAMES &&
              ` e mais ${meeting.participantCount - MAX_NAMES}`}
          </span>
        </p>
      )}

      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="font-mono text-[11px] tabular-nums text-muted-foreground">
          {formatMeetingRange(meeting)} · {formatDuration(meeting.minutes)}
        </span>

        <Button
          size="sm"
          variant={logged ? "outline" : "default"}
          className={cn(
            "h-8 shrink-0 rounded-lg px-3 text-xs font-medium",
            !logged &&
              "bg-brand-500 text-white shadow-sm shadow-brand-500/20 hover:bg-brand-600",
          )}
          onClick={() => onPick(meeting)}
          disabled={disabled || logged}
        >
          {logged ? (
            <>
              <CheckCheck className="mr-1.5 size-3.5" aria-hidden="true" />
              Já registrado
            </>
          ) : (
            <>
              <TimerReset className="mr-1.5 size-3.5" aria-hidden="true" />
              Usar reunião
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
