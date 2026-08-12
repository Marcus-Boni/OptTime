"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Info,
  Sparkles,
  XCircle,
} from "lucide-react";
import type { TimeBotBriefing } from "@/hooks/use-timebot";
import { cn, formatDuration } from "@/lib/utils";

const TONE_STYLES = {
  info: {
    icon: Info,
    className:
      "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300",
  },
  warning: {
    icon: AlertTriangle,
    className:
      "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  success: {
    icon: CheckCircle2,
    className:
      "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  danger: {
    icon: XCircle,
    className: "border-red-500/30 bg-red-500/10 text-red-700 dark:text-red-300",
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

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-4"
    >
      <div>
        <h3 className="font-sora font-bold text-base text-foreground">
          Olá, {briefing.firstName}! 👋
        </h3>
        <p className="mt-0.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          Seu resumo rápido de hoje.
        </p>
      </div>

      {/* Live counters */}
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-border/60 bg-background/60 p-3 dark:border-white/10 dark:bg-neutral-950/50">
          <p className="text-[10px] text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
            Hoje
          </p>
          <p className="mt-0.5 font-mono font-bold text-foreground text-lg tabular-nums">
            {formatDuration(briefing.todayMinutes)}
          </p>
        </div>

        <div className="rounded-xl border border-border/60 bg-background/60 p-3 dark:border-white/10 dark:bg-neutral-950/50">
          <p className="text-[10px] text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
            Semana
          </p>
          <p className="mt-0.5 font-mono font-bold text-foreground text-lg tabular-nums">
            {formatDuration(briefing.weekMinutes)}
          </p>
          <div
            className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800"
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
                    "flex w-full cursor-pointer items-start gap-2 rounded-xl border px-3 py-2 text-left transition-transform hover:scale-[1.01] active:scale-[0.99]",
                    tone.className,
                  )}
                >
                  <Icon
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-[11px]">
                      {highlight.title}
                    </span>
                    <span className="block truncate text-[10px] opacity-80">
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
        <p className="rounded-lg border border-border/60 bg-neutral-100 px-3 py-2 text-[10px] text-neutral-500 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-400">
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
              className="cursor-pointer rounded-lg border border-border/60 bg-background px-2.5 py-1.5 text-left text-[11px] text-neutral-600 transition-colors hover:border-orange-500/40 hover:bg-orange-500/10 hover:text-orange-600 dark:border-white/10 dark:bg-neutral-900 dark:text-neutral-300 dark:hover:text-orange-400"
            >
              {suggestion}
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
