"use client";

import {
  addDays,
  eachDayOfInterval,
  endOfISOWeek,
  format,
  isSameDay,
  isToday,
  isWeekend,
  startOfISOWeek,
  subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Plus,
  Zap,
  CalendarClock,
} from "lucide-react";
import { useMemo } from "react";
import { SmartSuggestionsPanel } from "@/components/time/SmartSuggestionsPanel";
import { TimeEntryCard } from "@/components/time/TimeEntryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  type OutlookEvent,
  useOutlookEvents,
} from "@/hooks/use-outlook-events";
import type { TimeEntry } from "@/hooks/use-time-entries";
import type {
  TimeSuggestion,
  TimeSuggestionCommit,
} from "@/hooks/use-time-suggestions";
import { getTimesheetStatusLabel } from "@/lib/timesheet-status";
import { cn, formatDuration } from "@/lib/utils";

interface DayViewProps {
  entries: TimeEntry[];
  selectedDate: Date;
  selectedDateLocked: boolean;
  selectedDateLockStatus?: string | null;
  onSelectedDateChange: (date: Date) => void;
  onEdit: (entry: TimeEntry) => void;
  onDelete: (id: string) => void;
  onDuplicate: (entry: TimeEntry) => void;
  onCreateFromOutlook: (event: OutlookEvent) => void;
  onOpenCreate: () => void;
  assistantEnabled: boolean;
  suggestions: TimeSuggestion[];
  suggestionsLoading: boolean;
  suggestionsError: string | null;
  onAssistantEnabledChange: (enabled: boolean) => void;
  onRetrySuggestions: () => void;
  onApplySuggestion: (suggestion: TimeSuggestion) => void;
  onApplySuggestionCommit: (
    suggestion: TimeSuggestion,
    commit: TimeSuggestionCommit,
  ) => void;
  appliedSuggestionCommitKeys: string[];
  onEditSuggestion: (suggestion: TimeSuggestion) => void;
  onIgnoreSuggestion: (suggestion: TimeSuggestion) => void;
  /** When false, Saturday and Sunday are hidden from the week strip */
  showWeekends?: boolean;
  onShowWeekendsChange?: (show: boolean) => void;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR");
}

const dailyTarget = 8 * 60;

