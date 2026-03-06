import { type ClassValue, clsx } from "clsx";
import {
  addDays,
  endOfISOWeek,
  endOfMonth,
  format,
  formatDistanceToNow,
  isToday,
  isYesterday,
  parse,
  startOfISOWeek,
  startOfMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { twMerge } from "tailwind-merge";

/** Merge Tailwind classes with conflict resolution */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format minutes into a human-readable duration string.
 * @example formatDuration(90) => "1h 30min"
 * @example formatDuration(45) => "45min"
 * @example formatDuration(480) => "8h"
 */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0min";

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}min`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}min`;
}

/**
 * Format minutes into decimal hours string.
 * @example formatDecimalHours(90) => "1.5h"
 * @example formatDecimalHours(15) => "0.25h"
 */
export function formatDecimalHours(minutes: number): string {
  const hours = minutes / 60;
  return `${Number(hours.toFixed(2))}h`;
}

/**
 * Format milliseconds into HH:MM:SS for timer display.
 * @example formatTimerDisplay(3661000) => "01:01:01"
 */
export function formatTimerDisplay(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds]
    .map((v) => v.toString().padStart(2, "0"))
    .join(":");
}

/**
 * Safe local parse for YYYY-MM-DD string to local Date object (avoids UTC offset issue).
 * @example parseLocalDate("2025-03-01") => Date(2025, 2, 1) // March 1st local
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a date into a human-friendly label.
 * @example formatDateLabel("2025-03-01") => "Hoje"
 * @example formatDateLabel("2025-02-28") => "Ontem"
 * @example formatDateLabel("2025-02-20") => "20 de fevereiro"
 */
export function formatDateLabel(dateStr: string): string {
  const date = parseLocalDate(dateStr);
  if (isToday(date)) return "Hoje";
  if (isYesterday(date)) return "Ontem";
  return format(date, "d 'de' MMMM", { locale: ptBR });
}

/**
 * Format a date for display in the UI.
 * @example formatDate(new Date()) => "01 mar 2025"
 */
export function formatDate(date: Date | string): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return format(d, "dd MMM yyyy", { locale: ptBR });
}

/**
 * Get relative time from now.
 * @example getRelativeTime(new Date()) => "há poucos segundos"
 */
export function getRelativeTime(date: Date | string): string {
  const d = typeof date === "string" ? parseLocalDate(date) : date;
  return formatDistanceToNow(d, { addSuffix: true, locale: ptBR });
}

/**
 * Generate initials from a display name.
 * @example getInitials("Marcus Galvão") => "MG"
 */
export function getInitials(name?: string | null): string {
  if (!name || typeof name !== "string") return "U";
  return name
    .split(" ")
    .filter(Boolean)
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Resolve a user's profile image source.
 *
 * Microsoft OAuth can return the profile photo as a base64 data URI
 * (e.g. "data:image/jpeg;base64,..."). next/image does NOT support data URIs,
 * so callers must check `isBase64Image()` and render a plain <img> instead.
 *
 * Returns `null` when no image is available so the caller can show initials.
 */
export function resolveUserImage(
  image: string | null | undefined,
): string | null {
  if (!image || image.trim() === "") return null;
  return image.trim();
}

/**
 * Returns true when the image string is a base64 data URI.
 * In this case, use a native <img> element — not next/image.
 *
 * @example isBase64Image("data:image/jpeg;base64,/9j/...") // true
 * @example isBase64Image("https://graph.microsoft.com/...") // false
 */
export function isBase64Image(src: string | null | undefined): boolean {
  return typeof src === "string" && src.startsWith("data:");
}

/**
 * Get a tailwind-friendly color for project status badges.
 */
export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    draft: "bg-muted text-muted-foreground",
    submitted: "bg-blue-500/10 text-blue-400",
    approved: "bg-green-500/10 text-green-400",
    rejected: "bg-red-500/10 text-red-400",
    active: "bg-green-500/10 text-green-400",
    archived: "bg-muted text-muted-foreground",
    completed: "bg-blue-500/10 text-blue-400",
    open: "bg-yellow-500/10 text-yellow-400",
  };
  return colors[status] ?? "bg-muted text-muted-foreground";
}

/**
 * Convert a period string into a date range (ISO strings).
 * @example getPeriodRange("2026-W10", "weekly") => { start: "2026-03-02", end: "2026-03-08" }
 * @example getPeriodRange("2026-03", "monthly") => { start: "2026-03-01", end: "2026-03-31" }
 */
export function getPeriodRange(
  period: string,
  type: string,
): { start: string; end: string } {
  if (type === "monthly") {
    const date = parse(period, "yyyy-MM", new Date());
    return {
      start: format(startOfMonth(date), "yyyy-MM-dd"),
      end: format(endOfMonth(date), "yyyy-MM-dd"),
    };
  }

  // Weekly: 2026-W10
  const [year, week] = period.split("-W").map(Number);
  if (!year || !week) throw new Error(`Invalid period format: ${period}`);

  // date-fns doesn't have a direct "parse week string", so we find the first day of the year
  // and move to the appropriate week. ISO weeks start on Monday.
  const firstDay = new Date(year, 0, 4); // Jan 4th is always in the first ISO week
  const start = addDays(startOfISOWeek(firstDay), (week - 1) * 7);
  const end = endOfISOWeek(start);

  return {
    start: format(start, "yyyy-MM-dd"),
    end: format(end, "yyyy-MM-dd"),
  };
}
