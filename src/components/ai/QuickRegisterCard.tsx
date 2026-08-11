"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Check, Clock, Edit3, Hash, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { DurationInput } from "@/components/time/DurationInput";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration } from "@/lib/utils";
import type { ParsedTimeEntry } from "@/lib/validations/ai.schema";

export interface QuickRegisterCardProps {
  payload: ParsedTimeEntry;
  onSuccess?: () => void;
}

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  members?: { userId: string }[];
}

export function QuickRegisterCard({
  payload,
  onSuccess,
}: QuickRegisterCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreated, setIsCreated] = useState(false);

  // Form edit states initialized with parsed AI payload
  const [description, setDescription] = useState(payload.description);
  const [durationMinutes, setDurationMinutes] = useState(
    payload.durationMinutes,
  );
  const [projectId, setProjectId] = useState(payload.projectId || "");
  const [workItem, setWorkItem] = useState<{
    id: number;
    title: string;
  } | null>(
    payload.azureWorkItemId
      ? { id: payload.azureWorkItemId, title: "Work Item AzDO" }
      : null,
  );

  const [availableProjects, setAvailableProjects] = useState<ProjectOption[]>(
    [],
  );

  // Fetch available projects
  useEffect(() => {
    async function fetchProjects() {
      try {
        const res = await fetch("/api/projects");
        if (res.ok) {
          const data = (await res.json()) as { projects?: ProjectOption[] };
          if (data.projects && data.projects.length > 0) {
            setAvailableProjects(data.projects);
            if (!projectId) {
              setProjectId(data.projects[0].id);
            }
          }
        }
      } catch (err: unknown) {
        console.error("[QuickRegisterCard] fetchProjects:", err);
      }
    }
    fetchProjects();
  }, [projectId]);

  const selectedProject = useMemo(() => {
    return availableProjects.find((p) => p.id === projectId);
  }, [availableProjects, projectId]);

  const currentProjectName =
    selectedProject?.name || payload.projectName || "Projeto OptSolv";
  const currentProjectColor = selectedProject?.color || "#f97316";

  async function handleConfirm(e?: React.FormEvent) {
    if (e) e.preventDefault();

    const targetProjectId = projectId || payload.projectId;
    if (!targetProjectId) {
      toast.error("Por favor, selecione um projeto.");
      return;
    }

    if (!description.trim()) {
      toast.error("A descrição não pode estar vazia.");
      return;
    }

    if (!durationMinutes || durationMinutes < 1 || durationMinutes > 1440) {
      toast.error("A duração deve ser entre 1 minuto e 24 horas.");
      return;
    }

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: targetProjectId,
          description: description.trim(),
          date: payload.date,
          duration: durationMinutes,
          billable: true,
          azureWorkItemId: workItem?.id || undefined,
          azureWorkItemTitle: workItem?.title || undefined,
        }),
      });

      if (!res.ok) {
        const errorData = (await res.json()) as { error?: string };
        throw new Error(errorData.error || "Falha ao registrar entrada");
      }

      setIsCreated(true);
      setIsEditing(false);
      toast.success("Entrada de tempo registrada com sucesso!");
      onSuccess?.();
    } catch (err: unknown) {
      console.error("[QuickRegisterCard] handleConfirm:", err);
      const msg =
        err instanceof Error ? err.message : "Erro ao registrar horas";
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-orange-500/30 bg-orange-500/10 p-4 backdrop-blur-sm transition-all dark:bg-orange-950/20 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-orange-500/20 pb-2.5">
        <span className="flex items-center gap-1.5 font-semibold text-orange-400 text-xs tracking-wide">
          <Clock className="h-4 w-4 text-orange-400" aria-hidden="true" />
          Sugestão de Registro Rápido
        </span>
        <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 font-mono font-bold text-orange-300 text-[11px]">
          {formatDuration(durationMinutes)}
        </span>
      </div>

      {/* Body Container */}
      <AnimatePresence mode="wait">
        {isEditing ? (
          <motion.form
            key="editing-form"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleConfirm}
            className="mt-4 space-y-4 text-xs"
          >
            {/* Project Select Combobox */}
            <div className="space-y-1.5">
              <label
                htmlFor="quick-card-project"
                className="block text-[11px] font-medium text-neutral-300"
              >
                Projeto <span className="text-orange-400">*</span>
              </label>
              <div id="quick-card-project">
                <ProjectCombobox
                  projects={availableProjects}
                  value={projectId}
                  onChange={(id) => setProjectId(id)}
                  byPassMemberFilter={true}
                  placeholder="Selecione um projeto..."
                />
              </div>
            </div>

            {/* Azure DevOps Work Item Combobox */}
            <div className="space-y-1.5">
              <label
                htmlFor="quick-card-workitem"
                className="block text-[11px] font-medium text-neutral-300"
              >
                Work Item Azure DevOps{" "}
                <span className="text-neutral-500">(opcional)</span>
              </label>
              <div id="quick-card-workitem">
                <WorkItemCombobox
                  projectName={currentProjectName}
                  value={workItem}
                  onChange={(item) => setWorkItem(item)}
                />
              </div>
            </div>

            {/* Duration Input */}
            <div className="space-y-1.5">
              <label
                htmlFor="quick-card-duration"
                className="block text-[11px] font-medium text-neutral-300"
              >
                Duração <span className="text-orange-400">*</span>
              </label>
              <div id="quick-card-duration">
                <DurationInput
                  value={durationMinutes}
                  onChange={(mins) => setDurationMinutes(mins)}
                />
              </div>
            </div>

            {/* Description Textarea */}
            <div className="space-y-1.5">
              <label
                htmlFor="quick-card-description"
                className="block text-[11px] font-medium text-neutral-300"
              >
                Descrição da atividade{" "}
                <span className="text-orange-400">*</span>
              </label>
              <Textarea
                id="quick-card-description"
                rows={2.5}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Descreva o trabalho realizado..."
                className="resize-none border-input bg-background/80 text-xs text-foreground focus:border-orange-500"
              />
            </div>

            {/* Action Buttons in Edit Mode */}
            <div className="flex items-center justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="h-8 text-xs text-neutral-400 hover:text-neutral-200"
              >
                <X className="mr-1 h-3.5 w-3.5" />
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="h-8 px-3.5 gap-1.5 cursor-pointer bg-orange-500 font-medium text-white text-xs hover:bg-orange-600 active:scale-95 transition-all"
              >
                {isSubmitting ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Salvar & Registrar
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="display-view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-3 space-y-2 text-xs"
          >
            {/* View Mode Content */}
            <div className="flex items-center gap-2 text-neutral-200 dark:text-neutral-100">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: currentProjectColor }}
              />
              <span className="font-semibold text-xs tracking-tight truncate">
                {currentProjectName}
              </span>
            </div>

            <p className="line-clamp-2 pl-4 text-neutral-300 dark:text-neutral-300 italic text-[11px] leading-relaxed">
              &quot;{description}&quot;
            </p>

            {workItem && (
              <div className="flex items-center gap-1.5 pl-4 text-orange-400 font-mono text-[11px]">
                <Hash className="h-3 w-3" aria-hidden="true" />
                <span>
                  #{workItem.id} — {workItem.title}
                </span>
              </div>
            )}

            {/* Footer Buttons in View Mode */}
            <div className="mt-4 pt-1 flex items-center justify-end gap-2">
              {isCreated ? (
                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                  <Check className="h-4 w-4" aria-hidden="true" />
                  Registrado no sistema!
                </div>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setIsEditing(true)}
                    className="h-8 gap-1.5 border-orange-500/30 text-orange-300 hover:bg-orange-500/10 text-xs cursor-pointer"
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                    Editar
                  </Button>

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleConfirm()}
                    disabled={isSubmitting}
                    aria-busy={isSubmitting}
                    className="h-8 px-3.5 gap-1.5 cursor-pointer bg-orange-500 font-medium text-white text-xs hover:bg-orange-600 active:scale-95 transition-all dark:bg-orange-600 dark:hover:bg-orange-500 shadow-sm"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2
                          className="h-3.5 w-3.5 animate-spin"
                          aria-hidden="true"
                        />
                        Registrando...
                      </>
                    ) : (
                      <>
                        <Check className="h-3.5 w-3.5" aria-hidden="true" />
                        Confirmar & Registrar
                      </>
                    )}
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
