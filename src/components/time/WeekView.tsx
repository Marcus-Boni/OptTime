"use client";

import {
  addWeeks,
  eachDayOfInterval,
  endOfISOWeek,
  format,
  isToday,
  startOfISOWeek,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { cn, formatDuration } from "@/lib/utils";

interface WeekViewProps {
  entries: TimeEntry[];
  referenceDate: Date;
  onReferenceDateChange: (date: Date) => void;
  dailyTargetMinutes: number;
  onDayClick: (date: Date) => void;
  onOpenCreate: () => void;
  onOpenCreateForDate?: (date: Date) => void;
}

export function WeekView({
  entries,
  referenceDate,
  onReferenceDateChange,
  dailyTargetMinutes,
  onDayClick,
  onOpenCreate,
  onOpenCreateForDate,
}: WeekViewProps) {
  const weekStart = startOfISOWeek(referenceDate);
  const weekEnd = endOfISOWeek(referenceDate);
  const days = eachDayOfInterval({ start: weekStart, end: weekEnd });

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();

    for (const entry of entries) {
      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }

    return map;
  }, [entries]);

  const weekTotalMinutes = entries.reduce(
    (sum, entry) => sum + entry.duration,
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
              onClick={() => onReferenceDateChange(subWeeks(referenceDate, 1))}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="rounded-full"
              onClick={() => onReferenceDateChange(addWeeks(referenceDate, 1))}
              aria-label="Próxima semana"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="rounded-full"
              onClick={() => onReferenceDateChange(new Date())}
            >
              Semana atual
            </Button>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-foreground">
              {format(weekStart, "d MMM", { locale: ptBR })} -{" "}
              {format(weekEnd, "d MMM yyyy", { locale: ptBR })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Veja a semana como colunas simples e abra qualquer dia para
              detalhar.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Badge className="rounded-full bg-brand-500/10 px-3 py-1.5 text-brand-500">
            {formatDuration(weekTotalMinutes)} na semana
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

      <div className="overflow-x-auto px-5 py-5 sm:px-6">
        <div className="grid min-w-[980px] grid-cols-7 gap-3">
          {days.map((day) => {
            const dayKey = format(day, "yyyy-MM-dd");
            const dayEntries = entriesByDate.get(dayKey) ?? [];
            const totalMinutes = dayEntries.reduce(
              (sum, entry) => sum + entry.duration,
              0,
            );
            const percentage =
              dailyTargetMinutes > 0
                ? Math.min(
                    Math.round((totalMinutes / dailyTargetMinutes) * 100),
                    100,
                  )
                : 0;

            return (
              <div
                key={dayKey}
                className={cn(
                  "flex flex-col rounded-[24px] border border-border/60 bg-background/70 transition",
                  isToday(day)
                    ? "border-brand-500/40 bg-brand-500/[0.02]"
                    : "hover:border-brand-500/20",
                )}
              >
                {/* Column header — clickable to navigate to day view */}
                <button
                  type="button"
                  onClick={() => onDayClick(day)}
                  className="flex-none rounded-t-[24px] p-4 text-left transition hover:bg-background/60"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                        {format(day, "EEE", { locale: ptBR })}
                      </p>
                      <h3
                        className={cn(
                          "mt-1 font-display text-2xl font-semibold",
                          isToday(day)
                            ? "text-brand-500"
                            : "text-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </h3>
                    </div>
                    {isToday(day) ? (
                      <Badge className="rounded-full bg-brand-500/10 text-[10px] text-brand-500">
                        Hoje
                      </Badge>
                    ) : null}
                  </div>

                  <div className="mt-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">
                        {dayEntries.length}{" "}
                        {dayEntries.length === 1 ? "item" : "itens"}
                      </span>
                      <span className="font-mono font-medium text-foreground">
                        {formatDuration(totalMinutes)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/50">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          percentage >= 100
                            ? "bg-emerald-500"
                            : percentage > 0
                              ? "bg-brand-500"
                              : "bg-transparent",
                        )}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                </button>

                {/* Entries — scrollable, all shown */}
                <div className="flex-1 overflow-y-auto px-3 pb-2 pt-1" style={{ maxHeight: "320px" }}>
                  {dayEntries.length === 0 ? (
                    <div className="flex min-h-[80px] flex-col items-center justify-center text-center">
                      <p className="text-xs text-muted-foreground">
                        Sem registros
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {dayEntries.map((entry) => (
                        <div
                          key={entry.id}
                          className="overflow-hidden rounded-[16px] border border-border/60 bg-card/90 transition hover:border-brand-500/30"
                          style={{ borderLeftColor: entry.project.color, borderLeftWidth: "3px" }}
                        >
                          <div className="flex gap-2 p-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[11px] font-medium text-muted-foreground">
                                {entry.project.name}
                              </p>
                              <p className="mt-0.5 line-clamp-2 text-xs leading-snug text-foreground">
                                {entry.description || (
                                  <span className="italic text-muted-foreground">
                                    Sem descrição
                                  </span>
                                )}
                              </p>
                            </div>
                            <span className="shrink-0 font-mono text-xs font-semibold text-foreground">
                              {formatDuration(entry.duration)}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Add button per column */}
                <div className="flex-none px-3 pb-3 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      onOpenCreateForDate
                        ? onOpenCreateForDate(day)
                        : onDayClick(day)
                    }
                    className="flex w-full items-center justify-center gap-1 rounded-[16px] border border-dashed border-border/60 py-2 text-xs text-muted-foreground transition hover:border-brand-500/40 hover:text-brand-500"
                  >
                    <Plus className="h-3 w-3" />
                    Adicionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
