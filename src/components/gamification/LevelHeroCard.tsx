"use client";

import { motion } from "framer-motion";
import { ArrowRight, Flame, Sparkles, Trophy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { GamificationProfile } from "@/lib/gamification/types";
import { cn } from "@/lib/utils";

export interface LevelHeroCardProps {
  profile: GamificationProfile;
}

interface StatProps {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
  icon?: React.ReactNode;
}

function Stat({ label, value, hint, accent, icon }: StatProps) {
  const content = (
    <div className="rounded-xl border border-border/60 bg-background/60 px-4 py-3">
      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {icon}
        {label}
      </div>
      <p
        className={cn(
          "mt-1.5 font-mono text-2xl font-bold tabular-nums",
          accent ? "text-brand-500" : "text-foreground",
        )}
      >
        {value}
      </p>
    </div>
  );

  if (!hint) return content;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="cursor-help">{content}</div>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        <span>{hint}</span>
      </TooltipContent>
    </Tooltip>
  );
}

const STATUS_COPY: Record<
  GamificationProfile["currentPeriodStatus"],
  { label: string; tone: string }
> = {
  open: {
    label: "Semana em aberto",
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  submitted: {
    label: "Semana submetida",
    tone: "border-blue-500/30 bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  approved: {
    label: "Semana aprovada",
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  rejected: {
    label: "Semana rejeitada",
    tone: "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400",
  },
};

/**
 * Header of the Journey page: level, XP progress and streak, plus the single
 * action that matters right now — closing the open week.
 */
export function LevelHeroCard({ profile }: LevelHeroCardProps) {
  const { level, currentStreak, bestStreak, xp, currentPeriodStatus } = profile;
  const progressPercent = Math.min(100, Math.round(level.progress * 100));
  const status = STATUS_COPY[currentPeriodStatus];
  const weekIsOpen =
    currentPeriodStatus === "open" || currentPeriodStatus === "rejected";

  return (
    <Card className="relative overflow-hidden border-brand-500/20 bg-card/80 backdrop-blur">
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand-500/10 via-transparent to-transparent"
        aria-hidden="true"
      />

      <CardContent className="relative space-y-6 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-500/15 ring-2 ring-brand-500/25">
              <Trophy className="h-7 w-7 text-brand-500" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wider text-brand-500">
                Nível {level.level}
              </p>
              <h2 className="font-display text-2xl font-bold text-foreground">
                {level.title}
              </h2>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {level.blurb}
              </p>
            </div>
          </div>

          <span
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              status.tone,
            )}
          >
            {status.label}
          </span>
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between text-sm">
            <span className="font-mono font-semibold text-foreground tabular-nums">
              {xp.toLocaleString("pt-BR")} XP
            </span>
            <span className="text-xs text-muted-foreground">
              {level.xpForNextLevel !== null && level.nextTitle
                ? `${level.xpForNextLevel} XP para ${level.nextTitle}`
                : level.xpForNextLevel !== null
                  ? `${level.xpForNextLevel} XP para o próximo nível`
                  : "Topo da trilha"}
            </span>
          </div>
          <div
            className="h-2.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progressPercent}
            aria-label={`Progresso do nível: ${progressPercent}%`}
          >
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-brand-500 to-brand-400"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercent}%` }}
              transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Sequência"
            value={`${currentStreak}`}
            accent={currentStreak > 0}
            hint="Semanas seguidas fechadas sem pular nenhuma."
            icon={<Flame className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <Stat
            label="Recorde"
            value={`${bestStreak}`}
            hint="Sua maior sequência até hoje."
            icon={<Sparkles className="h-3.5 w-3.5" aria-hidden="true" />}
          />
          <Stat
            label="Semanas fechadas"
            value={`${profile.counters.submittedWeeks}`}
            hint="Total de semanas submetidas."
          />
        </div>

        {profile.streakAtRisk ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3">
            <p className="text-sm text-amber-700 dark:text-amber-300">
              <span className="font-semibold">
                Sua sequência de {currentStreak}{" "}
                {currentStreak === 1 ? "semana" : "semanas"} está em jogo.
              </span>{" "}
              Feche {profile.currentPeriodLabel.toLowerCase()} para mantê-la.
            </p>
            <Button asChild size="sm" className="shrink-0">
              <Link href="/dashboard/time?view=timesheets">
                Fechar semana
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : weekIsOpen ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/60 px-4 py-3">
            <p className="text-sm text-muted-foreground">
              {profile.currentPeriodLabel} ainda está aberta.
            </p>
            <Button asChild size="sm" variant="outline" className="shrink-0">
              <Link href="/dashboard/time?view=timesheets">
                Revisar e fechar
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
