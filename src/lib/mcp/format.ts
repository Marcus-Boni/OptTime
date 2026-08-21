import { isValid, parse } from "date-fns";
import {
  shiftDay,
  todayInAppTimeZone,
  todayInAppTimeZoneAsDate,
} from "@/lib/timezone";
import { getWeekPeriod, parseLocalDate } from "@/lib/utils";
import { AgentError } from "./errors";

/**
 * Input coercion for agent-supplied values.
 *
 * Models write what a human would say — "2h30", "ontem", "semana passada" — so
 * the boundary is deliberately forgiving. Everything below normalises to the
 * canonical shapes the rest of the app already uses: minutes as integers,
 * dates as `YYYY-MM-DD`, periods as `YYYY-Wnn`.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const ISO_WEEK = /^(\d{4})-W(\d{1,2})$/i;

/** Minutes in a day — the hard ceiling for a single entry. */
export const MAX_ENTRY_MINUTES = 1440;

/**
 * Parses a duration expressed as minutes, decimal hours or natural text.
 *
 * Accepts: `150`, `"150"`, `"2h30"`, `"2h 30m"`, `"2.5h"`, `"2:30"`, `"90m"`,
 * `"1,5h"`. A bare number is always treated as minutes — that is what the tool
 * schema documents, and guessing hours for small values silently corrupts data.
 */
export function parseDurationMinutes(input: unknown): number {
  if (typeof input === "number") {
    return assertMinuteRange(Math.round(input));
  }

  if (typeof input !== "string") {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Duração inválida. Informe os minutos (ex.: 150) ou um texto como '2h30'.",
    );
  }

  const raw = input.trim().toLowerCase().replace(",", ".");
  if (!raw) {
    throw new AgentError("VALIDATION_ERROR", "Duração é obrigatória.");
  }

  // "2:30" → 2h30
  const clock = raw.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) {
    return assertMinuteRange(Number(clock[1]) * 60 + Number(clock[2]));
  }

  // "2h30", "2h 30m", "2h"
  const hoursAndMinutes = raw.match(
    /^(\d+(?:\.\d+)?)\s*h(?:oras?)?\s*(\d{1,2})?\s*m?(?:in(?:utos?)?)?$/,
  );
  if (hoursAndMinutes) {
    const hours = Number(hoursAndMinutes[1]);
    const minutes = hoursAndMinutes[2] ? Number(hoursAndMinutes[2]) : 0;
    return assertMinuteRange(Math.round(hours * 60 + minutes));
  }

  // "90m", "90 min", "90 minutos"
  const minutesOnly = raw.match(/^(\d+(?:\.\d+)?)\s*m(?:in(?:utos?)?)?$/);
  if (minutesOnly) {
    return assertMinuteRange(Math.round(Number(minutesOnly[1])));
  }

  // Bare number → minutes.
  const bare = raw.match(/^\d+(?:\.\d+)?$/);
  if (bare) {
    return assertMinuteRange(Math.round(Number(raw)));
  }

  throw new AgentError(
    "VALIDATION_ERROR",
    `Não consegui interpretar a duração "${input}". Use minutos (150) ou formatos como '2h30', '2.5h' ou '90m'.`,
  );
}

function assertMinuteRange(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes < 1) {
    throw new AgentError("VALIDATION_ERROR", "Duração mínima de 1 minuto.");
  }
  if (minutes > MAX_ENTRY_MINUTES) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Duração máxima de 24 horas (1440 minutos) por lançamento.",
    );
  }
  return minutes;
}

const RELATIVE_DATES: Record<string, number> = {
  hoje: 0,
  today: 0,
  ontem: -1,
  yesterday: -1,
  anteontem: -2,
  "dia anterior": -1,
};

/**
 * Resolves an agent-supplied date into `YYYY-MM-DD`, defaulting to today.
 *
 * Future dates are rejected and anything older than 30 days is rejected, both
 * matching the product rules for manual entries.
 */
