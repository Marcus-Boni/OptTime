"use client";

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
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTimer } from "@/hooks/use-timer";
import { cn } from "@/lib/utils";

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
}

interface TimerWidgetProps {
  projects: Project[];
  onEntrySaved?: () => void;
}

export function TimerWidget({ projects, onEntrySaved }: TimerWidgetProps) {
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
      setExpanded(true);
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
          : "Nao foi possivel iniciar o timer.",
      );
    }
  }, [billable, description, projectId, startTimer, workItem]);

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
          : "Nao foi possivel encerrar o timer.",
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
          : "Nao foi possivel pausar o timer.",
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
          : "Nao foi possivel retomar o timer.",
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
              <p className="text-sm text-muted-foreground">
                Nenhum timer ativo. Abra o painel apenas quando precisar iniciar
                uma medicao em tempo real.
              </p>
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

            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? (
                <ChevronUp className="mr-2 h-4 w-4" />
              ) : (
                <ChevronDown className="mr-2 h-4 w-4" />
              )}
              {expanded ? "Recolher" : "Abrir timer"}
            </Button>
          </div>
        </div>

        {expanded ? (
          <div className="space-y-3 rounded-2xl border border-border/60 bg-background/70 p-4">
            {!hasTimer ? (
              <>
                <div className="grid gap-2 xl:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                  <Select
                    value={projectId}
                    onValueChange={(value) => {
                      setProjectId(value);
                      setWorkItem(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione um projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project) => (
                        <SelectItem key={project.id} value={project.id}>
                          <span className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            {project.name}
                          </span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <WorkItemCombobox
                    projectName={
                      selectedProject?.azureProjectId
                        ? selectedProject.name
                        : null
                    }
                    value={workItem}
                    onChange={setWorkItem}
                    unavailableMessage={workItemUnavailableMessage}
                  />

                  <Input
                    type="text"
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="No que voce esta trabalhando?"
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
                      Ideal para tarefas longas ou concentradas, nao para
                      registro retroativo em lote.
                    </p>
                  </div>
                  <Button
                    size="sm"
                    className="bg-brand-500 text-white hover:bg-brand-600"
                    onClick={handleStart}
                    disabled={!projectId}
                  >
                    <Play className="mr-1.5 h-3.5 w-3.5" />
                    Iniciar
                  </Button>
                </div>
              </>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
