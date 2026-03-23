"use client";

import {
  addDays,
  eachDayOfInterval,
  endOfISOWeek,
  format,
  isSameDay,
  isToday,
  startOfISOWeek,
  subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMemo } from "react";
import { TimeEntryCard } from "@/components/time/TimeEntryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type OutlookEvent,
  useOutlookEvents,
} from "@/hooks/use-outlook-events";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { formatDuration } from "@/lib/utils";

interface DayViewProps {
  entries: TimeEntry[];
  selectedDate: Date;
  onSelectedDateChange: (date: Date) => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
  onDuplicate: (entry: TimeEntry) => void;
  onCreateFromOutlook: (event: OutlookEvent) => void;
  onOpenCreate: () => void;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR");
}

export function DayView({
  entries,
  selectedDate,
  onSelectedDateChange,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateFromOutlook,
  onOpenCreate,
}: DayViewProps) {
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const weekDays = eachDayOfInterval({
    start: startOfISOWeek(selectedDate),
    end: endOfISOWeek(selectedDate),
  });

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDateStr),
    [entries, selectedDateStr],
  );
  const totalMinutes = dayEntries.reduce(
    (sum, entry) => sum + entry.duration,
    0,
  );

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();
    for (const entry of entries) {
      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }
    return map;
  }, [entries]);

  const outlook = useOutlookEvents({
    startDate: selectedDateStr,
    endDate: selectedDateStr,
    enabled: true,
  });

  const importedDescriptions = useMemo(
    () => new Set(dayEntries.map((entry) => normalizeText(entry.description))),
    [dayEntries],
  );

  const pendingMeetings = outlook.events.filter(
    (event) => !importedDescriptions.has(normalizeText(event.subject)),
  );

  return (
    <div className="space-y-4">
      <section className="rounded-[28px] border border-border/60 bg-card/90 p-5 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={() => onSelectedDateChange(subDays(selectedDate, 1))}
                aria-label="Dia anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                className="rounded-full"
                onClick={() => onSelectedDateChange(addDays(selectedDate, 1))}
                aria-label="Próximo dia"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div>
              <h2 className="font-display text-3xl font-semibold text-foreground">
                {isToday(selectedDate) ? "Hoje:" : ""}{" "}
                {format(selectedDate, "EEEE, d MMM", { locale: ptBR })}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Registro simples, rápido e orientado ao dia.
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Badge className="rounded-full bg-brand-500/10 px-3 py-1.5 text-brand-500">
              {formatDuration(totalMinutes)} no dia
            </Badge>
            <Button
              className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
              onClick={onOpenCreate}
            >
              <Plus className="mr-2 h-4 w-4" />
              Registrar tempo
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-3 xl:grid-cols-[88px_minmax(0,1fr)]">
          <Button
            className="h-16 rounded-[22px] bg-[#1f8f3a] text-white hover:bg-[#187330] xl:h-[88px] xl:w-[72px]"
            onClick={onOpenCreate}
          >
            <Plus className="h-6 w-6" />
          </Button>

          <div className="grid gap-3 sm:grid-cols-4 xl:grid-cols-8">
            {weekDays.map((day) => {
              const dayKey = format(day, "yyyy-MM-dd");
              const dayMinutes = (entriesByDate.get(dayKey) ?? []).reduce(
                (sum, entry) => sum + entry.duration,
                0,
              );

              return (
                <button
                  key={dayKey}
                  type="button"
                  onClick={() => onSelectedDateChange(day)}
                  className={
                    "rounded-[20px] border px-3 py-3 text-left transition " +
                    (isSameDay(day, selectedDate)
                      ? "border-brand-500/50 bg-brand-500/5"
                      : "border-border/60 bg-background/70 hover:border-brand-500/30")
                  }
                >
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">
                    {format(day, "EEE", { locale: ptBR })}
                  </p>
                  <p className="mt-2 text-lg font-semibold text-foreground">
                    {format(day, "d")}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDuration(dayMinutes)}
                  </p>
                  {isToday(day) ? (
                    <p className="mt-2 text-[11px] font-medium text-brand-500">
                      Hoje
                    </p>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>

        {outlook.connected !== false && pendingMeetings.length > 0 ? (
          <div className="mt-4 flex flex-col gap-3 rounded-[22px] border border-brand-500/20 bg-brand-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">
                {pendingMeetings.length} reuniões disponíveis para completar o
                dia
              </p>
              <p className="text-sm text-muted-foreground">
                Use a próxima reunião ou abra a agenda lateral no modal.
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => onCreateFromOutlook(pendingMeetings[0])}
              >
                Usar próxima reunião
              </Button>
              <Button className="rounded-full" onClick={onOpenCreate}>
                Abrir agenda
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <section className="rounded-[28px] border border-border/60 bg-card/85 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-5 py-4 sm:px-6">
          <div>
            <h3 className="font-display text-lg font-semibold text-foreground">
              Horas do dia
            </h3>
            <p className="text-sm text-muted-foreground">
              Lista direta para editar, duplicar ou ajustar.
            </p>
          </div>
          <span className="text-sm text-muted-foreground">
            {dayEntries.length} itens
          </span>
        </div>

        <div className="space-y-0 px-5 py-2 sm:px-6">
          {dayEntries.length === 0 ? (
            <div className="px-2 py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Nenhum lançamento registrado para este dia.
              </p>
              <Button
                variant="outline"
                className="mt-4 rounded-full"
                onClick={onOpenCreate}
              >
                <Plus className="mr-2 h-4 w-4" />
                Criar primeiro lançamento
              </Button>
            </div>
          ) : (
            dayEntries.map((entry) => (
              <TimeEntryCard
                key={entry.id}
                entry={entry}
                onEdit={onEdit}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
              />
            ))
          )}
        </div>
      </section>
    </div>
  );
}
