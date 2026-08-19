"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  DEFAULT_AMBIENT_SOUND,
  DEFAULT_POMODORO_SETTINGS,
  getNextPhase,
  getPhaseDurationMs,
  PHASE_STALE_THRESHOLD_MS,
  POMODORO_PRESETS,
  SESSION_ABANDON_THRESHOLD_MS,
} from "@/lib/focus/constants";
import type {
  AmbientSoundId,
  AmbientSoundSettings,
  FocusPhase,
  FocusSession,
  PomodoroPresetId,
  PomodoroSettings,
} from "@/lib/focus/types";

/** Outcome of a completed phase, so the engine knows which effects to run. */
export interface PhaseTransition {
  from: FocusPhase;
  to: FocusPhase;
  /** Whether the new phase started counting down immediately. */
  autoStarted: boolean;
  /** True when the deadline was so overdue that we assume the user was away. */
  wasAway: boolean;
  /** Focus blocks completed after this transition. */
  completedBlocks: number;
}

interface FocusState {
  /** Whether the immersive overlay is on screen. */
  isOpen: boolean;
  /** In-flight Pomodoro session, or `null` when idle. */
  session: FocusSession | null;
  settings: PomodoroSettings;
  sound: AmbientSoundSettings;
  /** True once persisted preferences have been merged in. */
  isHydrated: boolean;
}

interface FocusActions {
  open: () => void;
  close: () => void;
  /** Create a session and start its first focus block. */
  startSession: () => void;
  /** Discard the session entirely. */
  endSession: () => void;
  /** Begin (or resume) the countdown of the loaded phase. */
  resumePhase: () => void;
  /** Freeze the countdown, keeping the remaining time. */
  pausePhase: () => void;
  /** Restart the loaded phase from its full duration. */
  restartPhase: () => void;
  /**
   * Complete the loaded phase and load the next one.
   * Returns the transition so the caller can run side effects, or `null` when
   * there was nothing to advance.
   */
  advancePhase: (options?: { skipped?: boolean }) => PhaseTransition | null;
  /** Jump straight to a phase, discarding whatever was loaded. */
  loadPhase: (phase: FocusPhase, options?: { autoStart?: boolean }) => void;
  updateSettings: (patch: Partial<PomodoroSettings>) => void;
  applyPreset: (id: Exclude<PomodoroPresetId, "custom">) => void;
  setSound: (id: AmbientSoundId) => void;
  setVolume: (volume: number) => void;
  /** Drop a session that was persisted across an unreasonably long gap. */
  reconcile: () => void;
  markHydrated: () => void;
}

const STORAGE_KEY = "optsolv-focus-v1";

function createSession(settings: PomodoroSettings, now: number): FocusSession {
  const phaseDurationMs = getPhaseDurationMs("focus", settings);

  return {
    phase: "focus",
    endsAt: now + phaseDurationMs,
    remainingMs: null,
    phaseDurationMs,
    blocksInCycle: 0,
    completedBlocks: 0,
    focusMsCompleted: 0,
    startedAt: now,
    expiredAway: false,
  };
}

/**
 * True when the phase is finished and waiting to be advanced — either it is
 * running and out of time, or it expired while the device was asleep.
 */
export function isPhaseComplete(
  session: FocusSession | null,
  now = Date.now(),
): boolean {
  if (!session) return false;
  if (getRemainingMs(session, now) > 0) return false;
  return isPhaseRunning(session) || session.expiredAway;
}

/** Remaining ms of the loaded phase, whether it is running or paused. */
export function getRemainingMs(
  session: FocusSession,
  now = Date.now(),
): number {
  if (session.remainingMs !== null) return Math.max(0, session.remainingMs);
  if (session.endsAt === null) return 0;
  return session.endsAt - now;
}

/** True when the loaded phase is counting down. */
export function isPhaseRunning(session: FocusSession | null): boolean {
  return !!session && session.remainingMs === null && session.endsAt !== null;
}

/** Ring progress in the 0–1 range. */
export function getPhaseProgress(
  session: FocusSession,
  now = Date.now(),
): number {
  if (session.phaseDurationMs <= 0) return 0;
  const elapsed = session.phaseDurationMs - getRemainingMs(session, now);
  return Math.min(1, Math.max(0, elapsed / session.phaseDurationMs));
}

