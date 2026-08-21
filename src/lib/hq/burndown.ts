/**
 * Predictive budget burn-down for the Project Health Radar.
 *
 * Deliberately pure: the API layer aggregates minutes per ISO week and this
 * module turns the series into a forecast plus a human-readable pt-BR
 * headline. Weighted recency keeps the projection honest — a project that
 * accelerated last week should exhaust sooner than its lifetime average
 * suggests.
 */

import { addDays, differenceInCalendarDays, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { formatLocalDate, parseLocalDate } from "@/lib/utils";
import type {
  ProjectHealthForecast,
  ProjectWeeklyConsumption,
} from "@/types/hq";

/** Complete weeks considered for the burn rate (most recent first). */
const BURN_RATE_WINDOW = 4;
/** Recency weights applied oldest → newest inside the window. */
const BURN_RATE_WEIGHTS = [1, 2, 3, 4];
/** Usage ratio that flips a project to "warning" even without a deadline. */
const WARNING_USAGE_RATIO = 0.8;
/** Trend spike (last week vs. previous baseline) that reads as scope creep. */
const WARNING_TREND_PCT = 50;
/** Buffer (days) between projected exhaustion and delivery that is still OK. */
const SCHEDULE_BUFFER_DAYS = 7;

export interface BuildForecastInput {
  /** Contracted budget in minutes; null when the project has no budget */
  budgetMinutes: number | null;
  /** All-time consumed minutes */
  consumedMinutes: number;
  /**
   * Recent weekly consumption, oldest first. The LAST item must be the
   * current (partial) week — it is excluded from the burn rate but reported.
   */
  weeklySeries: ProjectWeeklyConsumption[];
  /** Planned delivery date, YYYY-MM-DD (project.endDate) */
  endDate: string | null;
  /** Today in the app timezone, YYYY-MM-DD */
  today: string;
}

/** Weighted average of the last complete weeks; 0 when there is no activity. */
export function computeBurnRatePerWeek(
  weeklySeries: ProjectWeeklyConsumption[],
): number {
  // Drop the current partial week — it would drag the average down.
  const completeWeeks = weeklySeries.slice(0, -1);
  const window = completeWeeks.slice(-BURN_RATE_WINDOW);
  if (window.length === 0) return 0;

  let weightedSum = 0;
  let weightTotal = 0;

  window.forEach((point, index) => {
    const weight =
      BURN_RATE_WEIGHTS[index + (BURN_RATE_WEIGHTS.length - window.length)] ??
      1;
    weightedSum += point.minutes * weight;
    weightTotal += weight;
  });

  if (weightTotal === 0) return 0;
  return Math.round(weightedSum / weightTotal);
}

/** Last complete week vs. the average of the up-to-3 weeks before it, in %. */
export function computeTrendPct(
  weeklySeries: ProjectWeeklyConsumption[],
): number | null {
  const completeWeeks = weeklySeries.slice(0, -1);
  if (completeWeeks.length < 2) return null;

  const last = completeWeeks.at(-1);
  if (!last) return null;

  const baselineWeeks = completeWeeks.slice(0, -1).slice(-3);
  const baseline =
    baselineWeeks.reduce((sum, point) => sum + point.minutes, 0) /
    baselineWeeks.length;

  if (baseline <= 0) {
    return last.minutes > 0 ? 100 : null;
  }

  return Math.round(((last.minutes - baseline) / baseline) * 100);
}

function formatHours(minutes: number): string {
  const hours = minutes / 60;
  const rounded = Math.round(hours * 10) / 10;
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded}h`;
}

function formatDatePt(date: string): string {
  return format(parseLocalDate(date), "d 'de' MMM", { locale: ptBR });
}

function buildHeadline(input: {
  budgetMinutes: number | null;
  consumedMinutes: number;
  burnRatePerWeek: number;
  projectedExhaustionDate: string | null;
  scheduleDeltaDays: number | null;
  endDate: string | null;
}): string {
  const {
    budgetMinutes,
    consumedMinutes,
    burnRatePerWeek,
    projectedExhaustionDate,
    scheduleDeltaDays,
    endDate,
  } = input;

  if (budgetMinutes === null) {
    return "Projeto sem orçamento de horas definido — defina um budget para habilitar a previsão.";
  }

  const remaining = budgetMinutes - consumedMinutes;

  if (remaining <= 0) {
    return `Orçamento estourado em ${formatHours(Math.abs(remaining))} — ${formatHours(consumedMinutes)} consumidas de ${formatHours(budgetMinutes)} contratadas.`;
  }

  if (burnRatePerWeek <= 0) {
    return `Sem consumo relevante nas últimas semanas — restam ${formatHours(remaining)} de ${formatHours(budgetMinutes)}.`;
  }

  const pace = `No ritmo atual (~${formatHours(burnRatePerWeek)}/semana)`;

  if (!projectedExhaustionDate) {
    return `${pace}, restam ${formatHours(remaining)} de orçamento.`;
  }

  const exhaustion = `o orçamento de ${formatHours(budgetMinutes)} esgota em ${formatDatePt(projectedExhaustionDate)}`;

  if (endDate === null || scheduleDeltaDays === null) {
    return `${pace}, ${exhaustion}.`;
  }

  if (scheduleDeltaDays < 0) {
    const days = Math.abs(scheduleDeltaDays);
    return `${pace}, ${exhaustion} — ${days} dia${days === 1 ? "" : "s"} antes da entrega prevista (${formatDatePt(endDate)}).`;
  }

  if (scheduleDeltaDays <= SCHEDULE_BUFFER_DAYS) {
    return `${pace}, ${exhaustion} — margem apertada de ${scheduleDeltaDays} dia${scheduleDeltaDays === 1 ? "" : "s"} até a entrega (${formatDatePt(endDate)}).`;
  }

  return `${pace}, ${exhaustion} — ${scheduleDeltaDays} dias de folga em relação à entrega (${formatDatePt(endDate)}).`;
}

/**
 * Turns aggregated consumption into the full forecast used by the radar card.
 * Never throws; degrades to informative states when data is missing.
 */
export function buildProjectForecast(
  input: BuildForecastInput,
): ProjectHealthForecast {
  const { budgetMinutes, consumedMinutes, weeklySeries, endDate, today } =
    input;

  const burnRatePerWeek = computeBurnRatePerWeek(weeklySeries);
  const trendPct = computeTrendPct(weeklySeries);

  const budgetUsageRatio =
    budgetMinutes !== null && budgetMinutes > 0
      ? consumedMinutes / budgetMinutes
      : null;

  let projectedExhaustionDate: string | null = null;
  let scheduleDeltaDays: number | null = null;

  if (budgetMinutes !== null && burnRatePerWeek > 0) {
    const remaining = budgetMinutes - consumedMinutes;

    if (remaining > 0) {
      const weeksLeft = remaining / burnRatePerWeek;
      const projected = addDays(
        parseLocalDate(today),
        Math.round(weeksLeft * 7),
      );
      projectedExhaustionDate = formatLocalDate(projected);

      if (endDate) {
        scheduleDeltaDays = differenceInCalendarDays(
          parseLocalDate(endDate),
          projected,
        );
      }
    } else {
      // Already exhausted: the projection is "now".
      projectedExhaustionDate = today;
      if (endDate) {
        scheduleDeltaDays = differenceInCalendarDays(
          parseLocalDate(endDate),
          parseLocalDate(today),
        );
        scheduleDeltaDays = -Math.abs(scheduleDeltaDays);
      }
    }
  }

  let risk: ProjectHealthForecast["risk"];

  if (budgetMinutes === null) {
    risk = "no_budget";
  } else if (
    (budgetUsageRatio !== null && budgetUsageRatio >= 1) ||
    (scheduleDeltaDays !== null && scheduleDeltaDays < 0)
  ) {
    risk = "critical";
  } else if (
    (budgetUsageRatio !== null && budgetUsageRatio >= WARNING_USAGE_RATIO) ||
    (scheduleDeltaDays !== null && scheduleDeltaDays <= SCHEDULE_BUFFER_DAYS) ||
    (trendPct !== null && trendPct >= WARNING_TREND_PCT)
  ) {
    risk = "warning";
  } else {
    risk = "healthy";
  }

  return {
    burnRatePerWeek,
    projectedExhaustionDate,
    scheduleDeltaDays,
    budgetUsageRatio,
    trendPct,
    risk,
    headline: buildHeadline({
      budgetMinutes,
      consumedMinutes,
      burnRatePerWeek,
      projectedExhaustionDate,
      scheduleDeltaDays,
      endDate,
    }),
  };
}
