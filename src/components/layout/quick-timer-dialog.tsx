"use client";

import { format } from "date-fns";
import { Hourglass, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useTimesheetStatus } from "@/hooks/use-timesheet-status";
import { useUserTimePreferences } from "@/hooks/use-user-time-preferences";
import {
  dispatchTimeEntriesUpdated,
  dispatchTimerUpdated,
} from "@/lib/time-events";
import { getTimesheetStatusLabel } from "@/lib/timesheet-status";
import { useFocusStore } from "@/stores/focus.store";
import { useUIStore } from "@/stores/ui.store";

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
  members?: { userId: string }[];
}

interface ActiveTimerSummary {
  id: string;
  projectId: string;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  project?: {
    name: string;
  };
}

export function QuickTimerDialog() {
  const { preferences, saveLastProjectId, updatePreferences } =
    useUserTimePreferences();
  const { quickTimerOpen, closeQuickTimer } = useUIStore();
  const todayDate = format(new Date(), "yyyy-MM-dd");
  const todayTimesheetStatus = useTimesheetStatus(
    quickTimerOpen ? todayDate : null,
  );
  const todayLocked = todayTimesheetStatus.locked;
  const todayLockMessage = todayTimesheetStatus.status
    ? `Não é possível iniciar um timer porque a semana de hoje já foi ${getTimesheetStatusLabel(todayTimesheetStatus.status)}.`
    : "Não é possível iniciar um timer hoje.";

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [billable, setBillable] = useState(true);
  const [startWithFocus, setStartWithFocus] = useState(false);
  const [workItem, setWorkItem] = useState<{
    id: number;
    title: string;
  } | null>(null);
  const [activeTimer, setActiveTimer] = useState<ActiveTimerSummary | null>(
    null,
  );
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === projectId),
    [projectId, projects],
  );

  const workItemUnavailableMessage = !projectId
    ? "Selecione um projeto para buscar work items"
    : !selectedProject?.azureProjectId
      ? "Este projeto não está vinculado ao Azure DevOps"
      : undefined;

  useEffect(() => {
    if (!quickTimerOpen) {
      return;
    }

    let cancelled = false;

    async function loadContext() {
      setLoading(true);

      try {
        const [projectsRes, timerRes] = await Promise.all([
          fetch("/api/projects?status=active&limit=100"),
          fetch("/api/timer"),
        ]);

        if (cancelled) {
          return;
        }

        const projectsData = projectsRes.ok
          ? ((await projectsRes.json()) as { projects?: Project[] })
          : { projects: [] };

        const timerData = timerRes.ok
          ? ((await timerRes.json()) as { timer?: ActiveTimerSummary | null })
          : { timer: null };

        const nextProjects = projectsData.projects ?? [];
        const currentTimer = timerData.timer ?? null;

        setProjects(nextProjects);
        setActiveTimer(currentTimer);

        setProjectId(
          currentTimer?.projectId ?? preferences.lastProjectId ?? "",
        );
        setDescription(currentTimer?.description ?? "");
        setDescriptionError(null);
        setBillable(currentTimer?.billable ?? preferences.defaultBillable);
        setStartWithFocus(false);
        setWorkItem(
          currentTimer?.azureWorkItemId && currentTimer.azureWorkItemTitle
            ? {
                id: currentTimer.azureWorkItemId,
                title: currentTimer.azureWorkItemTitle,
              }
            : null,
        );
      } catch {
        if (!cancelled) {
          setProjects([]);
          setActiveTimer(null);
          setProjectId(preferences.lastProjectId ?? "");
          setDescription("");
          setDescriptionError(null);
          setBillable(preferences.defaultBillable);
          setStartWithFocus(false);
          setWorkItem(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadContext();

    return () => {
      cancelled = true;
    };
  }, [preferences.defaultBillable, preferences.lastProjectId, quickTimerOpen]);

  const handleStartTimer = async () => {
    if (todayLocked) {
      toast.error(todayLockMessage);
      return;
    }

    if (!projectId) {
      toast.error("Selecione um projeto para iniciar o timer.");
      return;
    }

    const normalizedDescription = description.trim();
    if (!normalizedDescription) {
      setDescriptionError("A descrição é obrigatória para iniciar o timer.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/timer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-timezone":
            Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        },
        body: JSON.stringify({
          projectId,
          description: normalizedDescription,
          billable,
          azureWorkItemId: workItem?.id,
          azureWorkItemTitle: workItem?.title,
        }),
      });

      if (!response.ok) {
        const error = (await response.json()) as { error?: string };
        throw new Error(error.error ?? "Não foi possível iniciar o timer.");
      }

      saveLastProjectId(projectId);
      void updatePreferences(
        { timeDefaultBillable: billable },
        {
          errorMessage:
            "O timer foi iniciado, mas nao foi possivel atualizar sua preferencia de faturamento.",
        },
      );

      dispatchTimerUpdated();
      dispatchTimeEntriesUpdated();

      if (startWithFocus) {
        useFocusStore.getState().startSession();
        toast.success("Timer e Modo Foco iniciados com sucesso.");
      } else {
        toast.success(
          activeTimer
            ? "Novo timer iniciado. O timer anterior foi finalizado automaticamente."
            : "Timer iniciado com sucesso.",
        );
      }

      closeQuickTimer();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Não foi possível iniciar o timer.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={quickTimerOpen}
      onOpenChange={(open) => !open && closeQuickTimer()}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hourglass className="h-4 w-4 text-brand-500" />
            Iniciar registro com timer
          </DialogTitle>
          <DialogDescription>
            Comece um bloco em tempo real sem sair da tela atual.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {todayLocked ? (
            <div className="rounded-lg border border-amber-300/60 bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-300">
              <p className="font-medium">Semana bloqueada para lançamentos.</p>
              <p>{todayLockMessage}</p>
            </div>
          ) : null}

          {activeTimer ? (
            <div className="rounded-lg border border-brand-500/30 bg-brand-500/10 px-3 py-2 text-sm text-foreground">
              <p className="font-medium">Ja existe um timer em andamento.</p>
              <p className="text-muted-foreground">
                Ao iniciar um novo, o timer atual sera encerrado e salvo
                automaticamente.
              </p>
            </div>
          ) : null}

          <div className="space-y-1.5">
            <Label htmlFor="quick-timer-project">Projeto *</Label>
            <ProjectCombobox
              projects={projects}
              value={projectId}
              onChange={(value) => {
                setProjectId(value);
                setWorkItem(null);
              }}
              disabled={loading}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-timer-work-item">
              Work item{" "}
              <span className="text-muted-foreground">(opcional)</span>
            </Label>
            <WorkItemCombobox
              projectName={
                selectedProject?.azureProjectId ? selectedProject.name : null
              }
              value={workItem}
              onChange={setWorkItem}
              disabled={loading || !selectedProject?.azureProjectId}
              unavailableMessage={workItemUnavailableMessage}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quick-timer-description">Descrição *</Label>
            <Textarea
              id="quick-timer-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
                if (descriptionError) {
                  setDescriptionError(null);
                }
              }}
              placeholder="No que você está trabalhando?"
              rows={3}
              maxLength={500}
              disabled={loading}
            />
            {descriptionError ? (
              <p className="text-xs text-destructive">{descriptionError}</p>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-lg border border-border/60 bg-background/70 px-3 py-2.5">
            <Label
              htmlFor="quick-timer-billable"
              className="flex flex-col items-start gap-0.5 text-left cursor-pointer"
            >
              <span className="text-sm font-medium text-foreground">
                Faturável
              </span>
              <span className="text-xs font-normal text-muted-foreground">
                Marque apenas se este tempo for cobrado ao cliente.
              </span>
            </Label>
            <Switch
              id="quick-timer-billable"
              checked={billable}
              onCheckedChange={setBillable}
              disabled={loading}
              aria-label="Lançamento faturável"
            />
          </div>

          <div className="flex items-center justify-between rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-2.5 transition-colors hover:border-brand-500/30">
            <Label
              htmlFor="quick-timer-focus-mode"
              className="flex items-start gap-2.5 text-left cursor-pointer"
            >
              <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-md bg-brand-500/10 text-brand-500 shrink-0">
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="flex flex-col items-start gap-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-foreground">
                    Iniciar no Modo Foco
                  </span>
                  <span className="rounded-full border border-brand-500/30 bg-brand-500/10 px-1.5 py-0.5 text-[10px] font-medium text-brand-400">
                    Pomodoro
                  </span>
                </div>
                <span className="text-xs font-normal text-muted-foreground">
                  Abre a sessão em tela cheia com som ambiente e contagem
                  regressiva integrada.
                </span>
              </div>
            </Label>
            <Switch
              id="quick-timer-focus-mode"
              checked={startWithFocus}
              onCheckedChange={setStartWithFocus}
              disabled={loading}
              aria-label="Iniciar no Modo Foco"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={closeQuickTimer}>
            Cancelar
          </Button>
          <Button
            type="button"
            className="bg-brand-500 text-white hover:bg-brand-600"
            onClick={() => {
              void handleStartTimer();
            }}
            disabled={
              loading ||
              submitting ||
              todayLocked ||
              !projectId ||
              !description.trim()
            }
            title={todayLocked ? todayLockMessage : undefined}
          >
            {submitting ? (
              "Iniciando..."
            ) : startWithFocus ? (
              <>
                <Sparkles className="mr-1.5 h-4 w-4" aria-hidden="true" />
                Iniciar no Modo Foco
              </>
            ) : (
              "Iniciar timer"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
