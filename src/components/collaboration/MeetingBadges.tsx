"use client";

import { Globe, RefreshCw, Repeat2, Video } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { MeetingSignal } from "@/types/collaboration";

/** Two badges is the readable ceiling on a card this dense. */
const MAX_BADGES = 2;

export interface MeetingBadgesProps {
  meeting: MeetingSignal;
}

/**
 * The one-glance facts about a meeting, shared by every surface that lists
 * one — the day panel and the picker inside the entry form.
 *
 * Ordered by what changes a decision: a moved occurrence explains a duplicate,
 * an external participant in the room explains why the hour is billable.
 */
export function MeetingBadges({ meeting }: MeetingBadgesProps) {
  const badges: Array<{ label: string; icon: typeof Repeat2 }> = [];

  if (meeting.isException) {
    badges.push({ label: "Remarcada", icon: RefreshCw });
  } else if (meeting.isRecurring) {
    badges.push({ label: "Recorrente", icon: Repeat2 });
  }

  if (meeting.externalCount > 0) {
    badges.push({ label: "Externo", icon: Globe });
  } else if (meeting.isOnline) {
    badges.push({ label: "Teams", icon: Video });
  }

  if (badges.length === 0) return null;

  return (
    <>
      {badges.slice(0, MAX_BADGES).map(({ label, icon: Icon }) => (
        <Badge
          key={label}
          variant="secondary"
          className="gap-1 rounded-full px-2 py-0 text-[10px] font-medium"
        >
          <Icon className="size-2.5" aria-hidden="true" />
          {label}
        </Badge>
      ))}
    </>
  );
}
