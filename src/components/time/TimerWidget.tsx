"use client";

import { format } from "date-fns";
import {
  ChevronDown,
  ChevronUp,
  Pause,
  Play,
  Square,
  TimerReset,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTimesheetStatus } from "@/hooks/use-timesheet-status";
import { useTimer } from "@/hooks/use-timer";
import { getTimesheetStatusLabel } from "@/lib/timesheet-status";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
  members?: { userId: string }[];
}

interface TimerWidgetProps {
  projects: Project[];
  onEntrySaved?: () => void;
}

export function TimerWidget({ projects, onEntrySaved }: TimerWidgetProps) {
  const todayDate = format(new Date(), "yyyy-MM-dd");
  const todayTimesheetStatus = useTimesheetStatus(todayDate);
  const todayLocked = todayTimesheetStatus.locked;
  const todayLockMessage = todayTimesheetStatus.status
    ? `Não é possível usar o timer porque a semana de hoje já foi ${getTimesheetStatusLabel(todayTimesheetStatus.status)}.`
    : "Não é possível usar o timer hoje.";
  const {
    timer,
    loading,
    displayTime,
    isRunning,
    hasTimer,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
  } = useTimer();

  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [billable, setBillable] = useState(true);
  const [workItem, setWorkItem] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [stopping, setStopping] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!timer) return;

    setProjectId(timer.projectId);
    setDescription(timer.description);
    setBillable(timer.billable);

    if (timer.azureWorkItemId && timer.azureWorkItemTitle) {
      setWorkItem({
        id: timer.azureWorkItemId,
        title: timer.azureWorkItemTitle,
      });
    }
  }, [timer]);

  useEffect(() => {
    if (hasTimer) {
      setExpanded(false);
    }
  }, [hasTimer]);

  const selectedProject = projects.find(
    (project) => project.id === (timer?.projectId ?? projectId),
  );
  const workItemUnavailableMessage = !projectId
    ? "Selecione um projeto para buscar work items"
    : !selectedProject?.azureProjectId
      ? "Este projeto não está vinculado ao Azure DevOps"
      : undefined;

  const handleStart = useCallback(async () => {
    if (todayLocked) {
      toast.error(todayLockMessage);
      return;
    }

    if (!projectId) {
      toast.error("Selecione um projeto para iniciar o timer.");
      return;
    }

    try {
      await startTimer({
        projectId,
        description,
        billable,
        azureWorkItemId: workItem?.id,
        azureWorkItemTitle: workItem?.title,
      });
      toast.success("Timer iniciado com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o timer.",
      );
    }
  }, [billable, description, projectId, startTimer, todayLockMessage, todayLocked, workItem]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await stopTimer();
      onEntrySaved?.();
      setDescription("");
      setWorkItem(null);
      toast.success("Timer encerrado e registro salvo com sucesso.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível encerrar o timer.",
      );
    } finally {
      setStopping(false);
    }
  }, [onEntrySaved, stopTimer]);

  const handlePause = useCallback(async () => {
    try {
      await pauseTimer();
      toast.success("Timer pausado.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível pausar o timer.",
      );
    }
  }, [pauseTimer]);

  const handleResume = useCallback(async () => {
    try {
      await resumeTimer();
      toast.success("Timer retomado.");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível retomar o timer.",
      );
    }
  }, [resumeTimer]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-4">
          <div className="h-16 animate-pulse rounded-lg bg-muted" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card
      id="timer-widget"
      className={cn(
        "overflow-hidden border-border/60 bg-card/80 shadow-none backdrop-blur",
        isRunning && "border-brand-500/40 bg-brand-500/5",
      )}
    >
      <CardContent className="space-y-4 p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400">
                <TimerReset className="h-4 w-4" />
              </span>
              <div>
                <h3 className="font-display text-base font-semibold text-foreground">
                  Timer
                </h3>
                <p className="text-sm text-muted-foreground">
                  Use quando precisar medir um bloco ao vivo. O registro manual
                  continua sendo o fluxo principal.
                </p>
              </div>
            </div>

            {hasTimer ? (
              <div className="space-y-1">
                <div
                  className={cn(
                    "font-mono text-3xl font-bold tabular-nums",
                    isRunning && "text-brand-500",
                  )}
                >
                  {displayTime}
                </div>
                {selectedProject ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: selectedProject.color }}
                    />
                    <span className="font-medium text-foreground">
                      {selectedProject.name}
                    </span>
                    {timer?.billable === false ? (
                      <Badge
                        variant="outline"
                        className="text-[11px] text-muted-foreground"
                      >
                        Nao faturavel
                      </Badge>
                    ) : null}
                  </div>
                ) : null}
                {timer?.description || timer?.azureWorkItemId ? (
                  <p className="text-xs text-muted-foreground">
                    {timer.azureWorkItemId
                      ? `#${timer.azureWorkItemId} - `
                      : ""}
                    {timer.description || "Sem descricao"}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Nenhum timer ativo. Abra o painel apenas quando precisar iniciar
                  uma medicao em tempo real.
                </p>
                {todayLocked ? (
                  <div className="rounded-xl border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
                    {todayLockMessage}
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 self-start">
            {hasTimer ? (
              <>
                {isRunning ? (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    onClick={() => {
                      void handlePause();
                    }}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    onClick={() => {
                      void handleResume();
                    }}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="outline"
                  className="h-9 w-9 text-destructive hover:text-destructive"
                  onClick={handleStop}
                  disabled={stopping}
                >
                  <Square className="h-4 w-4" />
                </Button>
              </>
            ) : null}

            {!hasTimer ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpanded((value) => !value)}
                disabled={todayLocked}
                title={todayLocked ? todayLockMessage : undefined}
              >
                {expanded ? (
                  <ChevronUp className="mr-2 h-4 w-4" />
                ) : (
                  <ChevronDown className="mr-2 h-4 w-4" />
                )}
                {expanded ? "Recolher" : "Abrir timer"}
              </Button>
            ) : null}
          </div>
        </div>

        {expanded && !hasTimer ? (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4">
            <div className="grid gap-2 xl:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
              <ProjectCombobox
                projects={projects}
                value={projectId}
                onChange={(value) => {
                  setProjectId(value);
                  setWorkItem(null);
                }}
              />

              <WorkItemCombobox
                projectName={
                  selectedProject?.azureProjectId ? selectedProject.name : null
                }
                value={workItem}
                onChange={setWorkItem}
                unavailableMessage={workItemUnavailableMessage}
              />

              <Input
                type="text"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="No que você está trabalhando?"
                onKeyDown={(event) =>
                  event.key === "Enter" && void handleStart()
                }
                className="xl:col-span-2"
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border/60 px-3 py-3 text-sm">
              <div>
                <p className="font-medium text-foreground">
                  Iniciar temporizador
                </p>
                <p className="text-muted-foreground">
                  Ideal para tarefas longas ou concentradas, não para registro
                  retroativo em lote.
                </p>
              </div>
              <Button
                size="sm"
                className="bg-brand-500 text-white hover:bg-brand-600"
                onClick={handleStart}
                disabled={!projectId || todayLocked}
                title={todayLocked ? todayLockMessage : undefined}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Iniciar
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
