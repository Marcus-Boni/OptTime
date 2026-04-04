"use client";

import {
  DndContext,
  type DragEndEvent,
  type DraggableAttributes,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  addWeeks,
  eachDayOfInterval,
  endOfISOWeek,
  format,
  getISOWeek,
  getISOWeekYear,
  isToday,
  isWeekend,
  startOfISOWeek,
  subWeeks,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Edit2,
  MoreVertical,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { toast } from "sonner";
import { DragDropContextMenu } from "@/components/time/DragDropContextMenu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import type { TimeEntry } from "@/hooks/use-time-entries";
import {
  getTimesheetStatusLabel,
  isTimesheetEditableStatus,
  isTimesheetLockedStatus,
  isTimesheetSubmittableStatus,
} from "@/lib/timesheet-status";
import { cn, formatDuration } from "@/lib/utils";

interface WeekViewProps {
  entries: TimeEntry[];
  referenceDate: Date;
  onReferenceDateChange: (date: Date) => void;
  dailyTargetMinutes: number;
  onDayClick: (date: Date) => void;
  onOpenCreateForDate?: (date: Date) => void;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (id: string) => void | Promise<void>;
  onDuplicate?: (entry: TimeEntry) => void;
  onMoveEntry?: (entryId: string, newDate: string) => Promise<void>;
  onDuplicateEntry?: (entryId: string, newDate: string) => Promise<void>;
  onSubmitWeek?: () => Promise<void>;
  weekTimesheetStatus?: string | null;
  weekEntryCount?: number;
  weekTotalMinutes?: number;
  /** When false, Saturday and Sunday columns are hidden */
  showWeekends?: boolean;
  onShowWeekendsChange?: (show: boolean) => void;
}

type DraggableEntryListeners = ReturnType<typeof useDraggable>["listeners"];

export function WeekView({
  entries,
  referenceDate,
  onReferenceDateChange,
  dailyTargetMinutes,
  onDayClick,
  onOpenCreateForDate,
  onEdit,
  onDelete,
  onDuplicate,
  onMoveEntry,
  onDuplicateEntry,
  onSubmitWeek,
  weekTimesheetStatus,
  weekEntryCount,
  weekTotalMinutes,
  showWeekends = true,
  onShowWeekendsChange,
}: WeekViewProps) {
  const weekStart = startOfISOWeek(referenceDate);
  const weekEnd = endOfISOWeek(referenceDate);
  const allDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const days = showWeekends ? allDays : allDays.filter((d) => !isWeekend(d));
  const weekNumber = getISOWeek(weekStart);
  const weekYear = getISOWeekYear(weekStart);
  const weekTotalMinutesValue =
    weekTotalMinutes ?? entries.reduce((sum, entry) => sum + entry.duration, 0);
  const weekEntryCountValue = weekEntryCount ?? entries.length;
  const weekTargetMinutes = dailyTargetMinutes * 5;
  const weekPercentage =
    weekTargetMinutes > 0
      ? Math.min(weekTotalMinutesValue / weekTargetMinutes, 1)
      : 0;

  const entriesByDate = useMemo(() => {
    const map = new Map<string, TimeEntry[]>();

    for (const entry of entries) {
      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }

    return map;
  }, [entries]);

  const [activeEntry, setActiveEntry] = useState<TimeEntry | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    entryId: string;
    targetDate: Date;
    position: { x: number; y: number };
  } | null>(null);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const weekLocked = isTimesheetLockedStatus(weekTimesheetStatus);
  const weekLockMessage = weekTimesheetStatus
    ? `A semana está ${getTimesheetStatusLabel(weekTimesheetStatus)} e não aceita novos lançamentos.`
    : "A semana está bloqueada para novos lançamentos.";

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
    useSensor(KeyboardSensor),
  );

  const isEntryDraggable = useCallback((entry: TimeEntry) => {
    if (weekLocked) {
      return false;
    }

    return isTimesheetEditableStatus(entry.timesheet?.status);
  }, [weekLocked]);

  const isResubmission = weekTimesheetStatus === "rejected";

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      setContextMenu(null);

      const entryId = String(event.active.id);
      const entry = entries.find((candidate) => candidate.id === entryId);

      if (entry) {
        setActiveEntry(entry);
      }
    },
    [entries],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveEntry(null);

      const { active, over } = event;
      if (!over) {
        return;
      }

      const entryId = String(active.id);
      const targetDateString = String(over.id);
      const entry = entries.find((candidate) => candidate.id === entryId);

      if (!entry || entry.date === targetDateString) {
        return;
      }

      const targetDate = days.find(
        (day) => format(day, "yyyy-MM-dd") === targetDateString,
      );

      if (!targetDate) {
        return;
      }

      const dropTarget = document.querySelector<HTMLElement>(
        `[data-droppable-id="${targetDateString}"]`,
      );
      const rect = dropTarget?.getBoundingClientRect();
      const fallbackX =
        event.activatorEvent instanceof MouseEvent
          ? event.activatorEvent.clientX
          : 0;
      const fallbackY =
        event.activatorEvent instanceof MouseEvent
          ? event.activatorEvent.clientY
          : 0;

      setContextMenu({
        entryId,
        targetDate,
        position: {
          x: rect ? rect.left + rect.width / 2 : fallbackX,
          y: rect ? rect.top + 48 : fallbackY,
        },
      });
    },
    [days, entries],
  );

  const handleMove = useCallback(async () => {
    if (!contextMenu || !onMoveEntry) {
      return;
    }

    try {
      await onMoveEntry(
        contextMenu.entryId,
        format(contextMenu.targetDate, "yyyy-MM-dd"),
      );
      toast.success("Registro movido com sucesso.");
    } catch {
      toast.error("Erro ao mover registro.");
    }
  }, [contextMenu, onMoveEntry]);

  const handleDuplicate = useCallback(async () => {
    if (!contextMenu || !onDuplicateEntry) {
      return;
    }

    try {
      await onDuplicateEntry(
        contextMenu.entryId,
        format(contextMenu.targetDate, "yyyy-MM-dd"),
      );
      toast.success("Registro duplicado com sucesso.");
    } catch {
      toast.error("Erro ao duplicar registro.");
    }
  }, [contextMenu, onDuplicateEntry]);

  const handleSubmitWeekClick = useCallback(async () => {
    if (!onSubmitWeek) {
      return;
    }

    setSubmitting(true);

    try {
      await onSubmitWeek();
      toast.success(
        isResubmission
          ? "Semana submetida novamente com sucesso."
          : "Semana submetida com sucesso.",
      );
      setConfirmSubmit(false);
    } catch {
      toast.error(
        isResubmission
          ? "Erro ao submeter a semana novamente."
          : "Erro ao submeter semana.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [isResubmission, onSubmitWeek]);

  return (
    <section className="overflow-hidden rounded-[28px] border border-border/60 bg-card/90 shadow-sm">
      {/* Header */}
      <div className="flex flex-col gap-4 border-b border-border/60 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
              onClick={() => onReferenceDateChange(subWeeks(referenceDate, 1))}
              aria-label="Semana anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 rounded-full"
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
              Ir para semana atual
            </Button>
          </div>

          <div>
            <h2 className="font-display text-2xl font-semibold text-foreground">
              {format(weekStart, "d MMM", { locale: ptBR })} -{" "}
              {format(weekEnd, "d MMM yyyy", { locale: ptBR })}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Arraste registros entre os dias para mover ou duplicar.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:items-end">
          <div className="flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-brand-500/10 px-3 py-1.5 text-brand-500">
              {formatDuration(weekTotalMinutesValue)} na semana
            </Badge>

            {weekTimesheetStatus === "submitted" ? (
              <Badge
                variant="outline"
                className="rounded-full border-amber-300 px-3 py-1.5 text-amber-600"
              >
                Submetida
              </Badge>
            ) : weekTimesheetStatus === "approved" ? (
              <Badge
                variant="outline"
                className="rounded-full border-emerald-300 px-3 py-1.5 text-emerald-600"
              >
                Aprovada
              </Badge>
            ) : onSubmitWeek && isTimesheetSubmittableStatus(weekTimesheetStatus) ? (
              <Button
                variant="outline"
                className="rounded-full"
                onClick={() => setConfirmSubmit(true)}
                disabled={weekEntryCountValue === 0}
                title={weekEntryCountValue === 0 ? "Sem registros" : undefined}
              >
                <Send className="mr-2 h-4 w-4" />
                {isResubmission ? "Submeter novamente" : "Submeter semana"}
              </Button>
            ) : null}
          </div>

          {weekLocked ? (
            <p className="max-w-sm text-right text-xs text-muted-foreground">
              {weekLockMessage}
            </p>
          ) : null}

          {/* Week progress bar + weekend toggle */}
          <div className="flex w-full flex-col gap-2 sm:w-64">
            <div className="flex items-center gap-3">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted/50">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    weekPercentage >= 1
                      ? "bg-emerald-500"
                      : weekPercentage > 0
                        ? "bg-brand-500"
                        : "bg-transparent",
                  )}
                  style={{ width: `${weekPercentage * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium text-muted-foreground">
                {Math.round(weekPercentage * 100)}%
              </span>
            </div>
            <div className="flex items-center justify-between gap-2">
              <span
                id="week-view-weekend-toggle-label"
                className="text-xs text-muted-foreground"
              >
                Exibir fins de semana
              </span>
              <Switch
                checked={showWeekends}
                onCheckedChange={onShowWeekendsChange}
                aria-label="Exibir fins de semana na visualização de semana"
                aria-labelledby="week-view-weekend-toggle-label"
              />
            </div>
          </div>
        </div>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveEntry(null)}
      >
        <div className="overflow-x-auto px-4 py-4 sm:px-5">
          <motion.div
            layout
            className={cn(
              "grid gap-2.5",
              showWeekends
                ? "min-w-[980px] grid-cols-7"
                : "min-w-[700px] grid-cols-5",
            )}
          >
            <AnimatePresence initial={false} mode="popLayout">
              {days.map((day) => {
                const dayKey = format(day, "yyyy-MM-dd");
                return (
                  <motion.div
                    key={dayKey}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{
                      duration: 0.22,
                      ease: [0.25, 0.46, 0.45, 0.94],
                      layout: { type: "spring", stiffness: 400, damping: 30 },
                    }}
                    className="min-w-0"
                  >
                    <DroppableColumn
                      day={day}
                      dayKey={dayKey}
                      entries={entriesByDate.get(dayKey) ?? []}
                      dailyTargetMinutes={dailyTargetMinutes}
                      onDayClick={onDayClick}
                      onOpenCreateForDate={onOpenCreateForDate}
                      isEntryDraggable={isEntryDraggable}
                      isLocked={weekLocked}
                      lockMessage={weekLockMessage}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onDuplicate={onDuplicate}
                    />
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </motion.div>
        </div>

        <DragOverlay>
          {activeEntry ? <EntryCard entry={activeEntry} dragging /> : null}
        </DragOverlay>
      </DndContext>

      {contextMenu ? (
        <DragDropContextMenu
          targetDate={contextMenu.targetDate}
          position={contextMenu.position}
          onMove={handleMove}
          onDuplicate={handleDuplicate}
          onClose={() => setContextMenu(null)}
        />
      ) : null}

      <AlertDialog open={confirmSubmit} onOpenChange={setConfirmSubmit}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isResubmission ? "Submeter novamente" : "Submeter"} semana {weekNumber}{" "}
              de {weekYear}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Isso {isResubmission ? "reenviará" : "enviará"}{" "}
              {weekEntryCountValue} registro(s) (
              {formatDuration(weekTotalMinutesValue)}) para aprovação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
              disabled={submitting}
              onClick={(event) => {
                event.preventDefault();
                void handleSubmitWeekClick();
              }}
            >
              {submitting
                ? isResubmission
                  ? "Submetendo novamente..."
                  : "Submetendo..."
                : isResubmission
                  ? "Submeter novamente"
                  : "Submeter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

function DroppableColumn({
  day,
  dayKey,
  entries,
  dailyTargetMinutes,
  onDayClick,
  onOpenCreateForDate,
  isEntryDraggable,
  isLocked,
  lockMessage,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  day: Date;
  dayKey: string;
  entries: TimeEntry[];
  dailyTargetMinutes: number;
  onDayClick: (date: Date) => void;
  onOpenCreateForDate?: (date: Date) => void;
  isEntryDraggable: (entry: TimeEntry) => boolean;
  isLocked: boolean;
  lockMessage: string;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (id: string) => void | Promise<void>;
  onDuplicate?: (entry: TimeEntry) => void;
}) {
  const { isOver, setNodeRef } = useDroppable({ id: dayKey });

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0);
  const percentage =
    dailyTargetMinutes > 0
      ? Math.min(Math.round((totalMinutes / dailyTargetMinutes) * 100), 100)
      : 0;
  const weekend = isWeekend(day);
  const today = isToday(day);

  return (
    <div
      ref={setNodeRef}
      data-droppable-id={dayKey}
      className={cn(
        "flex flex-col rounded-2xl border transition",
        today
          ? "border-brand-500/40 bg-brand-500/[0.02]"
          : weekend
            ? "border-border/40 bg-muted/20"
            : "border-border/60 bg-background/70 hover:border-brand-500/20",
        isOver && "border-brand-500/60 bg-brand-500/5",
      )}
    >
      {/* Day header */}
      <button
        type="button"
        onClick={() => onDayClick(day)}
        className="flex-none rounded-t-2xl px-3 pb-2 pt-3 text-left transition hover:bg-background/60"
      >
        <div className="flex items-center justify-between gap-1">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg font-display text-base font-bold",
                today ? "bg-brand-500 text-white" : "text-foreground",
              )}
            >
              {format(day, "d")}
            </span>
            <span
              className={cn(
                "text-[10px] font-semibold uppercase tracking-widest",
                today ? "text-brand-500" : "text-muted-foreground",
              )}
            >
              {format(day, "EEE", { locale: ptBR })}
            </span>
          </div>
        </div>

        <div className="mt-2">
          <div className="flex items-baseline justify-between">
            <span className="font-mono text-sm font-semibold text-foreground">
              {formatDuration(totalMinutes)}
            </span>
            <span className="text-[10px] text-muted-foreground">
              {entries.length} {entries.length === 1 ? "item" : "itens"}
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

      {/* Entry list */}
      <div
        className="flex-1 overflow-y-auto px-2 pb-1.5 pt-0.5"
        style={{ maxHeight: "360px" }}
      >
        {entries.length === 0 ? (
          <div className="flex min-h-20 flex-col items-center justify-center text-center">
            <p className="text-[11px] text-muted-foreground/60">
              Sem registros
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {entries.map((entry) => (
              <DraggableEntry
                key={entry.id}
                entry={entry}
                isDraggable={isEntryDraggable(entry)}
                onEdit={onEdit}
                onDelete={onDelete}
                onDuplicate={onDuplicate}
              />
            ))}
          </div>
        )}
      </div>

      {/* Add button */}
      <div className="flex-none px-2 pb-2.5 pt-1">
        <button
          type="button"
          onClick={() =>
            onOpenCreateForDate ? onOpenCreateForDate(day) : onDayClick(day)
          }
          disabled={isLocked}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-border/60 py-2 text-xs text-muted-foreground transition hover:border-[#16a34a]/40 hover:bg-[#16a34a]/5 hover:text-[#16a34a]"
          title={isLocked ? lockMessage : undefined}
        >
          <Plus className="h-3.5 w-3.5" />
          <span className="font-medium">Adicionar</span>
        </button>
      </div>
    </div>
  );
}

function DraggableEntry({
  entry,
  isDraggable,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  entry: TimeEntry;
  isDraggable: boolean;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (id: string) => void | Promise<void>;
  onDuplicate?: (entry: TimeEntry) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({
      id: entry.id,
      disabled: !isDraggable,
    });

  return (
    <EntryCard
      nodeRef={setNodeRef}
      entry={entry}
      dragging={isDragging}
      isDraggable={isDraggable}
      attributes={attributes}
      listeners={listeners}
      transform={
        !isDragging && transform ? CSS.Translate.toString(transform) : undefined
      }
      onEdit={onEdit}
      onDelete={onDelete}
      onDuplicate={onDuplicate}
    />
  );
}

function EntryCard({
  entry,
  dragging = false,
  isDraggable = false,
  attributes,
  listeners,
  transform,
  nodeRef,
  onEdit,
  onDelete,
  onDuplicate,
}: {
  entry: TimeEntry;
  dragging?: boolean;
  isDraggable?: boolean;
  attributes?: DraggableAttributes;
  listeners?: DraggableEntryListeners;
  transform?: string;
  nodeRef?: (element: HTMLDivElement | null) => void;
  onEdit?: (entry: TimeEntry) => void;
  onDelete?: (id: string) => void | Promise<void>;
  onDuplicate?: (entry: TimeEntry) => void;
}) {
  const isEditable =
    isTimesheetEditableStatus(entry.timesheet?.status) &&
    !isTimesheetLockedStatus(entry.timesheet?.status);

  return (
    <div
      ref={nodeRef}
      {...attributes}
      {...listeners}
      className={cn(
        "group overflow-hidden rounded-xl border bg-card/90 transition hover:border-brand-500/30",
        isDraggable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
      style={{
        borderLeftColor: entry.project.color,
        borderLeftWidth: "3px",
        borderTopColor: undefined,
        borderRightColor: undefined,
        borderBottomColor: undefined,
        touchAction: isDraggable ? "none" : undefined,
        transform,
      }}
    >
      <div className="flex gap-2 p-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-semibold text-muted-foreground">
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
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-md bg-muted/40 px-1.5 py-0.5 font-mono text-[11px] font-bold tabular-nums text-foreground">
            {formatDuration(entry.duration)}
          </span>

          {isEditable && (onEdit || onDelete || onDuplicate) ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 rounded-full text-muted-foreground/70 opacity-60 transition hover:bg-transparent hover:text-foreground md:opacity-0 md:group-hover:opacity-100"
                  onClick={(event) => event.stopPropagation()}
                  onPointerDown={(event) => event.stopPropagation()}
                >
                  <MoreVertical className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {onDuplicate ? (
                  <DropdownMenuItem onClick={() => onDuplicate(entry)}>
                    <Copy className="mr-2 h-3.5 w-3.5" />
                    Duplicar
                  </DropdownMenuItem>
                ) : null}
                {onEdit ? (
                  <DropdownMenuItem onClick={() => onEdit(entry)}>
                    <Edit2 className="mr-2 h-3.5 w-3.5" />
                    Editar
                  </DropdownMenuItem>
                ) : null}
                {onDelete ? (
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    onClick={() => onDelete(entry.id)}
                  >
                    <Trash2 className="mr-2 h-3.5 w-3.5" />
                    Excluir
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </div>
    </div>
  );
}
