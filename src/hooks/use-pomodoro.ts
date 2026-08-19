"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAmbientSound } from "@/hooks/use-ambient-sound";
import { type ActiveTimer, useTimer } from "@/hooks/use-timer";
import {
  BREAK_VOLUME_DUCK,
  FOCUS_TICK_MS,
  formatCountdown,
  isBreakPhase,
  PHASE_META,
} from "@/lib/focus/constants";
import type { ChimeKind, FocusPhase } from "@/lib/focus/types";
import { playEarcon } from "@/lib/sound/sound-effects";
import { formatDuration } from "@/lib/utils";
import {
  getPhaseProgress,
  getRemainingMs,
  isPhaseComplete,
  isPhaseRunning,
  type PhaseTransition,
  useFocusStore,
} from "@/stores/focus.store";

export interface PomodoroController {
  phase: FocusPhase;
  /** Milliseconds left in the loaded phase. */
  remainingMs: number;
  /** `MM:SS` (or `H:MM:SS`) countdown for the loaded phase. */
  countdown: string;
  /** Ring progress in the 0–1 range. */
  progress: number;
  isRunning: boolean;
  hasSession: boolean;
  /** Focus blocks completed in the current long-break cycle. */
  blocksInCycle: number;
  /** Focus blocks completed since the session started. */
  completedBlocks: number;
  /** Focus milliseconds banked across completed blocks. */
  focusMsCompleted: number;
  /** The real timer this session is attached to, when there is one. */
  timer: ActiveTimer | null;
  /** Elapsed time of the real timer, already formatted as `HH:MM:SS`. */
  timerDisplay: string;
  timerIsRunning: boolean;
  /** True while a control is awaiting the server. */
  isSyncingTimer: boolean;
  start: () => void;
  toggleRun: () => void;
  skipPhase: () => void;
  restartPhase: () => void;
  finish: () => void;
  /** Stop the real timer and close Focus Mode. */
  stopTimerAndExit: () => Promise<void>;
}

/** Sonner needs a stable id so rapid transitions replace instead of stacking. */
const TRANSITION_TOAST_ID = "focus-phase-transition";

function getChimeKind(to: FocusPhase): ChimeKind {
  if (to === "focus") return "focusStart";
  return to === "longBreak" ? "sessionEnd" : "breakStart";
}

function buildTransitionMessage(transition: PhaseTransition): string {
  const meta = PHASE_META[transition.to];

  if (transition.to === "focus") {
    return transition.autoStarted
      ? `${meta.label} retomado — bom trabalho.`
      : `Pausa encerrada. Comece quando estiver pronto.`;
  }

  if (transition.to === "longBreak") {
    return `Ciclo completo — ${transition.completedBlocks} blocos de foco. Aproveite a pausa longa.`;
  }

  return `Bloco de foco concluído. ${meta.label} liberada.`;
}

/**
 * The Pomodoro engine. Mount exactly one instance — it owns the countdown tick,
 * the phase transitions, the ambient audio graph and the coupling to the real
 * (server-authoritative) timer.
 *
 * The coupling is edge-triggered on purpose: we only pause or resume the real
 * timer when a focus block *starts* or *ends*, never continuously. Otherwise a
 * user pausing the timer by hand in the sidebar would be fought by this effect.
 */
