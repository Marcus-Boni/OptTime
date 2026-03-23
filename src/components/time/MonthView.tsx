"use client";

import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
  onOpenCreate,
}: MonthViewProps) {
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
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
          return { data: [] as DaySummary[] };
        }
        return (await response.json()) as { data?: DaySummary[] };
      })
      .then((payload) => {
        if (!active) return;
        setDaySummaries(payload.data ?? []);
      })
      .catch(() => {
        if (!active) return;
        setDaySummaries([]);
      })
      .finally(() => {
        if (!active) return;
        setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [fromStr, toStr]);

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
    <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
      <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={() => onReferenceDateChange(subMonths(referenceDate, 1))}
              aria-label="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={() => onReferenceDateChange(addMonths(referenceDate, 1))}
              aria-label="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => onReferenceDateChange(new Date())}
            >
              Mês atual
            </Button>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold capitalize text-foreground">
              {format(referenceDate, "MMMM yyyy", { locale: ptBR })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Localize dias vazios e clique na célula para abrir o detalhe
              diário.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Badge className="rounded-full bg-brand-500/10 px-3 py-1.5 text-brand-500">
            {formatCompactDuration(monthTotal)} no mês
          </Badge>
          <Button
            className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
            onClick={onOpenCreate}
          >
            <Plus className="mr-2 h-4 w-4" />
            Novo registro
          </Button>
        </div>
      </div>

      <div className="px-5 py-5 sm:px-6">
        <div className="grid grid-cols-7 gap-3">
          {weekdayLabels.map((label) => (
            <div
              key={label}
              className="px-2 text-center text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground"
            >
              {label}
            </div>
          ))}
        </div>

        {loading ? (
          <div className="mt-3 grid grid-cols-7 gap-3">
            {Array.from({ length: days.length }, (_, index) => (
              <Skeleton
                key={`month-skeleton-${index + 1}`}
                className="h-28 rounded-[20px]"
              />
            ))}
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-7 gap-3">
            {days.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const totalMinutes = minutesByDate.get(dayKey) ?? 0;
              const inCurrentMonth = isSameMonth(day, referenceDate);
              const percentage =
                dailyTargetMinutes > 0
                  ? Math.min(totalMinutes / dailyTargetMinutes, 1)
                  : 0;

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => onDayClick(day)}
                  className={cn(
                    "flex min-h-28 flex-col rounded-[20px] border border-border/60 bg-background/70 p-3 text-left transition hover:border-brand-500/40 hover:shadow-sm",
                    !inCurrentMonth && "opacity-45",
                    isToday(day) &&
                      "border-brand-500/50 ring-1 ring-brand-500/30",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="font-display text-lg font-semibold text-foreground">
                      {format(day, "d")}
                    </span>
                    {isToday(day) ? (
                      <Badge className="rounded-full bg-brand-500/10 text-brand-500">
                        Hoje
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-auto space-y-2">
                    <p className="text-sm font-medium text-foreground">
                      {totalMinutes === 0
                        ? "-"
                        : formatCompactDuration(totalMinutes)}
                    </p>
                    <div className="h-2 overflow-hidden rounded-full bg-muted/60">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          totalMinutes >= dailyTargetMinutes
                            ? "bg-emerald-500"
                            : totalMinutes === 0
                              ? "bg-muted"
                              : "bg-brand-500",
                        )}
                        style={{
                          width: `${Math.max(percentage * 100, totalMinutes > 0 ? 12 : 0)}%`,
                        }}
                      />
                    </div>
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