export const useFocusStore = create<FocusState & FocusActions>()(
  persist(
    (set, get) => ({
      isOpen: false,
      session: null,
      settings: DEFAULT_POMODORO_SETTINGS,
      sound: DEFAULT_AMBIENT_SOUND,
      isHydrated: false,

      open: () => set({ isOpen: true }),
      close: () => set({ isOpen: false }),

      startSession: () =>
        set((state) => ({
          session: createSession(state.settings, Date.now()),
          isOpen: true,
        })),

      endSession: () => set({ session: null }),

      resumePhase: () =>
        set((state) => {
          const { session } = state;
          if (!session || session.remainingMs === null) return state;

          return {
            session: {
              ...session,
              endsAt: Date.now() + session.remainingMs,
              remainingMs: null,
              // The user is back at the keyboard, so the away verdict is spent.
              expiredAway: false,
            },
          };
        }),

      pausePhase: () =>
        set((state) => {
          const { session } = state;
          if (!session || session.remainingMs !== null) return state;

          return {
            session: {
              ...session,
              remainingMs: Math.max(0, getRemainingMs(session)),
              endsAt: null,
            },
          };
        }),

      restartPhase: () =>
        set((state) => {
          const { session } = state;
          if (!session) return state;

          const phaseDurationMs = getPhaseDurationMs(
            session.phase,
            state.settings,
          );

          return {
            session: {
              ...session,
              phaseDurationMs,
              endsAt: Date.now() + phaseDurationMs,
              remainingMs: null,
              expiredAway: false,
            },
          };
        }),

      advancePhase: (options) => {
        const state = get();
        const { session, settings } = state;
        if (!session) return null;

        const now = Date.now();
        const skipped = options?.skipped ?? false;
        const overdueMs = -getRemainingMs(session, now);
        // A long overdue deadline means the tab slept. Load the next phase but
        // leave it paused so the user is not dropped mid-way into a block.
        // `expiredAway` carries that verdict when reconcile() already froze the
        // phase, which discards the original deadline.
        const wasAway =
          !skipped &&
          (session.expiredAway || overdueMs > PHASE_STALE_THRESHOLD_MS);

        const from = session.phase;

        // A skipped focus block is not a completed block, so it counts toward
        // neither the long-break cycle nor the logged focus total.
        const countsAsCompleted = from === "focus" && !skipped;
        const blocksInCycle = countsAsCompleted
          ? session.blocksInCycle + 1
          : session.blocksInCycle;
        const completedBlocks = countsAsCompleted
          ? session.completedBlocks + 1
          : session.completedBlocks;
        const focusMsCompleted = countsAsCompleted
          ? session.focusMsCompleted + session.phaseDurationMs
          : session.focusMsCompleted;

        const to = getNextPhase(from, blocksInCycle, settings);

        const autoStart =
          !wasAway &&
          (to === "focus" ? settings.autoStartFocus : settings.autoStartBreaks);

        const phaseDurationMs = getPhaseDurationMs(to, settings);

        set({
          session: {
            phase: to,
            phaseDurationMs,
            endsAt: autoStart ? now + phaseDurationMs : null,
            remainingMs: autoStart ? null : phaseDurationMs,
            // Leaving a long break opens a fresh cycle.
            blocksInCycle: from === "longBreak" ? 0 : blocksInCycle,
            completedBlocks,
            focusMsCompleted,
            startedAt: session.startedAt,
            expiredAway: false,
          },
        });

        return { from, to, autoStarted: autoStart, wasAway, completedBlocks };
      },

      loadPhase: (phase, options) =>
        set((state) => {
          const now = Date.now();
          const session = state.session ?? createSession(state.settings, now);
          const phaseDurationMs = getPhaseDurationMs(phase, state.settings);
          const autoStart = options?.autoStart ?? false;

          return {
            session: {
              ...session,
              phase,
              phaseDurationMs,
              endsAt: autoStart ? now + phaseDurationMs : null,
              remainingMs: autoStart ? null : phaseDurationMs,
              expiredAway: false,
            },
          };
        }),

      updateSettings: (patch) =>
        set((state) => {
          const settings = { ...state.settings, ...patch };
          const { session } = state;

          // Retiming the loaded phase mid-flight would be disorienting, so a
          // duration change only takes effect on a phase that has not started.
          if (!session || isPhaseRunning(session)) return { settings };

          const phaseDurationMs = getPhaseDurationMs(session.phase, settings);
          const untouched = session.remainingMs === session.phaseDurationMs;

          return {
            settings,
            session: {
              ...session,
              phaseDurationMs,
              remainingMs: untouched
                ? phaseDurationMs
                : Math.min(
                    session.remainingMs ?? phaseDurationMs,
                    phaseDurationMs,
                  ),
            },
          };
        }),

      applyPreset: (id) => {
        const preset = POMODORO_PRESETS.find((item) => item.id === id);
        if (!preset) return;

        get().updateSettings({
          focusMinutes: preset.focusMinutes,
          shortBreakMinutes: preset.shortBreakMinutes,
          longBreakMinutes: preset.longBreakMinutes,
          blocksBeforeLongBreak: preset.blocksBeforeLongBreak,
        });
      },

      setSound: (id) => set((state) => ({ sound: { ...state.sound, id } })),

      setVolume: (volume) =>
        set((state) => ({
          sound: {
            ...state.sound,
            volume: Math.min(1, Math.max(0, volume)),
          },
        })),

      reconcile: () =>
        set((state) => {
          const { session } = state;
          if (!session) return state;

          const overdueMs = -getRemainingMs(session);

          // Left running overnight: the numbers would be fiction, so drop it.
          if (overdueMs > SESSION_ABANDON_THRESHOLD_MS) {
            return { session: null, isOpen: false };
          }

          // Came back to an expired phase: freeze it, and remember *why*, so the
          // engine resolves the transition deliberately instead of racing the
          // first tick and treating the gap as a normal hand-off.
          if (overdueMs > PHASE_STALE_THRESHOLD_MS && isPhaseRunning(session)) {
            return {
              session: {
                ...session,
                remainingMs: 0,
                endsAt: null,
                expiredAway: true,
              },
            };
          }

          return state;
        }),

      markHydrated: () => set({ isHydrated: true }),
    }),
    {
      name: STORAGE_KEY,
      // Only durable concerns are persisted: `isOpen` is deliberately excluded
      // so a reload never reopens the overlay behind the user's back.
      partialize: (state) => ({
        session: state.session,
        settings: state.settings,
        sound: state.sound,
      }),
      // Matches ui.store.ts: persisted values differ from the SSR defaults,
      // which would shift React's useId() counter and break Radix IDs.
      // rehydrate() runs from a useEffect after hydration completes.
      skipHydration: true,
      merge: (persisted, current) => {
        const incoming = (persisted ?? {}) as Partial<FocusState>;

        return {
          ...current,
          ...incoming,
          // Guard against a partial or hand-edited payload.
          settings: { ...DEFAULT_POMODORO_SETTINGS, ...incoming.settings },
          sound: { ...DEFAULT_AMBIENT_SOUND, ...incoming.sound },
          isOpen: false,
        };
      },
    },
  ),
);
