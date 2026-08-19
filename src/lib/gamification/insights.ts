import {
  differenceInCalendarDays,
  eachDayOfInterval,
  format,
  getDay,
  isWeekend,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { project, timeEntry, timesheet } from "@/lib/db/schema";
import {
  formatDuration,
  getPeriodRange,
  getWeekPeriod,
  parseLocalDate,
} from "@/lib/utils";
import { INSIGHT_WINDOW_WEEKS, QUALITY_THRESHOLDS } from "./constants";
import { submissionDeadline } from "./engine";
import { formatPeriodLabel, formatPeriodShort } from "./format";
import type {
  BalanceBreakdownItem,
  BalanceReport,
  PersonalInsight,
  PersonalInsightsReport,
  WeeklyTrendPoint,
} from "./types";

const WEEKDAY_LABELS = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

interface InsightEntry {
  date: string;
  duration: number;
  description: string;
  startTime: Date | null;
  projectId: string;
}

function percentDelta(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** ISO week list ending at the current week, oldest first. */
function buildWindowPeriods(reference: Date, weeks: number): string[] {
  const periods: string[] = [];
  for (let offset = weeks - 1; offset >= 0; offset -= 1) {
    periods.push(getWeekPeriod(subWeeks(reference, offset)));
  }
  return periods;
}

function buildBalanceReport(
  entries: InsightEntry[],
  periods: string[],
): BalanceReport {
  const minutesByDay = new Map<string, number>();
  for (const entry of entries) {
    minutesByDay.set(
      entry.date,
      (minutesByDay.get(entry.date) ?? 0) + Math.max(0, entry.duration),
    );
  }

  const overworkDays: string[] = [];
  const weekendDays: string[] = [];
  for (const [date, minutes] of minutesByDay) {
    if (minutes > QUALITY_THRESHOLDS.overworkDayMinutes)
      overworkDays.push(date);
    if (minutes > 0 && isWeekend(parseLocalDate(date))) weekendDays.push(date);
  }

  const heavyWeeks = periods.filter((period) => {
    const { start, end } = getPeriodRange(period, "weekly");
    let total = 0;
    for (const [date, minutes] of minutesByDay) {
      if (date >= start && date <= end) total += minutes;
    }
    return total > QUALITY_THRESHOLDS.sustainableWeeklyMinutes;
  });

  // Longest run of consecutive logged days, weekends included.
  const sortedDays = [...minutesByDay.keys()].sort();
  let longestRun = 0;
  let run = 0;
  let previous: string | null = null;
  for (const date of sortedDays) {
    if (
      previous &&
      differenceInCalendarDays(
        parseLocalDate(date),
        parseLocalDate(previous),
      ) === 1
    ) {
      run += 1;
    } else {
      run = 1;
    }
    longestRun = Math.max(longestRun, run);
    previous = date;
  }

  const breakdown: BalanceBreakdownItem[] = [];

  const overworkPenalty = Math.min(30, overworkDays.length * 8);
  breakdown.push({
    key: "overwork",
    label: "Dias acima de 10h",
    detail:
      overworkDays.length === 0
        ? "Nenhum dia extenuante no período."
        : `${overworkDays.length} ${overworkDays.length === 1 ? "dia" : "dias"} com jornada longa.`,
    penalty: overworkPenalty,
    tone: overworkDays.length === 0 ? "positive" : "attention",
  });

  const weekendPenalty = Math.min(24, weekendDays.length * 6);
  breakdown.push({
    key: "weekend",
    label: "Trabalho em fim de semana",
    detail:
      weekendDays.length === 0
        ? "Fins de semana preservados."
        : `${weekendDays.length} ${weekendDays.length === 1 ? "dia" : "dias"} de fim de semana com apontamento.`,
    penalty: weekendPenalty,
    tone: weekendDays.length === 0 ? "positive" : "attention",
  });

  const heavyPenalty = Math.min(30, heavyWeeks.length * 10);
  breakdown.push({
    key: "weekly_load",
    label: "Semanas acima de 45h",
    detail:
      heavyWeeks.length === 0
        ? "Carga semanal dentro de um patamar sustentável."
        : `${heavyWeeks.length} ${heavyWeeks.length === 1 ? "semana" : "semanas"} acima do patamar saudável.`,
    penalty: heavyPenalty,
    tone: heavyWeeks.length === 0 ? "positive" : "attention",
  });

  const streakPenalty = longestRun > 12 ? 16 : 0;
  breakdown.push({
    key: "recovery",
    label: "Dias seguidos sem pausa",
    detail:
      longestRun > 12
        ? `${longestRun} dias consecutivos com registro — vale programar uma folga.`
        : "Há pausas regulares entre os dias registrados.",
    penalty: streakPenalty,
    tone: longestRun > 12 ? "attention" : "positive",
  });

  const score = Math.max(
    0,
    100 - overworkPenalty - weekendPenalty - heavyPenalty - streakPenalty,
  );

  const label =
    score >= 85 ? "Saudável" : score >= 65 ? "Atenção leve" : "Atenção";
  const tone = score >= 85 ? "positive" : score >= 65 ? "neutral" : "attention";
  const summary =
    score >= 85
      ? "Seu ritmo está sustentável. Continue assim."
      : score >= 65
        ? "O ritmo está aceitável, mas há sinais de sobrecarga pontual."
        : "Os sinais apontam sobrecarga recorrente. Vale conversar com sua liderança.";

  return {
    score,
    label,
    summary,
    tone,
    breakdown,
    weeksAnalysed: periods.length,
  };
}

/**
 * Build the personal insights panel.
 *
 * Every figure is descriptive, never prescriptive about working more — the
 * wellbeing signals exist to surface overload, not to push volume up.
 */
export async function buildPersonalInsights(
  userId: string,
  windowWeeks: number = INSIGHT_WINDOW_WEEKS,
): Promise<PersonalInsightsReport> {
  const now = new Date();
  const periods = buildWindowPeriods(now, windowWeeks);
  const firstPeriod = periods[0];
  const lastPeriod = periods[periods.length - 1];
  if (!firstPeriod || !lastPeriod) {
    throw new Error("Invalid insight window");
  }

  const windowStart = getPeriodRange(firstPeriod, "weekly").start;
  const windowEnd = getPeriodRange(lastPeriod, "weekly").end;

  const [rows, timesheets] = await Promise.all([
    db
      .select({
        date: timeEntry.date,
        duration: timeEntry.duration,
        description: timeEntry.description,
        startTime: timeEntry.startTime,
        projectId: timeEntry.projectId,
        projectName: project.name,
      })
      .from(timeEntry)
      .innerJoin(project, eq(project.id, timeEntry.projectId))
      .where(
        and(
          eq(timeEntry.userId, userId),
          gte(timeEntry.date, windowStart),
          lte(timeEntry.date, windowEnd),
          isNull(timeEntry.deletedAt),
        ),
      ),
    db.query.timesheet.findMany({
      where: and(
        eq(timesheet.userId, userId),
        inArray(timesheet.period, periods),
      ),
      columns: {
        period: true,
        periodType: true,
        status: true,
        submittedAt: true,
      },
    }),
  ]);

  const entries: InsightEntry[] = rows.map((row) => ({
    date: row.date,
    duration: row.duration,
    description: row.description,
    startTime: row.startTime,
    projectId: row.projectId,
  }));
  const projectNameById = new Map(
    rows.map((row) => [row.projectId, row.projectName]),
  );
  const timesheetByPeriod = new Map(timesheets.map((ts) => [ts.period, ts]));

  const minutesByPeriod = new Map<string, number>();
  for (const entry of entries) {
    const period = getWeekPeriod(entry.date);
    minutesByPeriod.set(
      period,
      (minutesByPeriod.get(period) ?? 0) + Math.max(0, entry.duration),
    );
  }

  const trend: WeeklyTrendPoint[] = periods.map((period) => ({
    period,
    label: formatPeriodLabel(period),
    shortLabel: formatPeriodShort(period),
    minutes: minutesByPeriod.get(period) ?? 0,
    status:
      (timesheetByPeriod.get(period)?.status as WeeklyTrendPoint["status"]) ??
      null,
  }));

  const insights: PersonalInsight[] = [];
  const half = Math.floor(periods.length / 2);
  const recentPeriods = periods.slice(half);
  const earlierPeriods = periods.slice(0, half);

  const sumOf = (list: string[]): number =>
    list.reduce(
      (total, period) => total + (minutesByPeriod.get(period) ?? 0),
      0,
    );

  const recentAverage =
    recentPeriods.length > 0 ? sumOf(recentPeriods) / recentPeriods.length : 0;
  const earlierAverage =
    earlierPeriods.length > 0
      ? sumOf(earlierPeriods) / earlierPeriods.length
      : 0;

  insights.push({
    key: "rhythm",
    title: "Ritmo semanal",
    value: formatDuration(Math.round(recentAverage)),
    description:
      earlierAverage > 0
        ? `Média das últimas ${recentPeriods.length} semanas, comparada às ${earlierPeriods.length} anteriores.`
        : `Média das últimas ${recentPeriods.length} semanas registradas.`,
    tone: "neutral",
    icon: "Activity",
    deltaPercentage: percentDelta(recentAverage, earlierAverage),
  });

  // Most productive weekday, averaged over the days that actually occurred.
  const minutesByWeekday = new Map<number, number>();
  const daysByWeekday = new Map<number, Set<string>>();
  for (const entry of entries) {
    const weekday = getDay(parseLocalDate(entry.date));
    minutesByWeekday.set(
      weekday,
      (minutesByWeekday.get(weekday) ?? 0) + Math.max(0, entry.duration),
    );
    const set = daysByWeekday.get(weekday) ?? new Set<string>();
    set.add(entry.date);
    daysByWeekday.set(weekday, set);
  }

  let bestWeekday: { weekday: number; average: number } | null = null;
  for (const [weekday, minutes] of minutesByWeekday) {
    const dayCount = daysByWeekday.get(weekday)?.size ?? 1;
    const average = minutes / dayCount;
    if (!bestWeekday || average > bestWeekday.average) {
      bestWeekday = { weekday, average };
    }
  }

  if (bestWeekday) {
    insights.push({
      key: "best_day",
      title: "Dia mais produtivo",
      value: WEEKDAY_LABELS[bestWeekday.weekday] ?? "—",
      description: `Média de ${formatDuration(Math.round(bestWeekday.average))} registradas nesse dia.`,
      tone: "positive",
      icon: "CalendarHeart",
      deltaPercentage: null,
    });
  }

  const totalMinutes = entries.reduce(
    (total, entry) => total + Math.max(0, entry.duration),
    0,
  );
  const averageBlock = entries.length > 0 ? totalMinutes / entries.length : 0;

  insights.push({
    key: "focus",
    title: "Bloco médio de foco",
    value: formatDuration(Math.round(averageBlock)),
    description:
      averageBlock >= 90
        ? "Blocos longos: seu trabalho aparece em sessões concentradas."
        : averageBlock >= 45
          ? "Blocos equilibrados entre foco e troca de contexto."
          : "Blocos curtos: o dia está bastante fragmentado.",
    tone: averageBlock >= 45 ? "positive" : "attention",
    icon: "Target",
    deltaPercentage: null,
  });

  // Business-day coverage across the window, ignoring days still in the future.
  const businessDays = eachDayOfInterval({
    start: parseLocalDate(windowStart),
    end: parseLocalDate(format(now, "yyyy-MM-dd")),
  }).filter((day) => !isWeekend(day));
  const loggedDays = new Set(entries.map((entry) => entry.date));
  const coveredBusinessDays = businessDays.filter((day) =>
    loggedDays.has(format(day, "yyyy-MM-dd")),
  ).length;
  const coverage =
    businessDays.length > 0 ? coveredBusinessDays / businessDays.length : 0;

  insights.push({
    key: "coverage",
    title: "Cobertura de dias úteis",
    value: `${Math.round(coverage * 100)}%`,
    description: `${coveredBusinessDays} de ${businessDays.length} dias úteis com apontamento.`,
    tone:
      coverage >= 0.9 ? "positive" : coverage >= 0.7 ? "neutral" : "attention",
    icon: "CalendarCheck",
    deltaPercentage: null,
  });

  const minutesByProject = new Map<string, number>();
  for (const entry of entries) {
    minutesByProject.set(
      entry.projectId,
      (minutesByProject.get(entry.projectId) ?? 0) +
        Math.max(0, entry.duration),
    );
  }
  const topProject = [...minutesByProject.entries()].sort(
    (a, b) => b[1] - a[1],
  )[0];

  if (topProject && totalMinutes > 0) {
    const share = Math.round((topProject[1] / totalMinutes) * 100);
    insights.push({
      key: "mix",
      title: "Projeto dominante",
      value: projectNameById.get(topProject[0]) ?? "—",
      description: `${share}% das suas horas no período · ${minutesByProject.size} ${minutesByProject.size === 1 ? "projeto" : "projetos"} no total.`,
      tone: share >= 85 ? "neutral" : "positive",
      icon: "Layers",
      deltaPercentage: null,
    });
  }

  // Punctuality: how long after the deadline each week was actually closed.
  const submittedSheets = timesheets.filter((ts) => ts.submittedAt);
  if (submittedSheets.length > 0) {
    let totalLag = 0;
    let onTimeCount = 0;
    for (const ts of submittedSheets) {
      const { end } = getPeriodRange(ts.period, ts.periodType);
      const deadline = submissionDeadline(end);
      const submittedAt = ts.submittedAt as Date;
      totalLag += differenceInCalendarDays(submittedAt, deadline);
      if (submittedAt <= deadline) onTimeCount += 1;
    }
    const averageLag = totalLag / submittedSheets.length;
    const onTimeShare = Math.round(
      (onTimeCount / submittedSheets.length) * 100,
    );

    insights.push({
      key: "punctuality",
      title: "Pontualidade",
      value: `${onTimeShare}%`,
      description:
        averageLag <= 0
          ? `Você costuma fechar ${Math.abs(Math.round(averageLag))} ${Math.abs(Math.round(averageLag)) === 1 ? "dia" : "dias"} antes do prazo.`
          : `Em média, ${Math.round(averageLag)} ${Math.round(averageLag) === 1 ? "dia" : "dias"} após o prazo de segunda ao meio-dia.`,
      tone:
        onTimeShare >= 80
          ? "positive"
          : onTimeShare >= 50
            ? "neutral"
            : "attention",
      icon: "AlarmClock",
      deltaPercentage: null,
    });
  }

  // Preferred start window, only for timer-created entries that carry a clock.
  const timedEntries = entries.filter((entry) => entry.startTime);
  if (timedEntries.length >= 5) {
    const buckets = new Map<number, number>();
    for (const entry of timedEntries) {
      const hour = (entry.startTime as Date).getHours();
      buckets.set(hour, (buckets.get(hour) ?? 0) + 1);
    }
    const peakHour = [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
    if (peakHour) {
      insights.push({
        key: "peak_hours",
        title: "Seu horário de pico",
        value: `${peakHour[0].toString().padStart(2, "0")}h`,
        description: `É quando você mais inicia timers — ${peakHour[1]} de ${timedEntries.length} sessões cronometradas.`,
        tone: "neutral",
        icon: "Sunrise",
        deltaPercentage: null,
      });
    }
  }

  return {
    windowWeeks: periods.length,
    insights,
    balance: buildBalanceReport(entries, periods),
    trend,
  };
}

/** Locale-aware weekday label, exported for reuse in presentation layers. */
export function weekdayLabel(weekday: number): string {
  return (
    WEEKDAY_LABELS[weekday] ??
    format(new Date(2026, 0, 4 + weekday), "EEEE", { locale: ptBR })
  );
}
