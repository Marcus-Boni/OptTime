"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { format } from "date-fns";
import {
  Archive,
  Cloud,
  GitBranch,
  KeyRound,
  Loader2,
  Timer,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import type { ProjectFromAPI } from "@/components/projects/types";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  buildPhaseCode,
  buildPhaseName,
  type ProjectPhaseSummary,
  suggestNextIntegrationKey,
} from "@/lib/projects/phases";

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface ProjectNewPhaseDialogProps {
  /** Latest phase — the one being closed */
  project: ProjectFromAPI;
  /** Phase number the dialog will create */
  nextPhase: number;
  /** Budget usage of the phase being closed, when already loaded */
  currentPhase?: ProjectPhaseSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * The new phase needs its own integration key (external project management
 * reads hours by key); it is mandatory when the current phase has one.
 */
function createNewPhaseFormSchema(previousIntegrationKey: string | null) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(2, "Nome deve ter pelo menos 2 caracteres")
        .max(100, "Máximo de 100 caracteres"),
      code: z
        .string()
        .trim()
        .toUpperCase()
        .min(2, "Código deve ter pelo menos 2 caracteres")
        .max(20, "Máximo de 20 caracteres")
        .regex(/^[A-Z0-9-]+$/, "Use apenas letras, números e hífens"),
      budget: z.string().trim().regex(/^\d*$/, "Informe horas inteiras"),
      startDate: z.string().min(1, "Informe a data de início"),
      endDate: z.string(),
      description: z.string().max(500, "Máximo de 500 caracteres"),
      integrationKey: z.string().trim().max(100, "Máximo de 100 caracteres"),
      copyMembers: z.boolean(),
    })
    .refine((data) => data.startDate <= format(new Date(), "yyyy-MM-dd"), {
      message:
        "A nova fase começa a receber horas agora — use hoje ou uma data passada",
      path: ["startDate"],
    })
    .refine((data) => !data.endDate || data.endDate >= data.startDate, {
      message: "A data fim deve ser igual ou posterior à data início",
      path: ["endDate"],
    })
    .refine(
      (data) => !previousIntegrationKey || data.integrationKey.length > 0,
      {
        message: "Informe a chave de integração da nova fase",
        path: ["integrationKey"],
      },
    )
    .refine(
      (data) =>
        !previousIntegrationKey ||
        data.integrationKey.toLowerCase() !==
          previousIntegrationKey.toLowerCase(),
      {
        message: "Use uma chave diferente da fase atual",
        path: ["integrationKey"],
      },
    );
}

type NewPhaseFormValues = z.infer<ReturnType<typeof createNewPhaseFormSchema>>;

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildDefaults(
  project: ProjectFromAPI,
  nextPhase: number,
): NewPhaseFormValues {
  return {
    name: buildPhaseName(project.name, nextPhase),
    code: buildPhaseCode(project.code, nextPhase),
    budget: "",
    startDate: format(new Date(), "yyyy-MM-dd"),
    endDate: "",
    description: project.description ?? "",
    integrationKey: suggestNextIntegrationKey(project.integrationKey) ?? "",
    copyMembers: true,
  };
}

function formatHours(hours: number): string {
  return Number.isInteger(hours) ? `${hours}h` : `${hours.toFixed(1)}h`;
}

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

// ─── Component ─────────────────────────────────────────────────────────────────

/**
 * Starts the next phase of a project: new budget from zero, same Azure DevOps
 * link. The current phase is closed and keeps all of its history.
 */
