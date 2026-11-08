"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock,
  Info,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Square,
  XCircle,
} from "lucide-react";
import type { TimeBotBriefing } from "@/hooks/use-timebot";
import { cn, formatDuration } from "@/lib/utils";

const TONE_STYLES = {
  info: {
    icon: Info,
    className:
      "border-blue-500/25 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  warning: {
    icon: AlertTriangle,
    className:
      "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  success: {
    icon: CheckCircle2,
    className:
      "border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  danger: {
    icon: XCircle,
    className: "border-red-500/25 bg-red-500/10 text-red-700 dark:text-red-300",
  },
} as const;

export interface BriefingPanelProps {
  briefing: TimeBotBriefing;
  onPrompt: (prompt: string) => void;
}

/**
 * Proactive opening screen: what the user needs to know before asking.
 */
export function BriefingPanel({ briefing, onPrompt }: BriefingPanelProps) {
  const progress =
    briefing.weekTargetMinutes > 0
      ? Math.min(
          100,
          Math.round((briefing.weekMinutes / briefing.weekTargetMinutes) * 100),
        )
      : 0;

  const hasActiveTimer = briefing.timer.running || briefing.timer.paused;
  const isManagerOrAdmin =
    briefing.role === "manager" || briefing.role === "admin";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-bold font-sora text-base text-foreground tracking-tight">
            Olá, {briefing.firstName}! 👋
          </h3>
          <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
            Seu resumo operacional de hoje.
          </p>
        </div>

        {isManagerOrAdmin && briefing.pendingApprovals > 0 && (
          <button
            type="button"
            onClick={() => onPrompt("O que preciso aprovar?")}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full bg-orange-500/15 px-2.5 py-1 font-medium text-[10.5px] text-orange-600 ring-1 ring-orange-500/25 transition-colors hover:bg-orange-500/20 dark:text-orange-300"
          >
            <ShieldCheck className="h-3 w-3" aria-hidden="true" />
            <span>{briefing.pendingApprovals} aprovação(ões) pendente(s)</span>
          </button>
        )}
      </div>

      {/* Live timer banner when a timer is running or paused */}
      {hasActiveTimer && (
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-orange-500/10 p-3 ring-1 ring-orange-500/25 dark:bg-orange-500/12">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-white shadow-xs">
              <Clock className="h-4 w-4" aria-hidden="true" />
              {briefing.timer.running && (
                <span
                  aria-hidden="true"
                  className="-top-0.5 -right-0.5 absolute h-2.5 w-2.5 animate-ping rounded-full bg-orange-400 motion-reduce:animate-none"
                />
              )}
            </span>
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
                <span className="truncate">
                  {briefing.timer.projectName ?? "Cronômetro ativo"}
                </span>
                <span className="rounded bg-orange-500/20 px-1.5 py-0.5 font-mono text-[10px] text-orange-700 tabular-nums dark:text-orange-300">
                  {formatDuration(briefing.timer.elapsedMinutes)}
                </span>
              </p>
              <p className="text-[10.5px] text-neutral-600 dark:text-neutral-300">
                {briefing.timer.paused
                  ? "Pausado no momento"
                  : "Em execução agora"}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() =>
                onPrompt(
                  briefing.timer.paused
                    ? "Retome o cronômetro"
                    : "Pause o cronômetro",
                )
              }
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-background/80 px-2 font-medium text-[10.5px] text-foreground ring-1 ring-black/10 transition-colors hover:bg-background dark:bg-white/10 dark:ring-white/15"
            >
              {briefing.timer.paused ? (
                <>
                  <Play
                    className="h-3 w-3 text-orange-500"
                    aria-hidden="true"
                  />
                  Retomar
                </>
              ) : (
                <>
                  <Pause
                    className="h-3 w-3 text-orange-500"
                    aria-hidden="true"
                  />
                  Pausar
                </>
              )}
            </button>
            <button
              type="button"
              onClick={() => onPrompt("Pare o cronômetro e registre as horas")}
              className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-lg bg-orange-500 px-2 font-medium text-[10.5px] text-white transition-colors hover:bg-orange-600"
            >
              <Square className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
              Parar
            </button>
          </div>
        </div>
      )}

      {/* Live counters */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-2xl bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900/90 dark:ring-white/10">
          <p className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider dark:text-neutral-400">
            Hoje
          </p>
          <p className="mt-1 font-bold font-mono text-foreground text-xl tabular-nums">
            {formatDuration(briefing.todayMinutes)}
          </p>
          <p className="mt-1 text-[10px] text-neutral-400 dark:text-neutral-500">
            {briefing.todayMinutes > 0
              ? "Registrado hoje"
              : "Nenhum lançamento ainda"}
          </p>
        </div>

        <div className="rounded-2xl bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,0.03)] ring-1 ring-black/[0.06] dark:bg-neutral-900/90 dark:ring-white/10">
          <div className="flex items-center justify-between gap-1">
            <p className="font-medium text-[10px] text-neutral-500 uppercase tracking-wider dark:text-neutral-400">
              Semana
            </p>
            <span className="font-mono text-[10px] text-neutral-500 tabular-nums dark:text-neutral-400">
              {progress}% da meta
            </span>
          </div>
          <p className="mt-1 font-bold font-mono text-foreground text-xl tabular-nums">
            {formatDuration(briefing.weekMinutes)}
          </p>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label="Progresso da semana"
          >
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                progress >= 100 ? "bg-emerald-500" : "bg-orange-500",
              )}
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actionable highlights */}
      {briefing.highlights.length > 0 && (
        <ul className="space-y-2">
          {briefing.highlights.map((highlight, index) => {
            const tone = TONE_STYLES[highlight.tone];
            const Icon = tone.icon;

            return (
              <motion.li
                key={highlight.id}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.06 * index, duration: 0.3 }}
              >
                <button
                  type="button"
                  onClick={() => onPrompt(highlight.prompt)}
                  className={cn(
                    "flex w-full cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-transform hover:scale-[1.005] active:scale-[0.995]",
                    tone.className,
                  )}
                >
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[11.5px]">
                      {highlight.title}
                    </span>
                    <span className="block truncate text-[10.5px] opacity-85">
                      {highlight.detail}
                    </span>
                  </span>
                  <ChevronRight
                    className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-60"
                    aria-hidden="true"
                  />
                </button>
              </motion.li>
            );
          })}
        </ul>
      )}

      {!briefing.providerConfigured && (
        <p className="rounded-xl border border-border/60 bg-neutral-100 px-3 py-2 text-[10.5px] text-neutral-500 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400">
          Modo offline: respondo com base direta nos seus dados, sem provedor de
          IA configurado.
        </p>
      )}

      <div>
        <p className="mb-2 flex items-center gap-1.5 font-medium text-[11px] text-neutral-500 dark:text-neutral-400">
          <Sparkles
            className="h-3.5 w-3.5 text-orange-500 dark:text-orange-400"
            aria-hidden="true"
          />
          Comece por aqui
        </p>
        <div className="flex flex-wrap gap-1.5">
          {briefing.suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onClick={() => onPrompt(suggestion)}
              className="cursor-pointer rounded-full bg-neutral-100 px-3 py-1.5 text-left text-[11px] text-neutral-600 ring-1 ring-black/[0.06] transition-all hover:bg-orange-500/10 hover:text-orange-600 hover:ring-orange-500/30 dark:bg-neutral-900 dark:text-neutral-300 dark:ring-white/10 dark:hover:text-orange-300"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
