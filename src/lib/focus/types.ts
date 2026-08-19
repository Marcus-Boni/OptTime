/**
 * Domain types for the Focus Mode (Pomodoro + ambient sound) feature.
 *
 * Focus Mode is a purely client-side layer on top of the server-authoritative
 * timer (`active_timer`). The Pomodoro cycle has no server representation: it
 * only *drives* the real timer by pausing it during breaks and resuming it when
 * a new focus block starts.
 */

/** The three phases of a Pomodoro cycle. */
export type FocusPhase = "focus" | "shortBreak" | "longBreak";

/** Identifier of an ambient soundscape. `none` means silence. */
export type AmbientSoundId = "none" | "brown" | "pink" | "white" | "rain";

/** Identifier of a duration preset, or `custom` when the user tuned it. */
export type PomodoroPresetId = "classic" | "deep" | "sprint" | "custom";

/** Which chime to play on a phase transition. */
export type ChimeKind = "focusStart" | "breakStart" | "sessionEnd";

/** User-tunable Pomodoro configuration. */
export interface PomodoroSettings {
  /** Length of a focus block, in minutes. */
  focusMinutes: number;
  /** Length of a short break, in minutes. */
  shortBreakMinutes: number;
  /** Length of a long break, in minutes. */
  longBreakMinutes: number;
  /** Focus blocks completed before a long break is offered. */
  blocksBeforeLongBreak: number;
  /** Start breaks automatically when a focus block ends. */
  autoStartBreaks: boolean;
  /** Start the next focus block automatically when a break ends. */
  autoStartFocus: boolean;
  /**
   * Pause the real (billable) timer during breaks and resume it on focus.
   * This is what makes the tracked duration follow the focus blocks.
   */
  pauseTimerOnBreak: boolean;
  /** Play a chime on every phase transition. */
  chimeEnabled: boolean;
  /** Send a browser notification when the tab is in the background. */
  notificationsEnabled: boolean;
  /** Keep the screen awake while Focus Mode is open. */
  keepScreenAwake: boolean;
}

/** Ambient soundscape selection and level. */
export interface AmbientSoundSettings {
  id: AmbientSoundId;
  /** Volume in the 0–1 range. */
  volume: number;
}

/** Runtime state of an in-flight Pomodoro session. */
export interface FocusSession {
  /** Phase currently loaded (running or awaiting start). */
  phase: FocusPhase;
  /** Epoch ms when the current phase ends. `null` while the phase is paused. */
  endsAt: number | null;
  /** Remaining ms captured at pause time. `null` while the phase is running. */
  remainingMs: number | null;
  /** Full length of the loaded phase in ms — the denominator for the ring. */
  phaseDurationMs: number;
  /** Focus blocks completed since the long-break counter last reset. */
  blocksInCycle: number;
  /** Focus blocks completed since the session started. */
  completedBlocks: number;
  /** Focus ms accumulated across all *completed* focus blocks. */
  focusMsCompleted: number;
  /** Epoch ms when the session was created. */
  startedAt: number;
  /**
   * Set when the phase ran out while the device slept or the tab was frozen.
   * Freezing the phase loses the original deadline, so the fact that the user
   * was away is recorded here for the engine to act on when it comes back.
   */
  expiredAway: boolean;
}

/** Presentation metadata for a phase. */
export interface FocusPhaseMeta {
  label: string;
  shortLabel: string;
  /** One-line hint shown under the countdown. */
  hint: string;
  /** Tailwind text color class for the phase accent. */
  textClass: string;
  /** Hex values driving the SVG ring gradient. */
  gradientFrom: string;
  gradientTo: string;
  /** `rgb()` triplet used for the ambient aura glow. */
  auraRgb: string;
}

/** A named set of durations the user can apply with one click. */
export interface PomodoroPreset {
  id: Exclude<PomodoroPresetId, "custom">;
  label: string;
  description: string;
  focusMinutes: number;
  shortBreakMinutes: number;
  longBreakMinutes: number;
  blocksBeforeLongBreak: number;
}

/** Catalogue entry for an ambient soundscape. */
export interface AmbientSoundOption {
  id: AmbientSoundId;
  label: string;
  description: string;
}
