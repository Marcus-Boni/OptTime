/**
 * Duration parsing and formatting.
 *
 * Developers type durations the way they say them out loud — "2h30", "150m",
 * "1,5", ":45". Rejecting any of those turns a five-second log into a detour,
 * so the parser accepts every form the product spec lists plus the obvious
 * neighbours, and the formatter always speaks back in the canonical shape.
 */

/** The whole product range: one minute to a full day. */
export const MIN_DURATION_MINUTES = 1;
export const MAX_DURATION_MINUTES = 24 * 60;

export type ParseResult =
  | { ok: true; minutes: number }
  | { ok: false; reason: string };

const PATTERNS: Array<{
  regex: RegExp;
  toMinutes: (groups: Record<string, string | undefined>) => number;
}> = [
  // "2h30", "2 h 30", "2h30m", "2h"
  {
    regex: /^(?<h>\d{1,2})\s*h\s*(?<m>\d{1,2})?\s*m?$/i,
    toMinutes: (g) => Number(g.h) * 60 + Number(g.m ?? 0),
  },
  // "90m", "90 min", "90 minutos"
  {
    regex: /^(?<m>\d{1,4})\s*m(?:in(?:uto)?s?)?$/i,
    toMinutes: (g) => Number(g.m),
  },
  // "2:30", ":45"
  {
    regex: /^(?<h>\d{0,2}):(?<m>\d{1,2})$/,
    toMinutes: (g) => Number(g.h || 0) * 60 + Number(g.m),
  },
  // "2.5h", "1,5 hora", "3 horas"
  {
    regex: /^(?<h>\d{1,2}(?:[.,]\d{1,2})?)\s*h(?:ora)?s?$/i,
    toMinutes: (g) => Math.round(Number((g.h ?? "0").replace(",", ".")) * 60),
  },
  // "2.5", "2,5", "2" — a bare number is hours, matching the web form
  {
    regex: /^(?<h>\d{1,2}(?:[.,]\d{1,2})?)$/,
    toMinutes: (g) => Math.round(Number((g.h ?? "0").replace(",", ".")) * 60),
  },
];

/**
 * Parses a human duration into whole minutes.
 *
 * Returns a reason instead of throwing: every caller is a text input that wants
 * to show the message inline while the user keeps typing.
 */
export function parseDuration(raw: string): ParseResult {
  const input = raw.trim();

  if (!input) {
    return { ok: false, reason: "Informe a duração — ex.: 2h30, 150m ou 2,5." };
  }

  for (const { regex, toMinutes } of PATTERNS) {
    const match = input.match(regex);
    if (!match?.groups) continue;

    const minutes = toMinutes(match.groups);
    if (!Number.isFinite(minutes)) continue;

    if (minutes < MIN_DURATION_MINUTES) {
      return { ok: false, reason: "A duração mínima é de 1 minuto." };
    }
    if (minutes > MAX_DURATION_MINUTES) {
      return { ok: false, reason: "A duração máxima é de 24 horas." };
    }
    return { ok: true, minutes };
  }

  return {
    ok: false,
    reason: `Não entendi "${input}". Use 2h30, 150m, 2,5 ou 2:30.`,
  };
}

/** Compact label used in lists and the status bar: `7h30`, `45m`, `2h`. */
export function formatMinutes(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const minutes = safe % 60;

  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h${String(minutes).padStart(2, "0")}`;
}

/** Running clock for the status bar: `1:23:45`, or `12:07` under an hour. */
export function formatStopwatch(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/**
 * A text progress bar for Markdown tooltips.
 *
 * `MarkdownString` cannot render an HTML meter and codicons do not stack into a
 * bar, so block characters are the only way to show the day at a glance.
 */
export function progressBar(
  current: number,
  total: number,
  width = 12,
): string {
  if (total <= 0) return "─".repeat(width);
  const ratio = Math.max(0, Math.min(1, current / total));
  const filled = Math.round(ratio * width);
  return "█".repeat(filled) + "░".repeat(width - filled);
}
