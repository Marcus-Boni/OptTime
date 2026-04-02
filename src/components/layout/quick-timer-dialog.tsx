"use client";

import { Hourglass } from "lucide-react";
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
import {
  dispatchTimeEntriesUpdated,
  dispatchTimerUpdated,
} from "@/lib/time-events";
import { getTimePreferences, saveTimePreference } from "@/lib/time-preferences";
import { useUIStore } from "@/stores/ui.store";

interface Project {
  id: string;
  name: string;
  color: string;
  azureProjectId?: string | null;
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
  const { quickTimerOpen, closeQuickTimer } = useUIStore();

  const [projects, setProjects] = useState<Project[]>([]);
  const [projectId, setProjectId] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionError, setDescriptionError] = useState<string | null>(null);
  const [billable, setBillable] = useState(true);
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

      const preferences = getTimePreferences();

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
  }, [quickTimerOpen]);

  const handleStartTimer = async () => {
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
        throw new Error(error.error ?? "Nao foi possivel iniciar o timer.");
      }

      saveTimePreference("lastProjectId", projectId);
      saveTimePreference("defaultBillable", billable);

      dispatchTimerUpdated();
      dispatchTimeEntriesUpdated();

      toast.success(
        activeTimer
          ? "Novo timer iniciado. O timer anterior foi finalizado automaticamente."
          : "Timer iniciado com sucesso.",
      );

      closeQuickTimer();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Nao foi possivel iniciar o timer.",
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
            <Label>Projeto *</Label>
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
            <Label>
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
            <Label>Descrição *</Label>
            <Textarea
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
            <div>
              <p className="text-sm font-medium text-foreground">Faturável</p>
              <p className="text-xs text-muted-foreground">
                Marque apenas se este tempo for cobrado ao cliente.
              </p>
            </div>
            <Switch
              checked={billable}
              onCheckedChange={setBillable}
              disabled={loading}
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
              loading || submitting || !projectId || !description.trim()
            }
          >
            {submitting ? "Iniciando..." : "Iniciar timer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
