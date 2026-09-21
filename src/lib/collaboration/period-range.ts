/**
 * Validation shared by every Meu Tempo endpoint.
 *
 * The three routes read the same window and must agree on what a legal window
 * is — a mismatch would let the timeline show days the chart refuses to load.
 */

import { MAX_PERIOD_DAYS } from "@/lib/collaboration/period";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Meu Tempo is a retrospective; a year back is already more than anyone reads. */
const MAX_PAST_DAYS = 365;

export interface ParsedRange {
  from: string;
  to: string;
}

export type RangeParseResult =
  | { ok: true; range: ParsedRange }
  | { ok: false; error: string };

/**
 * Reads `from`/`to` from a query string, defaulting to the current week.
 *
 * A future `to` is clamped to today rather than rejected: the natural way to
 * look at "this week" on a Wednesday is to ask for Monday through Sunday.
 */
export function parsePeriodRange(
  searchParams: URLSearchParams,
): RangeParseResult {
  const today = todayInAppTimeZone();
  const from = searchParams.get("from") ?? shiftDay(today, -6);
  const requestedTo = searchParams.get("to") ?? today;

  return validatePeriodRange(from, requestedTo);
}

export function validatePeriodRange(
  from: string,
  requestedTo: string,
): RangeParseResult {
  if (!DATE_PATTERN.test(from) || !DATE_PATTERN.test(requestedTo)) {
    return {
      ok: false,
      error: "Parâmetros 'from' e 'to' devem estar no formato YYYY-MM-DD.",
    };
  }

  const today = todayInAppTimeZone();
  const to = requestedTo > today ? today : requestedTo;

  if (from > to) {
    return { ok: false, error: "O início do período é posterior ao fim." };
  }

  if (from < shiftDay(today, -MAX_PAST_DAYS)) {
    return {
      ok: false,
      error: `Só é possível analisar os últimos ${MAX_PAST_DAYS} dias.`,
    };
  }

  const spanDays =
    Math.round(
      (new Date(`${to}T00:00:00Z`).getTime() -
        new Date(`${from}T00:00:00Z`).getTime()) /
        86_400_000,
    ) + 1;

  if (spanDays > MAX_PERIOD_DAYS) {
    return {
      ok: false,
      error: `O período não pode passar de ${MAX_PERIOD_DAYS} dias.`,
    };
  }

  return { ok: true, range: { from, to } };
}