export function DayView({
  entries,
  selectedDate,
  selectedDateLocked,
  selectedDateLockStatus,
  onSelectedDateChange,
  onEdit,
  onDelete,
  onDuplicate,
  onCreateFromOutlook,
  onOpenCreate,
  assistantEnabled,
  suggestions,
  suggestionsLoading,
  suggestionsError,
  onAssistantEnabledChange,
  onRetrySuggestions,
  onApplySuggestion,
  onApplySuggestionCommit,
  appliedSuggestionCommitKeys,
  onEditSuggestion,
  onIgnoreSuggestion,
  showWeekends = true,
  onShowWeekendsChange,
}: DayViewProps) {
  const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
  const allWeekDays = eachDayOfInterval({
    start: startOfISOWeek(selectedDate),
    end: endOfISOWeek(selectedDate),
  });
  const weekDays = showWeekends
    ? allWeekDays
    : allWeekDays.filter((d) => !isWeekend(d));

  const dayEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDateStr),
    [entries, selectedDateStr],
  );
  const totalMinutes = dayEntries.reduce(
    (sum: number, entry: TimeEntry) => sum + entry.duration,
    0,
  );
  const percentage =
    dailyTarget > 0 ? Math.min(totalMinutes / dailyTarget, 1) : 0;
  const remainingMinutes = dailyTarget - totalMinutes;
  const isComplete = remainingMinutes <= 0;
  const lockMessage = selectedDateLockStatus
    ? `A semana deste dia já foi ${getTimesheetStatusLabel(selectedDateLockStatus)}.`
    : "Este dia está bloqueado para novos lançamentos.";

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
    <div className="space-y-3">
      {/* Header card */}
      <section className="rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
        {/* Title row */}
        <div className="flex flex-col gap-3 px-6 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onSelectedDateChange(subDays(selectedDate, 1))}
              aria-label="Dia anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <h2 className="font-display text-xl font-semibold text-foreground">
              {isToday(selectedDate) && (
                <span className="mr-1 text-brand-500">Hoje,</span>
              )}
              {format(selectedDate, "EEEE, d 'de' MMMM", { locale: ptBR })}
            </h2>

            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onSelectedDateChange(addDays(selectedDate, 1))}
              aria-label="Próximo dia"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>

            {!isToday(selectedDate) && (
              <Button
                variant="ghost"
                size="sm"
                className="rounded-full text-xs text-muted-foreground"
                onClick={() => onSelectedDateChange(new Date())}
              >
                Ir para hoje
              </Button>
            )}
          </div>

          <Button
            size="default"
            className="rounded-full bg-brand-500 px-5 text-white hover:bg-brand-600"
            onClick={onOpenCreate}
            disabled={selectedDateLocked}
            title={selectedDateLocked ? lockMessage : undefined}
          >
            <Plus className="mr-2 h-4 w-4" />
            Registrar tempo
          </Button>
        </div>

        {selectedDateLocked ? (
          <div className="px-6 pt-3">
            <div className="rounded-2xl border border-amber-300/60 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300">
              {lockMessage}
            </div>
          </div>
        ) : null}

        {/* Week strip */}
        <div className="mt-5 px-6">
          <motion.div
            layout
            className={cn(
              "grid gap-1.5 transition-none",
              showWeekends ? "grid-cols-7" : "grid-cols-5",
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {weekDays.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                const dayMinutes = (entriesByDate.get(dayKey) ?? []).reduce(
                  (sum: number, entry: TimeEntry) => sum + entry.duration,
                  0,
                );
                const selected = isSameDay(day, selectedDate);
                const today = isToday(day);
                const weekend = isWeekend(day);
                const dayPct =
                  dailyTarget > 0 ? Math.min(dayMinutes / dailyTarget, 1) : 0;
                const dayComplete = dayPct >= 1;

                return (
                  <motion.div
                    key={dayKey}
                    layout
                    initial={{ opacity: 0, scale: 0.85 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.85 }}
                    transition={{
                      duration: 0.22,
                      ease: [0.25, 0.46, 0.45, 0.94],
                      layout: { type: "spring", stiffness: 400, damping: 30 },
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onSelectedDateChange(day)}
                      className={cn(
                        "flex w-full flex-col items-center gap-2 rounded-2xl px-1 py-3 transition-colors",
                        selected
                          ? "bg-foreground/5 ring-1 ring-foreground/10"
                          : "hover:bg-muted/40",
                        weekend && !selected && "opacity-50",
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                        {format(day, "EEE", { locale: ptBR })}
                      </span>

                      {/* Day number chip */}
                      <span
                        className={cn(
                          "flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold",
                          selected && today
                            ? "bg-brand-500 text-white"
                            : selected
                              ? "bg-foreground text-background"
                              : today
                                ? "text-brand-500"
                                : "text-foreground",
                        )}
                      >
                        {format(day, "d")}
                      </span>

                      {/* Duration */}
                      <span
                        className={cn(
                          "text-[10px] font-medium",
                          dayMinutes > 0
                            ? "text-foreground/70"
                            : "text-muted-foreground/40",
                        )}
                      >
                        {dayMinutes > 0 ? formatDuration(dayMinutes) : "—"}
                      </span>

                      {/* Progress bar */}
                      <div className="h-1 w-full overflow-hidden rounded-full bg-muted/50">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            dayComplete
                              ? "bg-emerald-500"
                              : dayMinutes > 0
                                ? "bg-brand-500"
                                : "bg-transparent",
                          )}
                          style={{
                            width: `${Math.max(dayPct * 100, dayMinutes > 0 ? 10 : 0)}%`,
                          }}
                        />
                      </div>
                    </button>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </div>

        {/* Daily progress */}
        <div className="px-6 pb-6 pt-4">
          <div className="flex items-center gap-4">
            <Clock className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="flex flex-1 items-center gap-3">
              <span className="min-w-fit text-sm font-medium text-foreground">
                {formatDuration(totalMinutes)}
                <span className="ml-1 font-normal text-muted-foreground">
                  / {formatDuration(dailyTarget)}
                </span>
              </span>
              <div className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-muted/50">
                <motion.div
                  className={cn(
                    "h-full rounded-full",
                    isComplete ? "bg-emerald-500" : "bg-brand-500",
                  )}
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.min(percentage * 100, 100)}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <span className="min-w-fit text-xs text-muted-foreground">
                {isComplete
                  ? remainingMinutes < 0
                    ? `+${formatDuration(Math.abs(remainingMinutes))}`
                    : "Completo"
                  : `faltam ${formatDuration(remainingMinutes)}`}
              </span>
            </div>
          </div>
        </div>

        <div className="border-t border-border/60 px-6 py-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center justify-between gap-3">
              <span
                id="time-weekend-toggle-label"
                className="text-xs font-medium text-muted-foreground"
              >
                Exibir finais de semana
              </span>
              <Switch
                checked={showWeekends}
                onCheckedChange={onShowWeekendsChange}
                aria-label="Exibir finais de semana na visualização de dia"
                aria-labelledby="time-weekend-toggle-label"
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span
                id="time-assistant-toggle-label"
                className="text-xs font-medium text-muted-foreground"
              >
                Assistente inteligente de horas
              </span>
              <Switch
                checked={assistantEnabled}
                onCheckedChange={onAssistantEnabledChange}
                aria-label="Ativar assistente inteligente de horas"
                aria-labelledby="time-assistant-toggle-label"
              />
            </div>
          </div>
        </div>
      </section>

      <AnimatePresence mode="popLayout">
        <SmartSuggestionsPanel
          enabled={assistantEnabled}
          suggestions={suggestions}
          loading={suggestionsLoading}
          error={suggestionsError}
          actionsDisabled={selectedDateLocked}
          actionsDisabledReason={lockMessage}
          onRetry={onRetrySuggestions}
          onApply={onApplySuggestion}
          onApplyCommit={onApplySuggestionCommit}
          appliedCommitKeys={appliedSuggestionCommitKeys}
          onEditAndApply={onEditSuggestion}
          onIgnore={onIgnoreSuggestion}
        />
      </AnimatePresence>

      {/* Meeting indicator */}
      {outlook.connected !== false && pendingMeetings.length > 0 && (
        <section className="rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
          <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted/50">
                <Calendar className="h-4 w-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">
                  {pendingMeetings.length}{" "}
                  {pendingMeetings.length === 1
                    ? "reunião disponível"
                    : "reuniões disponíveis"}{" "}
                  <Badge
                    variant="secondary"
                    className="ml-1 rounded-full px-2 py-0 text-[10px]"
                  >
                    Outlook
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  Importe para completar o dia rapidamente
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={onOpenCreate}
                disabled={selectedDateLocked}
                title={selectedDateLocked ? lockMessage : undefined}
              >
                <Calendar className="mr-1.5 h-3.5 w-3.5" />
                Ver agenda
              </Button>
              <Button
                size="sm"
                className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
                onClick={() => onCreateFromOutlook(pendingMeetings[0])}
                disabled={selectedDateLocked}
                title={selectedDateLocked ? lockMessage : undefined}
              >
                <Zap className="mr-1.5 h-3.5 w-3.5" />
                Importar próxima
              </Button>
            </div>
          </div>

          {/* Meeting chips */}
          {pendingMeetings.length > 1 && (
            <TooltipProvider delayDuration={0}>
              <div className="border-t border-border/40 px-5 py-3">
                <div className="flex flex-wrap gap-2">
                  {pendingMeetings.slice(0, 5).map((meeting) => (
                    <Tooltip key={meeting.id}>
                      <TooltipTrigger asChild>
                        <motion.button
                          type="button"
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => onCreateFromOutlook(meeting)}
                          disabled={selectedDateLocked}
                          className={cn(
                            "group flex items-center gap-2 rounded-lg border border-border/60 bg-muted/20 px-2.5 py-1.5 text-xs text-foreground/80 transition-colors",
                            "hover:border-brand-500/30 hover:bg-brand-500/5 hover:text-brand-600 dark:hover:text-brand-400",
                            selectedDateLocked && "opacity-50 cursor-not-allowed",
                          )}
                        >
                          <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-muted/50 group-hover:bg-brand-500/10">
                            <CalendarClock className="h-2.5 w-2.5 text-muted-foreground group-hover:text-brand-500" />
                          </div>
                          <span className="max-w-[220px] truncate font-medium">
                            {meeting.subject || "Sem título"}
                          </span>
                        </motion.button>
                      </TooltipTrigger>
                      <TooltipContent side="bottom" className="max-w-xs">
                        {meeting.subject || "Sem título"}
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {pendingMeetings.length > 5 && (
                    <div className="flex items-center rounded-lg border border-border/40 bg-muted/10 px-2 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      +{pendingMeetings.length - 5} MAIS
                    </div>
                  )}
                </div>
              </div>
            </TooltipProvider>
          )}
        </section>
      )}

      {/* Entries list */}
      <section className="rounded-[28px] border border-border/60 bg-card/85 shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-border/60 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <h3 className="font-display text-base font-semibold text-foreground">
              Lançamentos
            </h3>
            <span className="rounded-full bg-muted/60 px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {dayEntries.length}
            </span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="rounded-full text-xs text-muted-foreground hover:text-foreground"
            onClick={onOpenCreate}
            disabled={selectedDateLocked}
            title={selectedDateLocked ? lockMessage : undefined}
          >
            <Plus className="mr-1 h-3.5 w-3.5" />
            Adicionar
          </Button>
        </div>

        <div className="px-3 py-2 sm:px-4">
          {dayEntries.length === 0 ? (
            <div className="flex flex-col items-center gap-3 px-2 py-12 text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted/40">
                <Clock className="h-5 w-5 text-muted-foreground/50" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">
                  Nenhum lançamento ainda
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Comece registrando seu primeiro tempo do dia
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 rounded-full"
                onClick={onOpenCreate}
                disabled={selectedDateLocked}
                title={selectedDateLocked ? lockMessage : undefined}
              >
                <Plus className="mr-1.5 h-3.5 w-3.5" />
                Criar primeiro lançamento
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/40">
              {dayEntries.map((entry, index) => (
                <motion.div
                  key={entry.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                >
                  <TimeEntryCard
                    entry={entry}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onDuplicate={onDuplicate}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
