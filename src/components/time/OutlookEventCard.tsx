"use client";

import { ExternalLink, TimerReset } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { OutlookEvent } from "@/hooks/use-outlook-events";
import {
  formatEventTimeRange,
  getEventDurationMinutes,
} from "@/hooks/use-outlook-events";
import { cn, formatDuration } from "@/lib/utils";

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
    <div className="rounded-xl border border-border/60 bg-card/80 p-3 shadow-sm backdrop-blur transition-all hover:border-brand-500/30">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="line-clamp-1 text-sm font-semibold text-foreground">
              {event.subject || "Sem título"}
            </h4>
            <Badge
              variant={isImported ? "secondary" : "outline"}
              className={cn(
                "h-5 px-1.5 text-[10px] uppercase tracking-wider",
                isImported
                  ? "bg-emerald-500/10 text-emerald-400 border-none"
                  : "border-border/60 text-muted-foreground",
              )}
            >
              {isImported ? "Lançado" : "Pendente"}
            </Badge>
          </div>

          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{formatEventTimeRange(event)}</span>
            <span className="opacity-50">•</span>
            <span>{formatDuration(getEventDurationMinutes(event))}</span>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1">
          {event.webLink ? (
            <Button
              variant="ghost"
              size="icon"
              asChild
              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <a
                href={event.webLink}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Abrir no Outlook"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end">
        <Button
          size="sm"
          variant={isImported ? "outline" : "default"}
          className={cn(
            "h-8 rounded-lg px-3 text-xs font-medium transition-all",
            isImported
              ? "opacity-50 cursor-not-allowed"
              : "bg-brand-500 text-white hover:bg-brand-600 shadow-sm shadow-brand-500/20",
          )}
          onClick={() => onImport(event)}
          disabled={isImported}
        >
          <TimerReset className="mr-1.5 h-3.5 w-3.5" />
          {isImported ? "Já registrado" : "Usar reunião"}
        </Button>
      </div>
    </div>
  );
}
