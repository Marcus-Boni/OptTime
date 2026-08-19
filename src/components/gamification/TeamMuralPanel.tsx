"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Flame, Medal, PartyPopper, Users } from "lucide-react";
import {
  resolveIcon,
  TIER_VISUALS,
} from "@/components/gamification/achievement-visuals";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { TeamMural } from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

export interface TeamMuralPanelProps {
  mural: TeamMural;
}

const POSITION_STYLE: Record<number, string> = {
  1: "bg-amber-400/20 text-amber-700 dark:text-amber-300",
  2: "bg-slate-400/20 text-slate-600 dark:text-slate-300",
  3: "bg-amber-700/20 text-amber-700 dark:text-amber-500",
};

function WeekPulseBars({ mural }: { mural: TeamMural }) {
  return (
    <div className="flex items-end gap-1.5" aria-hidden="true">
      {mural.history.map((week) => {
        const height = Math.max(8, Math.round(week.rate * 44));
        const hitGoal = week.rate >= mural.collectiveGoal;

        return (
          <Tooltip key={week.period}>
            <TooltipTrigger asChild>
              <div className="flex flex-1 cursor-help flex-col items-center gap-1">
                <div className="flex h-11 w-full items-end">
                  <div
                    className={cn(
                      "w-full rounded-t-md transition-colors",
                      hitGoal ? "bg-emerald-500/70" : "bg-brand-500/40",
                    )}
                    style={{ height }}
                  />
                </div>
                <span className="font-mono text-[10px] text-muted-foreground">
                  {week.period.split("-W")[1]}
                </span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p className="font-medium">{week.label}</p>
              <p className="text-xs text-muted-foreground">
                {week.closed} de {week.total} fecharam ·{" "}
                {Math.round(week.rate * 100)}%
              </p>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/**
 * Team culture mural.
 *
 * Celebratory by default — collective progress and teammates' unlocks. The XP
 * ranking only appears when an admin enabled it org-wide, and it lists only
 * people who chose to be visible.
 */
export function TeamMuralPanel({ mural }: TeamMuralPanelProps) {
  if (mural.teamSize <= 1) {
    return (
      <Card className="border-border/50 bg-card/80 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Users className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Mural da equipe
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="rounded-xl border border-dashed border-border/60 py-8 text-center text-sm text-muted-foreground">
            Assim que você fizer parte de uma equipe, os destaques coletivos
            aparecem aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  const ratePercent = Math.round(mural.currentWeek.rate * 100);
  const goalPercent = Math.round(mural.collectiveGoal * 100);

  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2 font-display text-base">
            <Users className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Mural da equipe
          </CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            {mural.currentWeek.label} · {mural.teamSize} pessoas
          </p>
        </div>

        {mural.collectiveStreak > 0 ? (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <Flame className="h-3.5 w-3.5" aria-hidden="true" />
            {mural.collectiveStreak}{" "}
            {mural.collectiveStreak === 1 ? "semana" : "semanas"} acima de{" "}
            {goalPercent}%
          </span>
        ) : null}
      </CardHeader>

      <CardContent className="space-y-6">
        <div className="rounded-xl border border-border/60 bg-background/60 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Semana atual
            </span>
            <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
              {mural.currentWeek.closed}/{mural.currentWeek.total}
            </span>
          </div>

          <div
            className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={ratePercent}
            aria-label={`${ratePercent}% da equipe fechou a semana`}
          >
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-700",
                mural.currentWeek.rate >= mural.collectiveGoal
                  ? "bg-emerald-500"
                  : "bg-brand-500",
              )}
              style={{ width: `${Math.max(ratePercent, 2)}%` }}
            />
          </div>

          <p className="mt-2 text-xs text-muted-foreground">
            {ratePercent}% da equipe já fechou · meta coletiva de {goalPercent}%
          </p>

          <div className="mt-4">
            <WeekPulseBars mural={mural} />
          </div>
        </div>

        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Conquistas recentes do time
          </p>

          {mural.highlights.length > 0 ? (
            <ul className="space-y-2">
              {mural.highlights.map((highlight) => {
                const Icon = resolveIcon(highlight.icon);
                const visual = TIER_VISUALS[highlight.tier];

                return (
                  <li
                    key={`${highlight.userId}-${highlight.achievementKey}-${highlight.tier}`}
                    className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5"
                  >
                    <UserAvatar
                      name={highlight.userName}
                      image={highlight.userImage}
                      size="sm"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-foreground">
                        <span className="font-medium">
                          {highlight.userName}
                        </span>{" "}
                        desbloqueou{" "}
                        <span className="font-medium">
                          {highlight.achievementName}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(highlight.unlockedAt), {
                          addSuffix: true,
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-2",
                        visual.surface,
                        visual.ring,
                      )}
                    >
                      <Icon
                        className={cn("h-4 w-4", visual.ink)}
                        aria-hidden="true"
                      />
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="flex items-center gap-3 rounded-xl border border-dashed border-border/60 px-4 py-6 text-sm text-muted-foreground">
              <PartyPopper className="h-4 w-4 shrink-0" aria-hidden="true" />
              Nenhuma conquista nova nos últimos dias. A próxima pode ser sua.
            </div>
          )}
        </div>

        {mural.ranking ? (
          <div>
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Medal className="h-3.5 w-3.5" aria-hidden="true" />
              Ranking de XP
            </p>
            <ul className="space-y-1">
              {mural.ranking.map((row) => (
                <li
                  key={row.userId}
                  className={cn(
                    "flex items-center gap-3 rounded-xl border px-3 py-2",
                    row.isCurrentUser
                      ? "border-brand-500/40 bg-brand-500/5"
                      : "border-transparent hover:bg-accent/50",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold tabular-nums",
                      POSITION_STYLE[row.position] ??
                        "bg-muted text-muted-foreground",
                    )}
                  >
                    {row.position}
                  </span>
                  <UserAvatar
                    name={row.userName}
                    image={row.userImage}
                    size="sm"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {row.userName}
                      {row.isCurrentUser ? (
                        <span className="ml-1.5 text-xs font-normal text-brand-500">
                          você
                        </span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      Nível {row.level} · {row.levelTitle}
                    </p>
                  </div>
                  {row.currentStreak > 1 ? (
                    <span className="hidden items-center gap-1 font-mono text-xs text-orange-600 sm:inline-flex dark:text-orange-400">
                      <Flame className="h-3 w-3" aria-hidden="true" />
                      {row.currentStreak}
                    </span>
                  ) : null}
                  <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                    {row.xp.toLocaleString("pt-BR")}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : mural.rankingEnabled && mural.viewerOptedOut ? (
          <p className="rounded-xl border border-dashed border-border/60 px-4 py-3 text-xs text-muted-foreground">
            Você optou por não aparecer no mural, então o ranking fica oculto.
            Ative a visibilidade nas configurações para participar.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
