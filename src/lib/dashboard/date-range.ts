"use client";

import {
  endOfMonth,
  endOfWeek,
  format,
  isAfter,
  isValid,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseLocalDate } from "@/lib/utils";

export const DASHBOARD_RANGE_OPTIONS = [
  { value: "this-week", label: "Esta semana" },
  { value: "last-week", label: "Semana passada" },
  { value: "this-month", label: "Este mês" },
  { value: "last-month", label: "Mês passado" },
  { value: "last-3-months", label: "Últimos 3 meses" },
  { value: "custom", label: "Personalizado" },
] as const;

export type DashboardRangeOption =
  (typeof DASHBOARD_RANGE_OPTIONS)[number]["value"];

export type DashboardCustomRange = {
  from: string | null;
  to: string | null;
};

export type DashboardResolvedRange = {
  from: string;
  to: string;
  label: string;
  error: string | null;
  isReady: boolean;
  usesWeekdayLabels: boolean;
};

function formatRangeLabel(start: Date, end: Date) {
  return `${format(start, "dd/MM/yyyy", { locale: ptBR })} - ${format(end, "dd/MM/yyyy", { locale: ptBR })}`;
}

export function getDefaultDashboardCustomRange(now: Date) {
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = endOfWeek(now, { weekStartsOn: 1 });

  return {
    from: format(start, "yyyy-MM-dd"),
    to: format(end, "yyyy-MM-dd"),
  };
}

export function resolveDashboardRange({
  range,
  now,
  customRange,
}: {
  range: DashboardRangeOption;
  now: Date | null;
  customRange: DashboardCustomRange;
}): DashboardResolvedRange {
  if (!now) {
    return {
      from: "",
      to: "",
      label: "Carregando período",
      error: null,
      isReady: false,
      usesWeekdayLabels: false,
    };
  }

  if (range === "this-week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });

    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      label: `${format(start, "dd/MM", { locale: ptBR })} - ${format(end, "dd/MM", { locale: ptBR })}`,
      error: null,
      isReady: true,
      usesWeekdayLabels: true,
    };
  }

  if (range === "last-week") {
    const referenceDate = subWeeks(now, 1);
    const start = startOfWeek(referenceDate, { weekStartsOn: 1 });
    const end = endOfWeek(referenceDate, { weekStartsOn: 1 });

    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      label: `${format(start, "dd/MM", { locale: ptBR })} - ${format(end, "dd/MM", { locale: ptBR })}`,
      error: null,
      isReady: true,
      usesWeekdayLabels: true,
    };
  }

  if (range === "this-month") {
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
      label: format(now, "MMMM yyyy", { locale: ptBR }),
      error: null,
      isReady: true,
      usesWeekdayLabels: false,
    };
  }

  if (range === "last-month") {
    const previousMonth = subMonths(now, 1);

    return {
      from: format(startOfMonth(previousMonth), "yyyy-MM-dd"),
      to: format(endOfMonth(previousMonth), "yyyy-MM-dd"),
      label: format(previousMonth, "MMMM yyyy", { locale: ptBR }),
      error: null,
      isReady: true,
      usesWeekdayLabels: false,
    };
  }

  if (range === "last-3-months") {
    const start = startOfMonth(subMonths(now, 2));

    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
      label: `${format(start, "MMM", { locale: ptBR })} - ${format(now, "MMM yyyy", { locale: ptBR })}`,
      error: null,
      isReady: true,
      usesWeekdayLabels: false,
    };
  }

  if (!customRange.from || !customRange.to) {
    return {
      from: "",
      to: "",
      label: "Selecione início e fim",
      error: null,
      isReady: false,
      usesWeekdayLabels: false,
    };
  }

  const start = parseLocalDate(customRange.from);
  const end = parseLocalDate(customRange.to);

  if (!isValid(start) || !isValid(end)) {
    return {
      from: "",
      to: "",
      label: "Intervalo inválido",
      error: "Informe datas válidas para aplicar o período personalizado.",
      isReady: false,
      usesWeekdayLabels: false,
    };
  }

  if (isAfter(start, end)) {
    return {
      from: "",
      to: "",
      label: "Intervalo inválido",
      error: "A data inicial deve ser anterior ou igual à data final.",
      isReady: false,
      usesWeekdayLabels: false,
    };
  }

  return {
    from: customRange.from,
    to: customRange.to,
    label: formatRangeLabel(start, end),
    error: null,
    isReady: true,
    usesWeekdayLabels: false,
  };
}
