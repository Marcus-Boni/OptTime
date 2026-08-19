"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Flame,
  PartyPopper,
  Sparkles,
  Trophy,
  X,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  resolveIcon,
  TIER_VISUALS,
} from "@/components/gamification/achievement-visuals";
import { Button } from "@/components/ui/button";
import type { CelebrationPayload } from "@/lib/gamification/types";
import { playEarcon } from "@/lib/sound/sound-effects";
import { cn, formatDuration } from "@/lib/utils";

export interface CelebrationOverlayProps {
  celebration: CelebrationPayload | null;
  onClose: () => void;
}

const AUTO_DISMISS_MS = 11_000;
const COUNT_UP_MS = 900;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(query.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      setReduced(event.matches);
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return reduced;
}

/** Eases a number from 0 to `target` for the XP reveal. */
function useCountUp(target: number, enabled: boolean): number {
  const [value, setValue] = useState(enabled ? 0 : target);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      setValue(target);
      return;
    }

    const start = performance.now();

    function step(now: number) {
      const elapsed = now - start;
      const ratio = Math.min(1, elapsed / COUNT_UP_MS);
      const eased = 1 - (1 - ratio) ** 3;
      setValue(Math.round(target * eased));
      if (ratio < 1) frameRef.current = requestAnimationFrame(step);
    }

    frameRef.current = requestAnimationFrame(step);

    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [target, enabled]);

  return value;
}

function ReasonChip({ label, xp }: { label: string; xp: number }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/60 px-3 py-2">
      <span className="text-sm text-foreground">{label}</span>
      <span className="font-mono text-xs font-semibold text-brand-500">
        +{xp}
      </span>
    </li>
  );
}

function UnlockedBadge({
  icon,
  name,
  tier,
  tierLabel,
}: {
  icon: string;
  name: string;
  tier: keyof typeof TIER_VISUALS;
  tierLabel: string;
}) {
  const Icon = resolveIcon(icon);
  const visual = TIER_VISUALS[tier];

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/60 p-3">
      <div
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full ring-2",
          visual.surface,
          visual.ring,
        )}
      >
        <Icon className={cn("h-5 w-5", visual.ink)} aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        <p className={cn("text-xs font-medium", visual.ink)}>{tierLabel}</p>
      </div>
    </div>
  );
}

/**
 * Full-screen celebration shown right after a week is closed.
 *
 * Deliberately short-lived and dismissible: the reward should feel like a
 * flourish on the way out, never a modal the user has to fight past.
 */
export default function CelebrationOverlay({
  celebration,
  onClose,
}: CelebrationOverlayProps) {
  // AnimatePresence has to outlive the celebration for the exit animation to
  // run, so the card lives in its own component below.
  return (
    <AnimatePresence>
      {celebration ? (
        <CelebrationCard
          key="celebration"
          celebration={celebration}
          onClose={onClose}
        />
      ) : null}
    </AnimatePresence>
  );
}

interface CelebrationCardProps {
  celebration: CelebrationPayload;
  onClose: () => void;
}