export function resolveEntryDate(
  input: unknown,
  options?: { allowFuture?: boolean; maxPastDays?: number },
): string {
  const today = todayInAppTimeZone();
  if (input == null || input === "") return today;

  if (typeof input !== "string") {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Data inválida. Use o formato YYYY-MM-DD.",
    );
  }

  const raw = input.trim().toLowerCase();
  const relative = RELATIVE_DATES[raw];
  const resolved = relative !== undefined ? shiftDay(today, relative) : raw;

  if (!ISO_DATE.test(resolved)) {
    throw new AgentError(
      "VALIDATION_ERROR",
      `Data "${input}" inválida. Use o formato YYYY-MM-DD (ex.: ${today}).`,
    );
  }

  const parsed = parse(resolved, "yyyy-MM-dd", new Date());
  if (!isValid(parsed)) {
    throw new AgentError(
      "VALIDATION_ERROR",
      `Data "${input}" não existe no calendário.`,
    );
  }

  if (!options?.allowFuture && resolved > today) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Não é possível registrar horas em datas futuras.",
    );
  }

  const maxPastDays = options?.maxPastDays ?? 30;
  const floor = shiftDay(today, -maxPastDays);
  if (resolved < floor) {
    throw new AgentError(
      "VALIDATION_ERROR",
      `Só é possível registrar horas nos últimos ${maxPastDays} dias (a partir de ${floor}).`,
    );
  }

  return resolved;
}

/** Resolves a date used only for reading — no past/future guard rails. */
export function resolveLookupDate(input: unknown): string {
  if (input == null || input === "") return todayInAppTimeZone();
  return resolveEntryDate(input, { allowFuture: true, maxPastDays: 3650 });
}

const RELATIVE_PERIODS: Record<string, number> = {
  atual: 0,
  current: 0,
  "esta semana": 0,
  "semana atual": 0,
  anterior: -1,
  previous: -1,
  last: -1,
  "semana passada": -1,
  "semana anterior": -1,
};

/**
 * Resolves a period reference into the canonical `YYYY-Wnn` identifier.
 *
 * Accepts an ISO week (`2026-W33`), a plain date inside the week
 * (`2026-08-19`), a relative keyword (`atual`, `semana passada`) or nothing,
 * which means the current week.
 */
export function resolveWeekPeriod(input: unknown): string {
  if (input == null || input === "")
    return getWeekPeriod(todayInAppTimeZoneAsDate());

  if (typeof input !== "string") {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Período inválido. Use o formato YYYY-Wnn (ex.: 2026-W33).",
    );
  }

  const raw = input.trim();
  const relative = RELATIVE_PERIODS[raw.toLowerCase()];
  if (relative !== undefined) {
    return getWeekPeriod(
      parseLocalDate(shiftDay(todayInAppTimeZone(), relative * 7)),
    );
  }

  const week = raw.match(ISO_WEEK);
  if (week) {
    const year = Number(week[1]);
    const weekNumber = Number(week[2]);
    if (weekNumber < 1 || weekNumber > 53) {
      throw new AgentError(
        "VALIDATION_ERROR",
        `Semana ${weekNumber} não existe. Use um valor entre 1 e 53.`,
      );
    }
    return `${year}-W${String(weekNumber).padStart(2, "0")}`;
  }

  if (ISO_DATE.test(raw)) {
    return getWeekPeriod(parseLocalDate(raw));
  }

  throw new AgentError(
    "VALIDATION_ERROR",
    `Período "${input}" inválido. Use YYYY-Wnn (ex.: 2026-W33), uma data YYYY-MM-DD ou "atual".`,
  );
}

/** `150` → `"2h30"`. Compact on purpose: agents echo this straight to users. */
export function humanizeMinutes(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;

  if (hours === 0) return `${rest}min`;
  if (rest === 0) return `${hours}h`;
  return `${hours}h${String(rest).padStart(2, "0")}`;
}

/** `150` → `2.5`, the decimal form Azure DevOps expects for Completed Work. */
export function toDecimalHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

const WEEKDAY_LABELS = [
  "domingo",
  "segunda",
  "terça",
  "quarta",
  "quinta",
  "sexta",
  "sábado",
] as const;

export function weekdayLabel(date: string): string {
  return WEEKDAY_LABELS[parseLocalDate(date).getDay()] ?? "";
}
