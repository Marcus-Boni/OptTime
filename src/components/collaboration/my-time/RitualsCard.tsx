"use client";

import { Crown, RefreshCw, Repeat, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatDuration } from "@/lib/utils";
import type { RitualTime } from "@/types/collaboration";

export interface RitualsCardProps {
  rituals: RitualTime[];
  /** Used to express each ritual as a share of the period's meeting time. */
  totalMeetingMinutes: number;
}

/**
 * The standing commitments and what they cost.
 *
 * Deliberately limited to recurring series: a one-off meeting is a decision
 * already made, while a weekly ritual is a decision that keeps being made —
 * and the only one a person can renegotiate once and get hours back.
 */
export function RitualsCard({
  rituals,
  totalMeetingMinutes,
}: RitualsCardProps) {
  return (
    <Card className="border-border/50 bg-card/80" data-tour="my-time-rituals">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Repeat className="size-4 text-muted-foreground" aria-hidden="true" />
          Reuniões recorrentes
        </CardTitle>
        <p className="mt-1 text-sm text-muted-foreground">
          O que se repete na sua agenda — e quanto isso custa no período.
        </p>
      </CardHeader>

      <CardContent>
        {rituals.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma reunião recorrente detectada neste período.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {rituals.map((ritual) => {
              const share =
                totalMeetingMinutes > 0
                  ? Math.round((ritual.minutes / totalMeetingMinutes) * 100)
                  : 0;

              return (
                <li
                  key={ritual.key}
                  className="rounded-xl border border-border/50 bg-background/40 p-3 transition-colors duration-150 hover:border-brand-500/30"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {ritual.title}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {ritual.occurrences}x no período ·{" "}
                        {ritual.averageParticipants} participante(s) em média
                      </p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="font-mono text-sm font-semibold tabular-nums text-foreground">
                        {formatDuration(ritual.minutes)}
                      </p>
                      {share > 0 && (
                        <p className="text-[11px] text-muted-foreground">
                          {share}% do seu tempo em reunião
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-muted/50">
                    <div
                      className="h-full rounded-full bg-brand-500/60"
                      style={{ width: `${Math.min(100, share)}%` }}
                      aria-hidden="true"
                    />
                  </div>

                  {(ritual.isOrganizer ||
                    ritual.rescheduled > 0 ||
                    ritual.cancelled > 0) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ritual.isOrganizer && (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge
                              variant="outline"
                              className="gap-1 border-brand-500/30 text-[10px] text-brand-500"
                            >
                              <Crown className="size-2.5" aria-hidden="true" />
                              você organiza
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            Você é o organizador — pode encurtar, espaçar ou
                            encerrar esta série.
                          </TooltipContent>
                        </Tooltip>
                      )}

                      {ritual.rescheduled > 0 && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-amber-500/30 text-[10px] text-amber-600 dark:text-amber-400"
                        >
                          <RefreshCw className="size-2.5" aria-hidden="true" />
                          {ritual.rescheduled} remarcada(s)
                        </Badge>
                      )}

                      {ritual.cancelled > 0 && (
                        <Badge
                          variant="outline"
                          className="gap-1 border-rose-500/30 text-[10px] text-rose-600 dark:text-rose-400"
                        >
                          <X className="size-2.5" aria-hidden="true" />
                          {ritual.cancelled} cancelada(s)
                        </Badge>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
