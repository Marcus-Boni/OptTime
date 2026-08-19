import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getPeriodRange, parseLocalDate } from "@/lib/utils";

/**
 * Human label for a timesheet period, e.g. "Semana 33 · 10–16 ago".
 * Safe to call on the client: it derives everything from the period string.
 */
export function formatPeriodLabel(
  period: string,
  periodType: string = "weekly",
): string {
  try {
    const { start, end } = getPeriodRange(period, periodType);
    const startDate = parseLocalDate(start);
    const endDate = parseLocalDate(end);

    if (periodType === "monthly") {
      return format(startDate, "MMMM 'de' yyyy", { locale: ptBR });
    }

    const weekNumber = period.split("-W")[1] ?? "";
    const sameMonth = startDate.getMonth() === endDate.getMonth();
    const range = sameMonth
      ? `${format(startDate, "d")}–${format(endDate, "d 'de' MMM", { locale: ptBR })}`
      : `${format(startDate, "d 'de' MMM", { locale: ptBR })} – ${format(endDate, "d 'de' MMM", { locale: ptBR })}`;

    return `Semana ${weekNumber} · ${range}`;
  } catch {
    return period;
  }
}

/** Short label used in dense surfaces, e.g. "S33". */
export function formatPeriodShort(period: string): string {
  const weekNumber = period.split("-W")[1];
  return weekNumber ? `S${weekNumber}` : period;
}
