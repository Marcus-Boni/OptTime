/**
 * The windows Meu Tempo offers, as pure date arithmetic.
 *
 * Kept out of the hook so the verify script can drive the same functions the
 * picker does — a preset that silently returns the wrong week would corrupt
 * every number on the page without failing a single type check.
 */

import { shiftDay } from "@/lib/timezone";
import { parseLocalDate } from "@/lib/utils";

export type PeriodPreset =
  | "this-week"
  | "last-week"
  | "this-month"
  | "last-month"
  | "last-30";

export interface PeriodRange {
  from: string;
  to: string;
}

const PRESET_LABELS: Record<PeriodPreset, string> = {
  "this-week": "Esta semana",
  "last-week": "Semana passada",
  "this-month": "Este mês",
  "last-month": "Mês passado",
  "last-30": "Últimos 30 dias",
};

export const PERIOD_PRESETS = Object.entries(PRESET_LABELS).map(
  ([value, label]) => ({ value: value as PeriodPreset, label }),
);

/** Monday of the week containing `date`, matching how timesheets are closed. */
export function startOfWeek(date: string): string {
  // getDay(): 0 = Sunday. In a Monday-based week Sunday sits six days after it.
  const offset = (parseLocalDate(date).getDay() + 6) % 7;
  return shiftDay(date, -offset);
}

export function startOfMonth(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: string): string {
  const [year, month] = date.split("-").map(Number);
  const last = new Date(Date.UTC(year ?? 1970, month ?? 1, 0)).getUTCDate();
  return `${date.slice(0, 7)}-${String(last).padStart(2, "0")}`;
}

/**
 * Turns a preset into a concrete window.
 *
 * `today` is a parameter rather than a clock read so the page, the picker and
 * the verify script all agree on what "esta semana" means.
 */
export function resolvePeriodRange(
  preset: PeriodPreset,
  today: string,
): PeriodRange {
  switch (preset) {
    case "this-week": {
      const from = startOfWeek(today);
      return { from, to: shiftDay(from, 6) };
    }
    case "last-week": {
      const from = shiftDay(startOfWeek(today), -7);
      return { from, to: shiftDay(from, 6) };
    }
    case "this-month":
      return { from: startOfMonth(today), to: endOfMonth(today) };
    case "last-month": {
      const anchor = shiftDay(startOfMonth(today), -1);
      return { from: startOfMonth(anchor), to: endOfMonth(anchor) };
    }
    case "last-30":
      return { from: shiftDay(today, -29), to: today };
  }
}

/** Slides a window one step back or forward, keeping its length. */
export function shiftRange(range: PeriodRange, direction: -1 | 1): PeriodRange {
  const span =
    Math.round(
      (parseLocalDate(range.to).getTime() -
        parseLocalDate(range.from).getTime()) /
        86_400_000,
    ) + 1;

  return {
    from: shiftDay(range.from, direction * span),
    to: shiftDay(range.to, direction * span),
  };
}