export function ProjectNewPhaseDialog({
  project,
  nextPhase,
  currentPhase,
  open,
  onOpenChange,
}: ProjectNewPhaseDialogProps) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const previousIntegrationKey = project.integrationKey?.trim() || null;
  const formSchema = useMemo(
    () => createNewPhaseFormSchema(previousIntegrationKey),
    [previousIntegrationKey],
  );

  const {
    control,
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors },
  } = useForm<NewPhaseFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: buildDefaults(project, nextPhase),
  });

  useEffect(() => {
    if (open) reset(buildDefaults(project, nextPhase));
  }, [open, project, nextPhase, reset]);

  const copyMembers = watch("copyMembers");
  const memberCount = project.members.length;

  async function handleCreatePhase(values: NewPhaseFormValues) {
    setSaving(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/phases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: values.name,
          code: values.code,
          budget: values.budget ? Number.parseInt(values.budget, 10) : null,
          startDate: values.startDate,
          endDate: values.endDate || null,
          description: values.description || null,
          integrationKey: values.integrationKey || null,
          copyMembers: values.copyMembers,
        }),
      });

      const data = (await res.json().catch(() => null)) as {
        project?: { id: string; phase: number };
        error?: unknown;
      } | null;

      if (!res.ok || !data?.project) {
        toast.error(
          typeof data?.error === "string"
            ? data.error
            : "Não foi possível iniciar a nova fase.",
        );
        return;
      }

      toast.success(`Fase ${data.project.phase} iniciada`, {
        description: `${project.name} foi encerrada e o histórico dela continua disponível.`,
      });
      onOpenChange(false);
      router.push(`/dashboard/projects/${data.project.id}`);
    } catch (error: unknown) {
      console.error("[ProjectNewPhaseDialog] handleCreatePhase:", error);
      toast.error("Não foi possível iniciar a nova fase.");
    } finally {
      setSaving(false);
    }
  }

  function handleCopyMembersChange(checked: boolean) {
    setValue("copyMembers", checked, { shouldDirty: true });
  }

  function handleCancel() {
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={saving ? undefined : onOpenChange}>
      <DialogContent className="flex max-h-[90dvh] max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border/50 px-6 py-4">
          <DialogTitle className="flex items-center gap-2 text-lg font-semibold">
            <GitBranch className="h-5 w-5 text-violet-500" aria-hidden="true" />
            Iniciar Fase {nextPhase}
          </DialogTitle>
          <DialogDescription>
            Novo orçamento a partir do zero, com o mesmo Azure DevOps. As horas
            já lançadas continuam na fase atual.
          </DialogDescription>
        </DialogHeader>

        <form
          id="project-new-phase-form"
          onSubmit={handleSubmit(handleCreatePhase)}
          className="min-h-0 flex-1 space-y-5 overflow-y-auto px-6 py-5"
          noValidate
        >
          {/* What happens on confirm */}
          <section
            aria-label="O que acontece ao iniciar a fase"
            className="space-y-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm"
          >
            <p className="flex items-start gap-2">
              <Archive
                className="mt-0.5 h-4 w-4 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              <span>
                <strong className="font-semibold">{project.name}</strong> será
                encerrada e deixa de receber lançamentos
                {currentPhase
                  ? currentPhase.budgetHours !== null
                    ? ` (fecha com ${formatHours(currentPhase.consumedHours)} de ${formatHours(currentPhase.budgetHours)}).`
                    : ` (fecha com ${formatHours(currentPhase.consumedHours)} registradas).`
                  : "."}
              </span>
            </p>
            {project.azureProjectId && (
              <p className="flex items-start gap-2 text-muted-foreground">
                <Cloud
                  className="mt-0.5 h-4 w-4 shrink-0 text-blue-500"
                  aria-hidden="true"
                />
                O vínculo com o Azure DevOps passa para a nova fase: work items
                e sugestões continuam funcionando.
              </p>
            )}
            <p className="flex items-start gap-2 text-muted-foreground">
              <Timer
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              Timers em andamento e alocações planejadas a partir da semana de
              início migram para a nova fase.
            </p>
          </section>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="phase-name">
                Nome da fase <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phase-name"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "phase-name-err" : undefined}
                {...register("name")}
              />
              <FieldError id="phase-name-err" message={errors.name?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phase-code">
                Código <span className="text-destructive">*</span>
              </Label>
              <Input
                id="phase-code"
                className="font-mono uppercase"
                aria-invalid={Boolean(errors.code)}
                aria-describedby={errors.code ? "phase-code-err" : undefined}
                {...register("code")}
              />
              <FieldError id="phase-code-err" message={errors.code?.message} />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phase-budget">Orçamento (horas)</Label>
              <Input
                id="phase-budget"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                placeholder="Ex: 320"
                className="text-right font-mono"
                aria-invalid={Boolean(errors.budget)}
                aria-describedby={
                  errors.budget ? "phase-budget-err" : "phase-budget-hint"
                }
                {...register("budget")}
              />
              {errors.budget ? (
                <FieldError
                  id="phase-budget-err"
                  message={errors.budget.message}
                />
              ) : (
                <p
                  id="phase-budget-hint"
                  className="text-xs text-muted-foreground"
                >
                  O consumo começa do zero.
                </p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phase-start-date">
                Data início <span className="text-destructive">*</span>
              </Label>
              <Controller
                control={control}
                name="startDate"
                render={({ field }) => (
                  <DatePicker
                    id="phase-start-date"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? "")}
                  />
                )}
              />
              <FieldError
                id="phase-start-date-err"
                message={errors.startDate?.message}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phase-end-date">Data fim</Label>
              <Controller
                control={control}
                name="endDate"
                render={({ field }) => (
                  <DatePicker
                    id="phase-end-date"
                    value={field.value || null}
                    onChange={(value) => field.onChange(value ?? "")}
                  />
                )}
              />
              <FieldError
                id="phase-end-date-err"
                message={errors.endDate?.message}
              />
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label
                htmlFor="phase-integration-key"
                className="flex items-center gap-1.5"
              >
                <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
                Chave de integração
                {previousIntegrationKey && (
                  <span className="text-destructive">*</span>
                )}
              </Label>
              <Input
                id="phase-integration-key"
                className="font-mono"
                placeholder="Ex: MARAM_PORCL_0002"
                aria-invalid={Boolean(errors.integrationKey)}
                aria-describedby={
                  errors.integrationKey
                    ? "phase-integration-key-err"
                    : "phase-integration-key-hint"
                }
                {...register("integrationKey")}
              />
              {errors.integrationKey ? (
                <FieldError
                  id="phase-integration-key-err"
                  message={errors.integrationKey.message}
                />
              ) : (
                <p
                  id="phase-integration-key-hint"
                  className="text-xs text-muted-foreground"
                >
                  {previousIntegrationKey ? (
                    <>
                      Nova chave para a gestão de projetos. A fase atual
                      continua com{" "}
                      <span className="font-mono">
                        {previousIntegrationKey}
                      </span>{" "}
                      e o histórico dela.
                    </>
                  ) : (
                    "Usada pela gestão de projetos para puxar as horas (opcional)."
                  )}
                </p>
              )}
            </div>

            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="phase-description">Descrição</Label>
              <Textarea
                id="phase-description"
                rows={3}
                placeholder="Escopo acordado para esta fase (opcional)"
                aria-describedby={
                  errors.description ? "phase-description-err" : undefined
                }
                {...register("description")}
              />
              <FieldError
                id="phase-description-err"
                message={errors.description?.message}
              />
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border border-border/50 p-4">
            <div className="space-y-0.5">
              <Label
                htmlFor="phase-copy-members"
                className="flex items-center gap-2"
              >
                <Users className="h-4 w-4" aria-hidden="true" />
                Manter a equipe atual
              </Label>
              <p className="text-xs text-muted-foreground">
                {memberCount} membro{memberCount !== 1 && "s"} da fase atual
                {copyMembers ? " continuam alocados." : " não serão copiados."}
              </p>
            </div>
            <Switch
              id="phase-copy-members"
              checked={copyMembers}
              onCheckedChange={handleCopyMembersChange}
            />
          </div>
        </form>

        <DialogFooter className="shrink-0 border-t border-border/50 px-6 py-4">
          <Button
            type="button"
            variant="ghost"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            form="project-new-phase-form"
            disabled={saving}
            className="gap-2 bg-brand-500 text-white hover:bg-brand-600"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <GitBranch className="h-4 w-4" aria-hidden="true" />
            )}
            Iniciar Fase {nextPhase}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
