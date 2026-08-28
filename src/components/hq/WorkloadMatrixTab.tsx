"use client";

import {
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  AlertTriangle,
  GripVertical,
  Moon,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useHqWorkload } from "@/hooks/use-hq";
import { cn, formatDuration } from "@/lib/utils";
import type {
  UtilizationLevel,
  WorkloadCell,
  WorkloadRow,
  WorkloadWeekDescriptor,
} from "@/types/hq";

const LEVEL_STYLES: Record<UtilizationLevel, string> = {
  empty: "bg-muted/40 text-muted-foreground",
  low: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  ok: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  full: "bg-emerald-500/25 text-emerald-700 dark:text-emerald-300",
  over: "bg-red-500/15 text-red-600 dark:text-red-400",
};

const LEVEL_LABELS: Record<UtilizationLevel, string> = {
  empty: "Sem horas",
  low: "Ociosidade",
  ok: "Saudável",
  full: "Alocação cheia",
  over: "Sobrecarga",
};

interface PlannerProject {
  id: string;
  name: string;
  code: string;
  color: string;
}

interface DialogState {
  userId: string;
  userName: string;
  week: string;
  weekLabel: string;
  projectId: string | null;
}

// ─── Draggable project chip ───────────────────────────────────────────

function ProjectChip({
  project,
  dragging,
}: {
  project: PlannerProject;
  dragging?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex cursor-grab items-center gap-1.5 rounded-full border border-border/60 bg-card px-2.5 py-1 text-xs font-medium shadow-sm transition-colors hover:border-brand-500/40",
        dragging && "cursor-grabbing opacity-90 shadow-lg",
      )}
    >
      <GripVertical
        className="size-3 text-muted-foreground"
        aria-hidden="true"
      />
      <span
        className="size-2 rounded-full"
        style={{ backgroundColor: project.color }}
        aria-hidden="true"
      />
      {project.name}
    </span>
  );
}

function DraggableProjectChip({ project }: { project: PlannerProject }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `project:${project.id}`,
    data: { projectId: project.id },
  });

  return (
    <button
      ref={setNodeRef}
      type="button"
      className={cn("touch-none", isDragging && "opacity-40")}
      aria-label={`Arrastar projeto ${project.name} para uma semana futura`}
      {...listeners}
      {...attributes}
    >
      <ProjectChip project={project} />
    </button>
  );
}

// ─── Matrix cell ──────────────────────────────────────────────────────

interface MatrixCellProps {
  row: WorkloadRow;
  cell: WorkloadCell;
  week: WorkloadWeekDescriptor;
  onPlan: (state: DialogState) => void;
  onRemoveAllocation: (allocationId: string) => void;
}

