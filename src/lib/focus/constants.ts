import type {
  AmbientSoundOption,
  AmbientSoundSettings,
  FocusPhase,
  FocusPhaseMeta,
  PomodoroPreset,
  PomodoroSettings,
} from "@/lib/focus/types";

/** Bounds for the custom duration inputs, in minutes. */
export const FOCUS_MINUTES_MIN = 5;
export const FOCUS_MINUTES_MAX = 120;
export const BREAK_MINUTES_MIN = 1;
export const BREAK_MINUTES_MAX = 45;
export const BLOCKS_BEFORE_LONG_BREAK_MIN = 2;
export const BLOCKS_BEFORE_LONG_BREAK_MAX = 8;

/**
 * How late a phase deadline may be before we assume the device was asleep or
 * the tab was throttled hard. Background tabs are commonly throttled to one
 * timer callback per minute, so a couple of minutes of lateness is normal.
 */
export const PHASE_STALE_THRESHOLD_MS = 5 * 60_000;

/** Beyond this, a persisted session is discarded instead of resumed. */
export const SESSION_ABANDON_THRESHOLD_MS = 4 * 60 * 60_000;

/** Engine tick — fast enough for a smooth ring, cheap enough to ignore. */
export const FOCUS_TICK_MS = 250;

export const DEFAULT_POMODORO_SETTINGS: PomodoroSettings = {
  focusMinutes: 25,
  shortBreakMinutes: 5,
  longBreakMinutes: 15,
  blocksBeforeLongBreak: 4,
  autoStartBreaks: true,
  autoStartFocus: false,
  pauseTimerOnBreak: true,
  chimeEnabled: true,
  notificationsEnabled: false,
  keepScreenAwake: true,
};

export const DEFAULT_AMBIENT_SOUND: AmbientSoundSettings = {
  id: "none",
  volume: 0.35,
};

export const POMODORO_PRESETS: readonly PomodoroPreset[] = [
  {
    id: "classic",
    label: "Clássico",
    description: "25 / 5 · o Pomodoro original",
    focusMinutes: 25,
    shortBreakMinutes: 5,
    longBreakMinutes: 15,
    blocksBeforeLongBreak: 4,
  },
  {
    id: "deep",
    label: "Profundo",
    description: "50 / 10 · tarefas complexas",
    focusMinutes: 50,
    shortBreakMinutes: 10,
    longBreakMinutes: 20,
    blocksBeforeLongBreak: 3,
  },
  {
    id: "sprint",
    label: "Sprint",
    description: "15 / 3 · vencer a procrastinação",
    focusMinutes: 15,
    shortBreakMinutes: 3,
    longBreakMinutes: 12,
    blocksBeforeLongBreak: 4,
  },
] as const;

export const PHASE_META: Record<FocusPhase, FocusPhaseMeta> = {
  focus: {
    label: "Foco",
    shortLabel: "Foco",
    hint: "Uma tarefa só. Notificações podem esperar.",
    textClass: "text-brand-400",
    gradientFrom: "#fb923c",
    gradientTo: "#ea580c",
    auraRgb: "249, 115, 22",
  },
  shortBreak: {
    label: "Pausa curta",
    shortLabel: "Pausa",
    hint: "Levante, respire, olhe para longe.",
    textClass: "text-info",
    gradientFrom: "#60a5fa",
    gradientTo: "#3b82f6",
    auraRgb: "59, 130, 246",
  },
  longBreak: {
    label: "Pausa longa",
    shortLabel: "Pausa longa",
    hint: "Você fechou um ciclo. Desconecte de verdade.",
    textClass: "text-success",
    gradientFrom: "#4ade80",
    gradientTo: "#22c55e",
    auraRgb: "34, 197, 94",
  },
};

export const AMBIENT_SOUNDS: readonly AmbientSoundOption[] = [
  {
    id: "none",
    label: "Silêncio",
    description: "Sem som ambiente",
  },
  {
    id: "brown",
    label: "Ruído marrom",
    description: "Graves profundos — mascara conversas",
  },
  {
    id: "pink",
    label: "Ruído rosa",
    description: "Equilibrado — o mais neutro para leitura",
  },
  {
    id: "white",
    label: "Ruído branco",
    description: "Agudo e constante — mascara cliques",
  },
  {
    id: "rain",
    label: "Chuva",
    description: "Chuva contínua com ondas suaves",
  },
] as const;

/** Volume multiplier applied to the ambient bed during breaks. */
export const BREAK_VOLUME_DUCK = 0.45;

/** Returns the configured duration of a phase, in milliseconds. */
export function getPhaseDurationMs(
  phase: FocusPhase,
  settings: PomodoroSettings,
): number {
  switch (phase) {
    case "focus":
      return settings.focusMinutes * 60_000;
    case "shortBreak":
      return settings.shortBreakMinutes * 60_000;
    case "longBreak":
      return settings.longBreakMinutes * 60_000;
  }
}

/** True when the phase is one of the two break kinds. */
export function isBreakPhase(phase: FocusPhase): boolean {
  return phase !== "focus";
}

/**
 * Given the phase that just finished, decide what comes next.
 * A focus block leads to a long break once `blocksBeforeLongBreak` blocks have
 * been *completed* in the current cycle — skipped blocks do not count, so
 * `blocksInCycleAfter` must already reflect this transition.
 */
export function getNextPhase(
  current: FocusPhase,
  blocksInCycleAfter: number,
  settings: PomodoroSettings,
): FocusPhase {
  if (current !== "focus") return "focus";
  return blocksInCycleAfter >= settings.blocksBeforeLongBreak
    ? "longBreak"
    : "shortBreak";
}

/**
 * Format milliseconds as a Pomodoro countdown.
 * Stays in MM:SS until an hour is needed, so the digits do not jump around.
 * @example formatCountdown(1_500_000) => "25:00"
 * @example formatCountdown(3_600_000) => "1:00:00"
 */
export function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (value: number) => value.toString().padStart(2, "0");

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  return `${pad(minutes)}:${pad(seconds)}`;
}

/** Clamp a number into an inclusive integer range. */
export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Detect which preset a settings object matches, if any. */
export function detectPresetId(settings: PomodoroSettings) {
  const match = POMODORO_PRESETS.find(
    (preset) =>
      preset.focusMinutes === settings.focusMinutes &&
      preset.shortBreakMinutes === settings.shortBreakMinutes &&
      preset.longBreakMinutes === settings.longBreakMinutes &&
      preset.blocksBeforeLongBreak === settings.blocksBeforeLongBreak,
  );

  return match?.id ?? ("custom" as const);
}
