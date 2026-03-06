"use client";

import { Pause, Play, Square } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
    isPaused,
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

  // Sync form with active timer values
  useEffect(() => {
    if (timer) {
      setProjectId(timer.projectId);
      setDescription(timer.description);
      setBillable(timer.billable);
      if (timer.azureWorkItemId && timer.azureWorkItemTitle) {
        setWorkItem({
          id: timer.azureWorkItemId,
          title: timer.azureWorkItemTitle,
        });
      }
    }
  }, [timer]);

  const selectedProject = projects.find(
    (p) => p.id === (timer?.projectId ?? projectId),
  );

  const handleStart = useCallback(async () => {
    if (!projectId) return;
    await startTimer({
      projectId,
      description,
      billable,
      azureWorkItemId: workItem?.id,
      azureWorkItemTitle: workItem?.title,
    });
  }, [projectId, description, billable, workItem, startTimer]);

  const handleStop = useCallback(async () => {
    setStopping(true);
    try {
      await stopTimer();
      onEntrySaved?.();
      setDescription("");
      setWorkItem(null);
    } finally {
      setStopping(false);
    }
  }, [stopTimer, onEntrySaved]);

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
        "transition-colors",
        isRunning && "border-brand-500/40 bg-brand-500/5",
      )}
    >
      <CardContent className="space-y-3 py-4">
        {/* Timer display row */}
        <div className="flex items-center gap-4">
          {/* Clock */}
          <div
            className={cn(
              "min-w-[130px] font-mono text-3xl font-bold tabular-nums",
              isRunning && "text-brand-500",
            )}
          >
            {displayTime}
          </div>

          {/* Project + work item info (when running) */}
          {hasTimer && selectedProject ? (
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span
                  className="h-2.5 w-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: selectedProject.color }}
                />
                <span className="font-medium text-sm truncate">
                  {selectedProject.name}
                </span>
                {timer?.billable === false && (
                  <Badge
                    variant="outline"
                    className="text-xs text-muted-foreground shrink-0"
                  >
                    Não faturável
                  </Badge>
                )}
              </div>
              {(timer?.description || timer?.azureWorkItemId) && (
                <p className="mt-0.5 text-xs text-muted-foreground truncate">
                  {timer.azureWorkItemId && `#${timer.azureWorkItemId} — `}
                  {timer.description || "Sem descrição"}
                </p>
              )}
            </div>
          ) : (
            <div className="flex-1 text-sm text-muted-foreground">
              {isRunning ? "Calculando…" : "Nenhum timer ativo"}
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center gap-2 shrink-0">
            {!hasTimer ? (
              <Button
                size="sm"
                className="bg-brand-500 text-white hover:bg-brand-600"
                onClick={handleStart}
                disabled={!projectId}
              >
                <Play className="mr-1.5 h-3.5 w-3.5" />
                Iniciar
              </Button>
            ) : (
              <>
                {isRunning ? (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={pauseTimer}
                  >
                    <Pause className="h-4 w-4" />
                  </Button>
                ) : (
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-8 w-8"
                    onClick={resumeTimer}
                  >
                    <Play className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  size="icon"
                  variant="outline"
                  className="h-8 w-8 text-destructive hover:text-destructive"
                  onClick={handleStop}
                  disabled={stopping}
                >
                  <Square className="h-4 w-4" />
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Setup row (only when no timer active) */}
        {!hasTimer && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Select
              value={projectId}
              onValueChange={(v) => {
                setProjectId(v);
                setWorkItem(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione um projeto" />
              </SelectTrigger>
              <SelectContent>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: p.color }}
                      />
                      {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <WorkItemCombobox
              projectName={
                selectedProject?.azureProjectId ? selectedProject.name : null
              }
              value={workItem}
              onChange={setWorkItem}
            />

            <div className="sm:col-span-2">
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="No que está trabalhando?"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                onKeyDown={(e) => e.key === "Enter" && handleStart()}
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
