"use client";

import { ExternalLink, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OutlookEvent } from "@/hooks/use-outlook-events";
import {
  formatEventTimeRange,
  getEventDurationMinutes,
} from "@/hooks/use-outlook-events";
import { formatDuration } from "@/lib/utils";

interface OutlookEventCardProps {
  event: OutlookEvent;
  isImported?: boolean;
  onImport: (event: OutlookEvent) => void;
}

export function OutlookEventCard({
  event,
  isImported = false,
  onImport,
}: OutlookEventCardProps) {
  const organizerName = event.organizer?.emailAddress?.name?.trim();

  return (
    <div className="rounded-[26px] border border-border/60 bg-card/80 p-4 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">
              {event.subject || "Sem título"}
            </h4>
            <Badge
              variant={isImported ? "secondary" : "outline"}
              className={
                isImported
                  ? "bg-emerald-500/10 text-emerald-400"
                  : "border-border/60 text-muted-foreground"
              }
            >
              {isImported ? "Já lançado" : "Pendente"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{formatEventTimeRange(event)}</span>
            <span>•</span>
            <span>{formatDuration(getEventDurationMinutes(event))}</span>
          </div>
        </div>

        {event.webLink ? (
          <Button
            variant="ghost"
            size="icon"
            asChild
            className="h-8 w-8 shrink-0"
          >
            <a
              href={event.webLink}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Abrir evento no Outlook"
            >
              <ExternalLink className="h-4 w-4" />
            </a>
          </Button>
        ) : null}
      </div>

      <div className="mt-4 flex justify-end">
        <Button
          size="sm"
          variant={isImported ? "outline" : "default"}
          className={
            isImported
              ? "rounded-full"
              : "rounded-full bg-brand-500 text-white hover:bg-brand-600"
          }
          onClick={() => onImport(event)}
          disabled={isImported}
        >
          <TimerReset className="mr-2 h-4 w-4" />
          {isImported ? "Já registrado" : "Usar reunião"}
        </Button>
      </div>
    </div>
  );
}
