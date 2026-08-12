/**
 * Natural-language duration parsing for TimeBot.
 * Accepts the formats the product documents plus the shapes an LLM tends to
 * emit: "2h30", "2:30", "2,5h", "150m", "1h", "90 minutos", "2 horas e meia".
 */

const WORD_NUMBERS: Record<string, number> = {
  meia: 0.5,
  meio: 0.5,
  uma: 1,
  um: 1,
  duas: 2,
  dois: 2,
  tres: 3,
  três: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
};

const MIN_MINUTES = 1;
const MAX_MINUTES = 1440;

function clamp(minutes: number): number {
  return Math.max(MIN_MINUTES, Math.min(MAX_MINUTES, Math.round(minutes)));
}

/**
 * Parses a free-form duration into minutes.
 * Returns null when nothing recognisable is present.
 */
export function parseDurationText(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return null;

  // "2:30" / "02:30"
  const clockMatch = text.match(/(?:^|\s)(\d{1,2}):([0-5]\d)(?:\s|$)/);
  if (clockMatch) {
    return clamp(Number(clockMatch[1]) * 60 + Number(clockMatch[2]));
  }

  // "2h30", "2 h 30", "2h30min"
  const combinedMatch = text.match(
    /(\d{1,2})\s*h(?:oras?)?\s*(\d{1,2})\s*(?:m|min|minutos?)?/,
  );
  if (combinedMatch?.[2]) {
    const minutes = Number(combinedMatch[2]);
    if (minutes < 60) {
      return clamp(Number(combinedMatch[1]) * 60 + minutes);
    }
  }

  // "2 horas e meia"
  const halfMatch = text.match(/(\d{1,2}|\w+)\s*h(?:oras?)?\s*e\s*meia/);
  if (halfMatch?.[1]) {
    const base = Number(halfMatch[1]) || WORD_NUMBERS[halfMatch[1]];
    if (base) return clamp(base * 60 + 30);
  }

  // "2,5h", "2.5 horas", "3h"
  const hourMatch = text.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*h(?:oras?)?\b/);
  if (hourMatch?.[1]) {
    return clamp(Number(hourMatch[1].replace(",", ".")) * 60);
  }

  // "45m", "90 minutos"
  const minuteMatch = text.match(/(\d{1,4})\s*(?:m|min|minutos?)\b/);
  if (minuteMatch?.[1]) {
    return clamp(Number(minuteMatch[1]));
  }

  // "duas horas"
  const wordMatch = text.match(/\b([a-záéíóúê]+)\s+h(?:oras?)\b/);
  if (wordMatch?.[1] && WORD_NUMBERS[wordMatch[1]]) {
    return clamp(WORD_NUMBERS[wordMatch[1]] * 60);
  }

  // Bare number treated as hours when small, minutes when large.
  const bareMatch = text.match(/^(\d{1,3}(?:[.,]\d{1,2})?)$/);
  if (bareMatch?.[1]) {
    const value = Number(bareMatch[1].replace(",", "."));
    return clamp(value <= 12 ? value * 60 : value);
  }

  return null;
}

/** Normalises a duration coming from the model, in minutes or as free text. */
export function resolveDurationMinutes(
  durationMinutes: number | undefined,
  durationText: string | undefined,
  fallback: number,
): number {
  if (typeof durationMinutes === "number" && Number.isFinite(durationMinutes)) {
    return clamp(durationMinutes);
  }

  if (durationText) {
    const parsed = parseDurationText(durationText);
    if (parsed !== null) return parsed;
  }

  return clamp(fallback);
}
