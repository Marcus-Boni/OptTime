"use client";

import { ExternalLink, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn, formatDuration } from "@/lib/utils";
import type { CollaboratorTime } from "@/types/collaboration";

/** Rows past this are behind the card's own scroll. */
const VISIBLE_ROWS = 8;

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "?";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export interface CollaboratorsCardProps {
  collaborators: CollaboratorTime[];
}

/**
 * Who the period's calendar time went to.
 *
 * Minutes are attributed in full to every participant, which the footnote
 * states out loud: a two-hour workshop with six people is two hours with each
 * of them, so the column never sums to the period total — and should not.
 */
export function CollaboratorsCard({ collaborators }: CollaboratorsCardProps) {
  const top = collaborators.slice(0, VISIBLE_ROWS);
  const max = top[0]?.minutes ?? 0;

  return (
    <Card className="border-border/50 bg-card/80" data-tour="my-time-people">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-display text-base">
          <Users className="size-4 text-muted-foreground" aria-hidden="true" />
          Com quem você passou o tempo
        </CardTitle>
      </CardHeader>

      <CardContent>
        {top.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Nenhuma reunião com outras pessoas neste período.
          </p>
        ) : (
          <>
            <ul className="space-y-1">
              {top.map((person) => (
                <li key={person.key}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="relative flex items-center gap-3 overflow-hidden rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
                        <span
                          className="absolute inset-y-0 left-0 bg-brand-500/[0.07]"
                          style={{
                            width:
                              max > 0
                                ? `${(person.minutes / max) * 100}%`
                                : "0%",
                          }}
                          aria-hidden="true"
                        />

                        <span
                          className={cn(
                            "relative flex size-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold",
                            person.isExternal
                              ? "bg-violet-500/15 text-violet-600 dark:text-violet-400"
                              : "bg-brand-500/15 text-brand-500",
                          )}
                          aria-hidden="true"
                        >
                          {initials(person.name)}
                        </span>

                        <span className="relative min-w-0 flex-1">
                          <span className="flex items-center gap-1.5">
                            <span className="truncate text-sm font-medium text-foreground">
                              {person.name}
                            </span>
                            {person.isExternal && (
                              <ExternalLink
                                className="size-3 shrink-0 text-violet-500"
                                aria-label="Participante externo"
                              />
                            )}
                          </span>
                          <span className="block text-[11px] text-muted-foreground">
                            {person.meetings} reunião(ões)
                            {person.oneOnOnes > 0
                              ? ` · ${person.oneOnOnes} individual(is)`
                              : ""}
                          </span>
                        </span>

                        <span className="relative font-mono text-sm tabular-nums text-foreground">
                          {formatDuration(person.minutes)}
                        </span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      {person.email ?? person.name}
                      {person.isExternal ? " · fora da OptSolv" : ""}
                    </TooltipContent>
                  </Tooltip>
                </li>
              ))}
            </ul>

            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              A duração inteira da reunião conta para cada participante — por
              isso a soma desta lista é maior que o seu tempo total.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