export function usePomodoro(): PomodoroController {
  const session = useFocusStore((state) => state.session);
  const settings = useFocusStore((state) => state.settings);
  const sound = useFocusStore((state) => state.sound);
  const startSession = useFocusStore((state) => state.startSession);
  const endSession = useFocusStore((state) => state.endSession);
  const pausePhase = useFocusStore((state) => state.pausePhase);
  const resumePhase = useFocusStore((state) => state.resumePhase);
  const restartPhase = useFocusStore((state) => state.restartPhase);
  const advancePhase = useFocusStore((state) => state.advancePhase);
  const close = useFocusStore((state) => state.close);

  const {
    timer,
    displayTime,
    isRunning: timerIsRunning,
    isPaused: timerIsPaused,
    hasTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
  } = useTimer();

  const ambient = useAmbientSound();

  const [now, setNow] = useState(() => Date.now());
  const [isSyncingTimer, setIsSyncingTimer] = useState(false);

  const phaseRunning = isPhaseRunning(session);
  const remainingMs = session ? getRemainingMs(session, now) : 0;

  // Timer state is read inside effects that must not re-run on every poll.
  const timerStateRef = useRef({
    hasTimer,
    isRunning: timerIsRunning,
    isPaused: timerIsPaused,
  });
  timerStateRef.current = {
    hasTimer,
    isRunning: timerIsRunning,
    isPaused: timerIsPaused,
  };

  const pausedByFocusRef = useRef(false);
  const transitionLockRef = useRef(false);

  // ─── Countdown tick ────────────────────────────────────────────────
  useEffect(() => {
    if (!session) return;

    setNow(Date.now());
    if (!phaseRunning) return;

    const interval = setInterval(() => setNow(Date.now()), FOCUS_TICK_MS);

    // Background tabs throttle timers hard, so resync the moment we return.
    const handleVisibility = () => {
      if (!document.hidden) setNow(Date.now());
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [session, phaseRunning]);

  // ─── Phase completion ──────────────────────────────────────────────
  const notify = useCallback(
    (transition: PhaseTransition, message: string) => {
      if (
        !settings.notificationsEnabled ||
        typeof Notification === "undefined" ||
        Notification.permission !== "granted" ||
        !document.hidden
      ) {
        return;
      }

      try {
        new Notification(PHASE_META[transition.to].label, {
          body: message,
          tag: TRANSITION_TOAST_ID,
          icon: "/logo-white.ico",
        });
      } catch (error: unknown) {
        console.error("[usePomodoro] notify:", error);
      }
    },
    [settings.notificationsEnabled],
  );

  const completePhase = useCallback(
    (options?: { skipped?: boolean }) => {
      if (transitionLockRef.current) return;
      transitionLockRef.current = true;

      try {
        const transition = advancePhase(options);
        if (!transition) return;

        if (settings.chimeEnabled && !options?.skipped) {
          ambient.playChime(getChimeKind(transition.to));
        } else {
          playEarcon("phase_complete");
        }

        const message = transition.wasAway
          ? "Você ficou ausente — a próxima etapa está pausada esperando você."
          : buildTransitionMessage(transition);

        toast.success(PHASE_META[transition.to].label, {
          id: TRANSITION_TOAST_ID,
          description: message,
        });
        notify(transition, message);
      } finally {
        // Release after the store has committed so a stale tick cannot re-enter.
        transitionLockRef.current = false;
      }
    },
    [advancePhase, ambient, notify, settings.chimeEnabled],
  );

  // Fires both for a phase that ran out under our watch and for one that
  // expired while the device slept (frozen by reconcile with `expiredAway`).
  const phaseComplete = isPhaseComplete(session, now);

  useEffect(() => {
    if (phaseComplete) completePhase();
  }, [phaseComplete, completePhase]);

  // ─── Real timer coupling (edge-triggered) ──────────────────────────
  const focusIsActive = !!session && session.phase === "focus" && phaseRunning;
  const previousFocusActiveRef = useRef<boolean | null>(null);

  useEffect(() => {
    const previous = previousFocusActiveRef.current;
    previousFocusActiveRef.current = focusIsActive;

    if (!settings.pauseTimerOnBreak) return;
    if (previous === null || previous === focusIsActive) return;

    const { hasTimer: exists, isRunning, isPaused } = timerStateRef.current;
    if (!exists) return;

    async function sync() {
      setIsSyncingTimer(true);
      try {
        if (focusIsActive && isPaused) {
          pausedByFocusRef.current = false;
          await resumeTimer();
        } else if (!focusIsActive && isRunning) {
          pausedByFocusRef.current = true;
          await pauseTimer();
        }
      } catch (error: unknown) {
        console.error("[usePomodoro] sync timer:", error);
        toast.error("Não foi possível sincronizar o timer com o Modo Foco");
      } finally {
        setIsSyncingTimer(false);
      }
    }

    void sync();
  }, [focusIsActive, settings.pauseTimerOnBreak, pauseTimer, resumeTimer]);

  // ─── Ambient bed ───────────────────────────────────────────────────
  // The bed follows the *session*, not the overlay, so minimising Focus Mode
  // does not cut the sound. Breaks duck the level instead of stopping it.
  const effectiveVolume =
    session && isBreakPhase(session.phase)
      ? sound.volume * BREAK_VOLUME_DUCK
      : sound.volume;

  useEffect(() => {
    if (!session || sound.id === "none") {
      ambient.stop();
      return;
    }

    ambient.play(sound.id, effectiveVolume);
  }, [ambient, session, sound.id, effectiveVolume]);

  // ─── Keep the screen awake ─────────────────────────────────────────
  useEffect(() => {
    if (!session || !settings.keepScreenAwake) return;
    if (!("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let released = false;

    async function acquire() {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (released) {
          void sentinel.release();
          sentinel = null;
        }
      } catch {
        // Denied, unsupported, or the document lost visibility — non-critical.
      }
    }

    // The lock is dropped automatically whenever the page is hidden.
    const handleVisibility = () => {
      if (!document.hidden && !sentinel) void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [session, settings.keepScreenAwake]);

  // ─── Controls ──────────────────────────────────────────────────────
  const toggleRun = useCallback(() => {
    if (!session) {
      playEarcon("timer_start");
      startSession();
      return;
    }

    if (isPhaseRunning(session)) {
      playEarcon("timer_stop");
      pausePhase();
    } else {
      playEarcon("timer_start");
      resumePhase();
    }
  }, [session, startSession, pausePhase, resumePhase]);

  const skipPhase = useCallback(() => {
    if (!session) return;
    completePhase({ skipped: true });
  }, [session, completePhase]);

  /** Resume a timer we paused for a break, so nothing is left silently frozen. */
  const releaseTimerHold = useCallback(async () => {
    if (!pausedByFocusRef.current) return;
    pausedByFocusRef.current = false;

    const { hasTimer: exists, isPaused } = timerStateRef.current;
    if (!exists || !isPaused) return;

    try {
      await resumeTimer();
    } catch (error: unknown) {
      console.error("[usePomodoro] releaseTimerHold:", error);
    }
  }, [resumeTimer]);

  const finish = useCallback(() => {
    const completed = session?.completedBlocks ?? 0;
    const focusMs = session?.focusMsCompleted ?? 0;

    playEarcon("action_success");
    endSession();
    ambient.stop();
    void releaseTimerHold();

    if (completed > 0) {
      const label = completed === 1 ? "bloco" : "blocos";
      toast.success("Sessão de foco encerrada", {
        description: `${completed} ${label} de foco · ${formatDuration(Math.round(focusMs / 60_000))} concentrado.`,
      });
    }
  }, [session, endSession, ambient, releaseTimerHold]);

  const stopTimerAndExit = useCallback(async () => {
    setIsSyncingTimer(true);

    try {
      if (timerStateRef.current.hasTimer) {
        await stopTimer();
      }

      playEarcon("action_success");
      pausedByFocusRef.current = false;
      endSession();
      ambient.stop();
      close();
      toast.success("Timer parado e registro salvo");
    } catch (error: unknown) {
      console.error("[usePomodoro] stopTimerAndExit:", error);
      toast.error(
        error instanceof Error ? error.message : "Falha ao parar o timer",
      );
    } finally {
      setIsSyncingTimer(false);
    }
  }, [stopTimer, endSession, ambient, close]);

  return {
    phase: session?.phase ?? "focus",
    remainingMs,
    countdown: formatCountdown(
      session ? remainingMs : settings.focusMinutes * 60_000,
    ),
    progress: session ? getPhaseProgress(session, now) : 0,
    isRunning: phaseRunning,
    hasSession: !!session,
    blocksInCycle: session?.blocksInCycle ?? 0,
    completedBlocks: session?.completedBlocks ?? 0,
    focusMsCompleted: session?.focusMsCompleted ?? 0,
    timer,
    timerDisplay: displayTime,
    timerIsRunning,
    isSyncingTimer,
    start: startSession,
    toggleRun,
    skipPhase,
    restartPhase,
    finish,
    stopTimerAndExit,
  };
}