function CelebrationCard({ celebration, onClose }: CelebrationCardProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [paused, setPaused] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const xpDisplay = useCountUp(celebration.xpGained, !reducedMotion);

  const handleClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    playEarcon("celebration");
  }, []);

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, [handleClose]);

  useEffect(() => {
    if (paused) return;

    const timer = window.setTimeout(handleClose, AUTO_DISMISS_MS);
    return () => window.clearTimeout(timer);
  }, [paused, handleClose]);

  const {
    periodLabel,
    totalMinutes,
    xpGained,
    reasons,
    streak,
    isPersonalBest,
    level,
    leveledUp,
    unlocked,
  } = celebration;

  const title = leveledUp
    ? `Nível ${level.level} · ${level.title}`
    : "Semana fechada!";
  const subtitle = `${periodLabel} · ${formatDuration(totalMinutes)} registradas`;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
      onClick={handleClose}
      role="presentation"
    >
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby="celebration-title"
        initial={
          reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 16 }
        }
        animate={
          reducedMotion ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }
        }
        exit={reducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="relative z-[100] w-full max-w-md overflow-hidden rounded-2xl border border-brand-500/25 bg-card shadow-2xl shadow-black/40"
        onClick={(event) => event.stopPropagation()}
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocusCapture={() => setPaused(true)}
      >
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-brand-500/20 to-transparent"
          aria-hidden="true"
        />

        <Button
          ref={closeButtonRef}
          variant="ghost"
          size="icon"
          onClick={handleClose}
          aria-label="Fechar celebração"
          className="absolute right-2 top-2 z-10 h-8 w-8 text-muted-foreground"
        >
          <X className="h-4 w-4" />
        </Button>

        <div className="relative px-6 pb-6 pt-8">
          <div className="flex flex-col items-center text-center">
            <motion.div
              initial={reducedMotion ? false : { scale: 0.6, rotate: -12 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{
                type: "spring",
                stiffness: 380,
                damping: 18,
                delay: 0.1,
              }}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/15 ring-4 ring-brand-500/20"
            >
              {leveledUp ? (
                <Trophy className="h-8 w-8 text-brand-500" aria-hidden="true" />
              ) : (
                <PartyPopper
                  className="h-8 w-8 text-brand-500"
                  aria-hidden="true"
                />
              )}
            </motion.div>

            <h2
              id="celebration-title"
              className="mt-4 font-display text-2xl font-bold text-foreground"
            >
              {title}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>

            {xpGained > 0 ? (
              <div className="mt-4 flex items-baseline gap-1.5">
                <span className="font-mono text-4xl font-bold text-brand-500 tabular-nums">
                  +{xpDisplay}
                </span>
                <span className="font-mono text-sm font-semibold text-brand-500/80">
                  XP
                </span>
              </div>
            ) : null}

            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {streak > 1 ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-500/30 bg-orange-500/10 px-3 py-1 text-xs font-semibold text-orange-600 dark:text-orange-400">
                  <Flame className="h-3.5 w-3.5" aria-hidden="true" />
                  {streak} semanas seguidas
                </span>
              ) : null}
              {isPersonalBest ? (
                <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/30 bg-brand-500/10 px-3 py-1 text-xs font-semibold text-brand-500">
                  <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                  Recorde pessoal
                </span>
              ) : null}
            </div>
          </div>

          {reasons.length > 0 ? (
            <ul className="mt-6 space-y-1.5">
              {reasons.map((reason) => (
                <ReasonChip
                  key={reason.key}
                  label={reason.label}
                  xp={reason.xp}
                />
              ))}
            </ul>
          ) : null}

          {unlocked.length > 0 ? (
            <div className="mt-5">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {unlocked.length === 1
                  ? "Conquista desbloqueada"
                  : `${unlocked.length} conquistas desbloqueadas`}
              </p>
              <div className="space-y-2">
                {unlocked.map((achievement) => (
                  <UnlockedBadge
                    key={`${achievement.key}-${achievement.tier}`}
                    icon={achievement.icon}
                    name={achievement.name}
                    tier={achievement.tier}
                    tierLabel={achievement.tierLabel}
                  />
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-5 rounded-xl border border-border/60 bg-background/60 p-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Nível {level.level} · {level.title}
              </span>
              <span className="font-mono text-xs text-muted-foreground">
                {level.xpForNextLevel !== null
                  ? `faltam ${level.xpForNextLevel} XP`
                  : "nível máximo"}
              </span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(level.progress * 100)}
              aria-label={`Progresso para o próximo nível: ${Math.round(level.progress * 100)}%`}
            >
              <motion.div
                className="h-full rounded-full bg-brand-500"
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, level.progress * 100)}%` }}
                transition={{
                  duration: reducedMotion ? 0 : 0.8,
                  delay: 0.25,
                }}
              />
            </div>
          </div>

          <div className="mt-5 flex items-center gap-2">
            <Button
              asChild
              variant="outline"
              className="flex-1 border-brand-500/40 text-brand-500 hover:bg-brand-500/10 hover:text-brand-500"
            >
              <Link href="/dashboard/journey" onClick={handleClose}>
                Ver minha jornada
                <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button variant="ghost" onClick={handleClose}>
              Fechar
            </Button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