function MatrixCell({
  row,
  cell,
  week,
  onPlan,
  onRemoveAllocation,
}: MatrixCellProps) {
  const droppableId = `${row.userId}|${week.week}`;
  const { setNodeRef, isOver } = useDroppable({
    id: droppableId,
    data: { userId: row.userId, week: week.week },
    disabled: !week.isFuture,
  });

  const minutes = week.isFuture ? cell.plannedMinutes : cell.actualMinutes;

  if (!week.isFuture) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={cn(
              "flex h-14 flex-col items-center justify-center rounded-lg text-xs transition-colors",
              LEVEL_STYLES[cell.level],
              week.isCurrent && "ring-1 ring-brand-500/50",
            )}
          >
            <span className="font-mono text-sm font-semibold">
              {minutes > 0 ? formatDuration(minutes) : "—"}
            </span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top">
          <p className="text-xs">
            {row.name} · {week.label}
            <br />
            {LEVEL_LABELS[cell.level]}
            {minutes > 0
              ? ` · ${formatDuration(minutes)} de ${formatDuration(row.capacityMinutes)}`
              : ""}
          </p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "group/cell flex h-14 flex-col justify-center gap-0.5 rounded-lg border border-dashed border-border/60 px-1.5 text-xs transition-colors",
        cell.plannedMinutes > 0 && LEVEL_STYLES[cell.level],
        isOver && "border-brand-500 bg-brand-500/10",
      )}
    >
      {cell.allocations.length === 0 ? (
        <button
          type="button"
          onClick={() =>
            onPlan({
              userId: row.userId,
              userName: row.name,
              week: week.week,
              weekLabel: week.label,
              projectId: null,
            })
          }
          className="flex h-full w-full items-center justify-center rounded text-muted-foreground/50 transition-colors hover:text-brand-500"
          aria-label={`Planejar alocação de ${row.name} na semana ${week.label}`}
        >
          <Plus className="size-4" aria-hidden="true" />
        </button>
      ) : (
        <>
          <div className="flex items-center justify-between gap-1">
            <span className="font-mono text-[11px] font-semibold">
              {formatDuration(cell.plannedMinutes)}
            </span>
            <button
              type="button"
              onClick={() =>
                onPlan({
                  userId: row.userId,
                  userName: row.name,
                  week: week.week,
                  weekLabel: week.label,
                  projectId: null,
                })
              }
              className="rounded p-0.5 text-muted-foreground/50 opacity-0 transition-opacity hover:text-brand-500 group-hover/cell:opacity-100"
              aria-label={`Adicionar alocação para ${row.name} na semana ${week.label}`}
            >
              <Plus className="size-3" aria-hidden="true" />
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-0.5 overflow-hidden">
            {cell.allocations.slice(0, 3).map((slice) => (
              <Tooltip key={slice.allocationId}>
                <TooltipTrigger asChild>
                  <span className="inline-flex max-w-full items-center gap-1 rounded bg-background/70 px-1 py-px text-[10px]">
                    <span
                      className="size-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: slice.projectColor }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{slice.projectName}</span>
                    <button
                      type="button"
                      onClick={() => onRemoveAllocation(slice.allocationId)}
                      className="text-muted-foreground/60 transition-colors hover:text-red-400"
                      aria-label={`Remover alocação de ${slice.projectName}`}
                    >
                      <X className="size-2.5" aria-hidden="true" />
                    </button>
                  </span>
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="text-xs">
                    {slice.projectName} · {formatDuration(slice.plannedMinutes)}
                    {slice.note ? (
                      <>
                        <br />
                        {slice.note}
                      </>
                    ) : null}
                  </p>
                </TooltipContent>
              </Tooltip>
            ))}
            {cell.allocations.length > 3 ? (
              <span className="text-[10px] text-muted-foreground">
                +{cell.allocations.length - 3}
              </span>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Allocation dialog ────────────────────────────────────────────────

interface AllocationDialogProps {
  state: DialogState | null;
  projects: PlannerProject[];
  onClose: () => void;
  onSave: (input: {
    userId: string;
    projectId: string;
    week: string;
    plannedMinutes: number;
    note: string | null;
  }) => Promise<void>;
}

function AllocationDialog({
  state,
  projects,
  onClose,
  onSave,
}: AllocationDialogProps) {
  const [projectId, setProjectId] = useState<string>("");
  const [hours, setHours] = useState<string>("20");
  const [note, setNote] = useState<string>("");
  const [saving, setSaving] = useState(false);

  // Reset the form whenever a different cell opens the dialog.
  const [lastKey, setLastKey] = useState<string | null>(null);
  const dialogKey = state
    ? `${state.userId}|${state.week}|${state.projectId ?? ""}`
    : null;
  if (dialogKey !== lastKey) {
    setLastKey(dialogKey);
    setProjectId(state?.projectId ?? "");
    setHours("20");
    setNote("");
  }

  async function handleSave() {
    if (!state) return;

    const parsedHours = Number(hours.replace(",", "."));
    if (!projectId) {
      toast.error("Selecione um projeto.");
      return;
    }
    if (
      !Number.isFinite(parsedHours) ||
      parsedHours < 0.25 ||
      parsedHours > 100
    ) {
      toast.error("Informe entre 0,25h e 100h.");
      return;
    }

    setSaving(true);
    try {
      await onSave({
        userId: state.userId,
        projectId,
        week: state.week,
        plannedMinutes: Math.round(parsedHours * 60),
        note: note.trim() || null,
      });
      toast.success("Alocação planejada.");
      onClose();
    } catch (error: unknown) {
      console.error("[WorkloadMatrixTab] handleSave:", error);
      toast.error(
        error instanceof Error ? error.message : "Erro ao salvar alocação.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={state !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Planejar alocação</DialogTitle>
          <DialogDescription>
            {state ? `${state.userName} · semana de ${state.weekLabel}` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="allocation-project">Projeto</Label>
            <Select value={projectId} onValueChange={setProjectId}>
              <SelectTrigger id="allocation-project" className="w-full">
                <SelectValue placeholder="Selecione o projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="size-2 rounded-full"
                        style={{ backgroundColor: project.color }}
                        aria-hidden="true"
                      />
                      {project.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="allocation-hours">Horas planejadas na semana</Label>
            <Input
              id="allocation-hours"
              type="number"
              min={0.25}
              max={100}
              step={0.5}
              inputMode="decimal"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              className="font-mono"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="allocation-note">Nota (opcional)</Label>
            <Input
              id="allocation-note"
              value={note}
              maxLength={280}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Ex.: foco na entrega do módulo X"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving}
            className="bg-brand-500 text-white hover:bg-brand-600"
          >
            {saving ? "Salvando…" : "Salvar alocação"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Tab ──────────────────────────────────────────────────────────────

export function WorkloadMatrixTab() {
  const workload = useHqWorkload(4, 4);
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const [activeProject, setActiveProject] = useState<PlannerProject | null>(
    null,
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 8 },
    }),
  );

  const weekByKey = useMemo(() => {
    const map = new Map<string, WorkloadWeekDescriptor>();
    for (const week of workload.data?.weeks ?? []) {
      map.set(week.week, week);
    }
    return map;
  }, [workload.data]);

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const projectId = event.active.data.current?.projectId as
        | string
        | undefined;
      const project = workload.data?.projects.find(
        (item) => item.id === projectId,
      );
      setActiveProject(project ?? null);
    },
    [workload.data],
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      setActiveProject(null);
      const projectId = event.active.data.current?.projectId as
        | string
        | undefined;
      const target = event.over?.data.current as
        | { userId: string; week: string }
        | undefined;

      if (!projectId || !target) return;

      const row = workload.data?.rows.find(
        (item) => item.userId === target.userId,
      );
      const week = weekByKey.get(target.week);
      if (!row || !week) return;

      setDialogState({
        userId: row.userId,
        userName: row.name,
        week: week.week,
        weekLabel: week.label,
        projectId,
      });
    },
    [workload.data, weekByKey],
  );

  const handleRemoveAllocation = useCallback(
    async (allocationId: string) => {
      try {
        await workload.removeAllocation(allocationId);
        toast.success("Alocação removida.");
      } catch (error: unknown) {
        console.error("[WorkloadMatrixTab] handleRemoveAllocation:", error);
        toast.error(
          error instanceof Error ? error.message : "Erro ao remover alocação.",
        );
      }
    },
    [workload],
  );

  if (workload.isLoading) {
    return (
      <output
        aria-label="Carregando matriz de capacidade"
        className="block space-y-4"
      >
        <Skeleton className="h-10 w-full max-w-lg" />
        <Skeleton className="h-96 w-full" />
      </output>
    );
  }

  if (workload.error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-red-400" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{workload.error}</p>
          <Button variant="outline" size="sm" onClick={workload.refresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  const data = workload.data;
  if (!data || data.rows.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <Moon className="size-8 text-muted-foreground" aria-hidden="true" />
          <p className="font-medium">Nenhuma pessoa no seu escopo</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            A matriz mostra você e seus liderados diretos. Assim que houver
            pessoas com horas registradas, a carga aparece aqui.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <TooltipProvider delayDuration={150}>
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragCancel={() => setActiveProject(null)}
      >
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              {(
                ["over", "full", "ok", "low", "empty"] as UtilizationLevel[]
              ).map((level) => (
                <span key={level} className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "size-2.5 rounded-sm",
                      LEVEL_STYLES[level].split(" ")[0],
                    )}
                    aria-hidden="true"
                  />
                  {LEVEL_LABELS[level]}
                </span>
              ))}
            </div>
            <div className="flex items-center gap-2 text-xs">
              {data.totals.overloadedThisWeek > 0 ? (
                <span className="rounded-full bg-red-500/10 px-2.5 py-1 font-medium text-red-500 dark:text-red-400">
                  {data.totals.overloadedThisWeek} em sobrecarga
                </span>
              ) : null}
              {data.totals.idleThisWeek > 0 ? (
                <span className="rounded-full bg-sky-500/10 px-2.5 py-1 font-medium text-sky-600 dark:text-sky-400">
                  {data.totals.idleThisWeek} com capacidade livre
                </span>
              ) : null}
            </div>
          </div>

          {data.projects.length > 0 ? (
            <Card className="gap-0 py-3">
              <CardContent className="flex flex-wrap items-center gap-2 px-4">
                <p className="mr-1 text-xs font-medium text-muted-foreground">
                  Arraste um projeto para uma semana futura:
                </p>
                {data.projects.map((project) => (
                  <DraggableProjectChip key={project.id} project={project} />
                ))}
              </CardContent>
            </Card>
          ) : null}

          <Card className="gap-0 overflow-hidden py-0">
            <div className="overflow-x-auto">
              <div className="min-w-[900px] p-4">
                <div
                  className="grid gap-1.5"
                  style={{
                    gridTemplateColumns: `220px repeat(${data.weeks.length}, minmax(84px, 1fr))`,
                  }}
                >
                  <div className="px-2 py-1 text-xs font-medium text-muted-foreground">
                    Pessoa
                  </div>
                  {data.weeks.map((week) => (
                    <div
                      key={week.week}
                      className={cn(
                        "px-1 py-1 text-center text-[11px] font-medium",
                        week.isCurrent
                          ? "text-brand-500"
                          : week.isFuture
                            ? "text-muted-foreground"
                            : "text-muted-foreground/70",
                      )}
                    >
                      {week.isCurrent
                        ? "Atual · "
                        : week.isFuture
                          ? "Plano · "
                          : ""}
                      {week.label}
                    </div>
                  ))}

                  {data.rows.map((row) => {
                    return (
                      <div key={row.userId} className="contents">
                        <div className="flex items-center gap-2.5 rounded-lg bg-muted/30 px-2 py-1.5">
                          <UserAvatar
                            name={row.name}
                            image={row.image}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium">
                              {row.name}
                            </p>
                            <p className="font-mono text-[10px] text-muted-foreground">
                              {formatDuration(row.capacityMinutes)}/sem
                            </p>
                          </div>
                        </div>

                        {data.weeks.map((week) => {
                          const cell = row.cells.find(
                            (item) => item.week === week.week,
                          );
                          if (!cell) return <div key={week.week} />;

                          return (
                            <MatrixCell
                              key={week.week}
                              row={row}
                              cell={cell}
                              week={week}
                              onPlan={setDialogState}
                              onRemoveAllocation={handleRemoveAllocation}
                            />
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>
        </div>

        <DragOverlay>
          {activeProject ? (
            <ProjectChip project={activeProject} dragging />
          ) : null}
        </DragOverlay>

        <AllocationDialog
          state={dialogState}
          projects={data.projects}
          onClose={() => setDialogState(null)}
          onSave={workload.upsertAllocation}
        />
      </DndContext>
    </TooltipProvider>
  );
}
