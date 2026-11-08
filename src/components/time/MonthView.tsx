"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  isWeekend,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { HolidaySummary } from "@/lib/holidays";
import { cn } from "@/lib/utils";

interface DaySummary {
  date: string;
  totalMinutes: number;
}

interface MonthViewProps {
  referenceDate: Date;
  dailyTargetMinutes: number;
  onReferenceDateChange: (date: Date) => void;
  onDayClick: (date: Date) => void;
  onOpenCreate: () => void;
  holidays?: HolidaySummary[];
}

const weekdayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

function formatCompactDuration(minutes: number) {
  if (minutes <= 0) return "0h";
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h${mins.toString().padStart(2, "0")}`;
}

export function MonthView({
  referenceDate,
  dailyTargetMinutes,
  onReferenceDateChange,
  onDayClick,
  onOpenCreate: _onOpenCreate,
  holidays = [],
}: MonthViewProps) {
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [fetchedHolidays, setFetchedHolidays] = useState<HolidaySummary[]>([]);
  const [loading, setLoading] = useState(true);

  const firstDayOfMonth = startOfMonth(referenceDate);
  const lastDayOfMonth = endOfMonth(referenceDate);
  const visibleStart = startOfWeek(firstDayOfMonth);
  const visibleEnd = endOfWeek(lastDayOfMonth);
  const days = eachDayOfInterval({ start: visibleStart, end: visibleEnd });
  const fromStr = format(firstDayOfMonth, "yyyy-MM-dd");
  const toStr = format(lastDayOfMonth, "yyyy-MM-dd");

  useEffect(() => {
    let active = true;

    setLoading(true);
    fetch(`/api/time-entries/summary?groupBy=day&from=${fromStr}&to=${toStr}`, {
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) {
          return {
            data: [] as DaySummary[],
            holidays: [] as HolidaySummary[],
          };
        }
        return (await response.json()) as {
          data?: DaySummary[];
          holidays?: HolidaySummary[];
        };
      })
      .then((payload) => {
        if (!active) return;
        setDaySummaries(payload.data ?? []);
        setFetchedHolidays(payload.holidays ?? []);
      })
      .catch((err: unknown) => {
        if (!active) return;
        console.error("[MonthView] load summaries:", err);
        setDaySummaries([]);
        setFetchedHolidays([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fromStr, toStr]);

  const holidayByDate = useMemo(() => {
    const map = new Map<string, HolidaySummary>();
    for (const holiday of [...holidays, ...fetchedHolidays]) {
      if (holiday.isActive !== false) {
        map.set(holiday.date, holiday);
      }
    }
    return map;
  }, [fetchedHolidays, holidays]);

  const minutesByDate = useMemo(() => {
    const map = new Map<string, number>();

    for (const summary of daySummaries) {
      const key = summary.date.split("T")[0] ?? summary.date;
      map.set(key, Number(summary.totalMinutes) || 0);
    }

    return map;
  }, [daySummaries]);

  const monthTotal = Array.from(minutesByDate.values()).reduce(
    (sum, minutes) => sum + minutes,
    0,
  );

  return (
    <section className="flex flex-col overflow-hidden rounded-[24px] border border-border/60 bg-card/60 shadow-sm backdrop-blur-xl">
      <div className="flex flex-col gap-3 border-b border-border/60 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-xl font-semibold capitalize text-foreground">
              {format(referenceDate, "MMMM yyyy", { locale: ptBR })}
            </h2>
          </div>
          <div className="flex items-center gap-1.5 opacity-90">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onReferenceDateChange(subMonths(referenceDate, 1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="h-8 gap-2 rounded-full px-4 text-[11px] font-bold"
              onClick={() => onReferenceDateChange(new Date())}
            >
              <Calendar className="h-3 w-3" />
              <span>Ir para hoje</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onReferenceDateChange(addMonths(referenceDate, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="flex items-center">
          <Badge
            variant="outline"
            className="h-8 gap-2 rounded-full border-brand-500/20 bg-brand-500/5 px-3 text-xs font-medium text-foreground"
          >
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono text-brand-500">
              {formatCompactDuration(monthTotal)}
            </span>
          </Badge>
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="pb-2 text-center text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70"
            >
              {label}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {Array.from({ length: days.length }, (_, index) => (
              <Skeleton
                key={`month-skeleton-${index + 1}`}
                className="h-20 rounded-[16px] sm:h-24"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const totalMinutes = minutesByDate.get(dayKey) ?? 0;
              const inCurrentMonth = isSameMonth(day, referenceDate);
              const isTodayDate = isToday(day);
              const isWeekendDay = isWeekend(day);
              const dayHoliday = holidayByDate.get(dayKey) ?? null;

              const isDayOff = isWeekendDay || Boolean(dayHoliday);
              const actualTarget = isDayOff ? 0 : dailyTargetMinutes;

              const hasEntries = totalMinutes > 0;
              const metTarget =
                actualTarget > 0 ? totalMinutes >= actualTarget : hasEntries; // Se fez horas no fds, meta batida!

              const percentage =
                actualTarget > 0
                  ? Math.min(totalMinutes / actualTarget, 1)
                  : hasEntries
                    ? 1
                    : 0;

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => onDayClick(day)}
                  className={cn(
                    "group flex h-20 flex-col rounded-[16px] border border-transparent p-2 text-left transition-all duration-200 sm:h-24 sm:p-2.5",
                    !inCurrentMonth && "opacity-40",
                    isWeekendDay
                      ? "bg-muted/30"
                      : "bg-background/40 shadow-sm hover:bg-background/80",
                    isTodayDate &&
                      "border-brand-500/30 bg-brand-500/5 ring-1 ring-brand-500/50",
                    hasEntries && !isTodayDate && "border-border/60",
                    "hover:border-brand-500/40 hover:shadow-md",
                  )}
                >
                  <div className="flex w-full items-start justify-between gap-1">
                    <span
                      className={cn(
                        "flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-xs font-semibold sm:text-sm",
                        isTodayDate
                          ? "bg-brand-500 text-white"
                          : dayHoliday
                            ? "text-amber-600 dark:text-amber-400"
                            : isWeekendDay
                              ? "text-muted-foreground/60"
                              : "text-foreground/80",
                      )}
                    >
                      {format(day, "d")}
                    </span>
                    {dayHoliday ? (
                      <span
                        title={`Feriado: ${dayHoliday.name}`}
                        className="truncate rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium text-amber-600 dark:text-amber-400"
                      >
                        Feriado
                      </span>
                    ) : null}
                  </div>

                  <div className="mt-auto flex w-full flex-col gap-1.5">
                    {hasEntries ? (
                      <>
                        <span
                          className={cn(
                            "font-mono text-[11px] font-semibold tracking-tight sm:text-xs",
                            metTarget ? "text-emerald-500" : "text-amber-500",
                          )}
                        >
                          {formatCompactDuration(totalMinutes)}
                        </span>
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted/50 dark:bg-muted/20">
                          <div
                            className={cn(
                              "h-full rounded-full transition-all duration-500",
                              metTarget ? "bg-emerald-500" : "bg-amber-500",
                            )}
                            style={{
                              width: `${Math.max(percentage * 100, 15)}%`,
                            }}
                          />
                        </div>
                      </>
                    ) : dayHoliday ? (
                      <span
                        title={dayHoliday.name}
                        className="truncate text-[10px] font-medium text-amber-600/90 dark:text-amber-400/90"
                      >
                        {dayHoliday.name}
                      </span>
                    ) : (
                      <div className="flex items-center opacity-40 transition-opacity group-hover:opacity-100">
                        <span className="font-mono text-xs font-medium text-muted-foreground">
                          -
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
