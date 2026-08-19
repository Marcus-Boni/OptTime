"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Clock,
  Edit3,
  Loader2,
  Play,
  Send,
  Square,
  X,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  DeleteTimeEntryCard,
  ExportReportCard,
  NotifyTeamCard,
  TimerToggleCard,
  TimesheetReviewCard,
  UpdateTimeEntryCard,
} from "@/components/ai/operator/OperatorActionCards";
import { OperatorPlanCard } from "@/components/ai/operator/OperatorPlanCard";
import { DurationInput } from "@/components/time/DurationInput";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { WorkItemCombobox } from "@/components/time/WorkItemCombobox";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAutoRunAction } from "@/hooks/use-auto-run-action";
import { actionKey, markExecuted } from "@/lib/ai/operator/executed-store";
import { logOperatorAction } from "@/lib/ai/operator/executors";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import type {
  AssistantAction,
  CreateTimeEntryAction,
  NavigateAction,
  StartTimerAction,
  StopTimerAction,
  SubmitTimesheetAction,
} from "@/lib/ai/types";
import {
  dispatchTimeEntriesUpdated,
  dispatchTimerUpdated,
  dispatchTimesheetsUpdated,
} from "@/lib/time-events";
import { formatDuration } from "@/lib/utils";

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  members?: { userId: string }[];
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const payload = (await res.json().catch(() => null)) as {
    error?: string;
  } | null;
  return payload?.error ?? fallback;
}

// ─── Shared shell ────────────────────────────────────────────────────

function ActionShell({
  title,
  badge,
  warning,
  children,
}: {
  title: string;
  badge?: string;
  warning?: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 shadow-sm dark:bg-orange-950/20">
      <header className="flex items-center justify-between gap-2 border-orange-500/20 border-b pb-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-[11px] text-orange-600 uppercase tracking-wide dark:text-orange-400">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {title}
        </h4>
        {badge && (
          <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 font-mono font-bold text-[11px] text-orange-700 dark:text-orange-300">
            {badge}
          </span>
        )}
      </header>

      {warning && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{warning}</span>
        </p>
      )}

      {children}
    </section>
  );
}

function DoneState({ label }: { label: string }) {
  return (
    <p className="mt-3 flex items-center gap-1.5 font-semibold text-[12px] text-emerald-600 dark:text-emerald-400">
      <Check className="h-4 w-4" aria-hidden="true" />
      {label}
    </p>
  );
}

/** Shown instead of the confirm button when the user delegated the action. */
function AutoRunNotice({ isRunning }: { isRunning: boolean }) {
  return (
    <p className="flex items-center justify-end gap-1.5 pt-2 text-[11px] text-orange-600 dark:text-orange-400">
      <Zap className="h-3 w-3" aria-hidden="true" />
      {isRunning ? "Executando automaticamente…" : "Autorizada por você"}
    </p>
  );
}

// ─── Create time entry ───────────────────────────────────────────────

function CreateTimeEntryCard({
  action,
  inputMode,
}: {
  action: CreateTimeEntryAction;
  inputMode: OperatorInputMode;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreated, setIsCreated] = useState(false);
  /** Distinguishes a delegated run from a clicked one in the audit trail. */
  const wasAutoRef = useRef(false);

  const [description, setDescription] = useState(action.description);
  const [durationMinutes, setDurationMinutes] = useState(
    action.durationMinutes,
  );
  const [projectId, setProjectId] = useState(action.projectId ?? "");
  const [workItem, setWorkItem] = useState<{
    id: number;
    title: string;
  } | null>(
    action.azureWorkItemId
      ? {
          id: action.azureWorkItemId,
          title: action.azureWorkItemTitle ?? "Work Item",
        }
      : null,
  );
  const [projects, setProjects] = useState<ProjectOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;

        const data = (await res.json()) as { projects?: ProjectOption[] };
        if (cancelled || !data.projects) return;

        setProjects(data.projects);
        setProjectId((current) => current || data.projects?.[0]?.id || "");
      } catch (error: unknown) {
        console.error("[CreateTimeEntryCard] loadProjects:", error);
      }
    }

    loadProjects();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedProject = useMemo(
    () => projects.find((item) => item.id === projectId),
    [projects, projectId],
  );

  const projectName =
    selectedProject?.name ?? action.projectName ?? "Selecione um projeto";
  const projectColor =
    selectedProject?.color ?? action.projectColor ?? "#f97316";

  // Missing project is the only blocker we resolve inline.
  const needsProject = !projectId;

  async function handleConfirm(event?: React.FormEvent) {
    event?.preventDefault();

    if (!projectId) {
      toast.error("Selecione um projeto para continuar.");
      setIsEditing(true);
      return;
    }

    if (!description.trim()) {
      toast.error("A descrição não pode estar vazia.");
      setIsEditing(true);
      return;
    }

    if (isSubmitting || isCreated) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-timezone": resolveTimeZone(),
        },
        body: JSON.stringify({
          projectId,
          description: description.trim(),
          date: action.date,
          duration: durationMinutes,
          billable: action.billable,
          azureWorkItemId: workItem?.id,
          azureWorkItemTitle: workItem?.title,
        }),
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Falha ao registrar as horas."));
      }

      const payload = (await res.json().catch(() => null)) as {
        entry?: { id?: string };
      } | null;

      markExecuted(actionKey(action));
      setIsCreated(true);
      setIsEditing(false);
      dispatchTimeEntriesUpdated();
      dispatchTimesheetsUpdated();
      toast.success(`${formatDuration(durationMinutes)} registradas!`);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "create_time_entry",
        summary: `Registrar ${formatDuration(durationMinutes)} em ${projectName}`,
        status: "executed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: payload?.entry?.id ?? null,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[CreateTimeEntryCard] handleConfirm:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao registrar horas.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "create_time_entry",
        summary: `Registrar ${formatDuration(durationMinutes)} em ${projectName}`,
        status: "failed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // A delegated entry only runs once the project is resolved; without one the
  // card still needs a human to pick it.
  const { willAutoRun } = useAutoRunAction(action, () => {
    if (!action.projectId) return;
    wasAutoRef.current = true;
    return handleConfirm();
  });

  return (
    <ActionShell
      title="Confirmar lançamento"
      badge={formatDuration(durationMinutes)}
      warning={action.warning}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isEditing ? (
          <motion.form
            key="edit"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleConfirm}
            className="mt-3 space-y-3"
          >
            <div className="space-y-1">
              <label
                htmlFor="tb-entry-project"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Projeto <span className="text-orange-500">*</span>
              </label>
              <div id="tb-entry-project">
                <ProjectCombobox
                  projects={projects}
                  value={projectId}
                  onChange={setProjectId}
                  byPassMemberFilter
                  placeholder="Selecione um projeto..."
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="tb-entry-workitem"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Work Item <span className="text-neutral-500">(opcional)</span>
              </label>
              <div id="tb-entry-workitem">
                <WorkItemCombobox
                  projectName={projectName}
                  value={workItem}
                  onChange={setWorkItem}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="tb-entry-duration"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Duração <span className="text-orange-500">*</span>
              </label>
              <div id="tb-entry-duration">
                <DurationInput
                  value={durationMinutes}
                  onChange={setDurationMinutes}
                />
              </div>
            </div>

            <div className="space-y-1">
              <label
                htmlFor="tb-entry-description"
                className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
              >
                Descrição <span className="text-orange-500">*</span>
              </label>
              <Textarea
                id="tb-entry-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                className="resize-none bg-background/80 text-xs"
              />
            </div>

            <div className="flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsEditing(false)}
                className="h-8 cursor-pointer text-[11px]"
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Cancelar
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={isSubmitting}
                aria-busy={isSubmitting}
                className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
              >
                {isSubmitting ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Salvar e registrar
              </Button>
            </div>
          </motion.form>
        ) : (
          <motion.div
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="mt-2.5 space-y-1.5"
          >
            <p className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: projectColor }}
                aria-hidden="true"
              />
              <span className="truncate">{projectName}</span>
            </p>

            <p className="pl-4 text-[11px] text-neutral-600 italic leading-relaxed dark:text-neutral-300">
              “{description}”
            </p>

            <p className="pl-4 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
              {action.date}
              {workItem ? ` · #${workItem.id}` : ""}
              {action.billable ? " · faturável" : " · não faturável"}
            </p>

            {isCreated ? (
              <DoneState label="Registrado com sucesso!" />
            ) : willAutoRun && !needsProject ? (
              <AutoRunNotice isRunning={isSubmitting} />
            ) : (
              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setIsEditing(true)}
                  className="h-8 cursor-pointer gap-1.5 border-orange-500/30 text-[11px] text-orange-600 hover:bg-orange-500/10 dark:text-orange-300"
                >
                  <Edit3 className="h-3.5 w-3.5" aria-hidden="true" />
                  Editar
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => handleConfirm()}
                  disabled={isSubmitting || needsProject}
                  aria-busy={isSubmitting}
                  className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
                >
                  {isSubmitting ? (
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  Confirmar
                </Button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </ActionShell>
  );
}

// ─── Start timer ─────────────────────────────────────────────────────

function StartTimerCard({
  action,
  inputMode,
}: {
  action: StartTimerAction;
  inputMode: OperatorInputMode;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStarted, setIsStarted] = useState(false);
  const wasAutoRef = useRef(false);

  async function handleStart() {
    if (!action.projectId) {
      toast.error("Projeto não identificado. Inicie o timer pela sidebar.");
      return;
    }

    if (isSubmitting || isStarted) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/timer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-timezone": resolveTimeZone(),
        },
        body: JSON.stringify({
          projectId: action.projectId,
          description: action.description,
          billable: action.billable,
          azureWorkItemId: action.azureWorkItemId ?? undefined,
          azureWorkItemTitle: action.azureWorkItemTitle ?? undefined,
        }),
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Falha ao iniciar o timer."));
      }

      markExecuted(actionKey(action));
      setIsStarted(true);
      dispatchTimerUpdated();
      dispatchTimeEntriesUpdated();
      toast.success("Timer iniciado!");

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "start_timer",
        summary: `Iniciar cronômetro em ${action.projectName ?? "projeto"}`,
        status: "executed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[StartTimerCard] handleStart:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao iniciar o timer.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "start_timer",
        summary: `Iniciar cronômetro em ${action.projectName ?? "projeto"}`,
        status: "failed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const { willAutoRun } = useAutoRunAction(action, () => {
    if (!action.projectId) return;
    wasAutoRef.current = true;
    return handleStart();
  });

  return (
    <ActionShell title="Iniciar cronômetro" warning={action.warning}>
      <div className="mt-2.5 space-y-1.5">
        <p className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: action.projectColor ?? "#f97316" }}
            aria-hidden="true"
          />
          <span className="truncate">
            {action.projectName ?? "Projeto não identificado"}
          </span>
        </p>

        {action.description && (
          <p className="pl-4 text-[11px] text-neutral-600 italic dark:text-neutral-300">
            “{action.description}”
          </p>
        )}

        {isStarted ? (
          <DoneState label="Timer em execução!" />
        ) : willAutoRun && action.projectId ? (
          <AutoRunNotice isRunning={isSubmitting} />
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleStart}
              disabled={isSubmitting || !action.projectId}
              aria-busy={isSubmitting}
              className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
            >
              {isSubmitting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Iniciar agora
            </Button>
          </div>
        )}
      </div>
    </ActionShell>
  );
}

// ─── Stop timer ──────────────────────────────────────────────────────

function StopTimerCard({
  action,
  inputMode,
}: {
  action: StopTimerAction;
  inputMode: OperatorInputMode;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isStopped, setIsStopped] = useState(false);
  const wasAutoRef = useRef(false);

  async function handleStop() {
    if (isSubmitting || isStopped) return;

    setIsSubmitting(true);

    try {
      const res = await fetch("/api/timer", {
        method: "DELETE",
        headers: { "x-timezone": resolveTimeZone() },
      });

      if (!res.ok) {
        throw new Error(await readError(res, "Falha ao parar o timer."));
      }

      const payload = (await res.json().catch(() => null)) as {
        entry?: { id?: string };
      } | null;

      markExecuted(actionKey(action));
      setIsStopped(true);
      dispatchTimerUpdated();
      dispatchTimeEntriesUpdated();
      dispatchTimesheetsUpdated();
      toast.success("Timer parado e horas registradas!");

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "stop_timer",
        summary: `Parar cronômetro (${formatDuration(action.elapsedMinutes)})`,
        status: "executed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: payload?.entry?.id ?? null,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[StopTimerCard] handleStop:", error);
      const message =
        error instanceof Error ? error.message : "Erro ao parar o timer.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "stop_timer",
        summary: `Parar cronômetro (${formatDuration(action.elapsedMinutes)})`,
        status: "failed",
        authorization: wasAutoRef.current ? "auto" : "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  const { willAutoRun } = useAutoRunAction(action, () => {
    wasAutoRef.current = true;
    return handleStop();
  });

  return (
    <ActionShell
      title="Parar cronômetro"
      badge={formatDuration(action.elapsedMinutes)}
    >
      <div className="mt-2.5 space-y-1.5">
        <p className="truncate font-semibold text-[12px] text-foreground">
          {action.projectName ?? "Projeto"}
        </p>
        {action.description && (
          <p className="text-[11px] text-neutral-600 italic dark:text-neutral-300">
            “{action.description}”
          </p>
        )}

        {isStopped ? (
          <DoneState label="Horas registradas!" />
        ) : willAutoRun ? (
          <AutoRunNotice isRunning={isSubmitting} />
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleStop}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
            >
              {isSubmitting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Square className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Parar e registrar
            </Button>
          </div>
        )}
      </div>
    </ActionShell>
  );
}

// ─── Submit timesheet ────────────────────────────────────────────────

function SubmitTimesheetCard({
  action,
  inputMode,
}: {
  action: SubmitTimesheetAction;
  inputMode: OperatorInputMode;
}) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);

  // Submitting is outward-facing (it reaches the manager and locks the week),
  // so it always requires this click — never an auto-run.
  async function handleSubmit() {
    if (isSubmitting || isSubmitted) return;

    setIsSubmitting(true);

    try {
      // Ensures the timesheet row exists before transitioning its status.
      const createRes = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period: action.period, periodType: "weekly" }),
      });

      if (!createRes.ok) {
        throw new Error(
          await readError(createRes, "Falha ao localizar o timesheet."),
        );
      }

      const created = (await createRes.json()) as {
        timesheet?: { id?: string };
      };
      const timesheetId = created.timesheet?.id;

      if (!timesheetId) {
        throw new Error("Timesheet não encontrado para este período.");
      }

      const submitRes = await fetch(`/api/timesheets/${timesheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });

      if (!submitRes.ok) {
        throw new Error(
          await readError(submitRes, "Falha ao submeter o timesheet."),
        );
      }

      markExecuted(actionKey(action));
      setIsSubmitted(true);
      dispatchTimesheetsUpdated();
      dispatchTimeEntriesUpdated();
      toast.success("Timesheet submetido para aprovação!");

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "submit_timesheet",
        summary: `Submeter timesheet ${action.period}`,
        status: "executed",
        authorization: "confirmed",
        inputMode,
        resultId: timesheetId,
        errorMessage: null,
      });
    } catch (error: unknown) {
      console.error("[SubmitTimesheetCard] handleSubmit:", error);
      const message =
        error instanceof Error
          ? error.message
          : "Erro ao submeter o timesheet.";
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "submit_timesheet",
        summary: `Submeter timesheet ${action.period}`,
        status: "failed",
        authorization: "confirmed",
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <ActionShell
      title="Submeter timesheet"
      badge={formatDuration(action.totalMinutes)}
      warning={action.warning}
    >
      <div className="mt-2.5 space-y-1.5">
        <p className="font-semibold text-[12px] text-foreground">
          {action.period}
        </p>
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          {action.periodLabel} · {action.entryCount} lançamento(s)
        </p>

        {isSubmitted ? (
          <DoneState label="Enviado para aprovação!" />
        ) : (
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSubmit}
              disabled={isSubmitting}
              aria-busy={isSubmitting}
              className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
            >
              {isSubmitting ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Send className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Confirmar envio
            </Button>
          </div>
        )}
      </div>
    </ActionShell>
  );
}

// ─── Navigate ────────────────────────────────────────────────────────

function NavigateCard({ action }: { action: NavigateAction }) {
  const router = useRouter();

  return (
    <div className="mt-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => router.push(action.path)}
        className="h-8 cursor-pointer gap-1.5 border-orange-500/40 text-[11px] text-orange-600 hover:bg-orange-500/10 dark:text-orange-300"
      >
        {action.label}
        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
      </Button>
    </div>
  );
}

// ─── Renderer ────────────────────────────────────────────────────────

export interface AssistantActionViewProps {
  action: AssistantAction;
  /** How the originating command arrived, recorded in the operator audit log. */
  inputMode?: OperatorInputMode;
}

export function AssistantActionView({
  action,
  inputMode = "text",
}: AssistantActionViewProps) {
  switch (action.kind) {
    case "create_time_entry":
      return <CreateTimeEntryCard action={action} inputMode={inputMode} />;
    case "start_timer":
      return <StartTimerCard action={action} inputMode={inputMode} />;
    case "stop_timer":
      return <StopTimerCard action={action} inputMode={inputMode} />;
    case "submit_timesheet":
      return <SubmitTimesheetCard action={action} inputMode={inputMode} />;
    case "update_time_entry":
      return <UpdateTimeEntryCard action={action} inputMode={inputMode} />;
    case "delete_time_entry":
      return <DeleteTimeEntryCard action={action} inputMode={inputMode} />;
    case "pause_timer":
    case "resume_timer":
      return <TimerToggleCard action={action} inputMode={inputMode} />;
    case "approve_timesheet":
    case "reject_timesheet":
      return <TimesheetReviewCard action={action} inputMode={inputMode} />;
    case "export_report":
      return <ExportReportCard action={action} inputMode={inputMode} />;
    case "notify_team":
      return <NotifyTeamCard action={action} inputMode={inputMode} />;
    case "operator_plan":
      return <OperatorPlanCard action={action} inputMode={inputMode} />;
    case "navigate":
      return <NavigateCard action={action} />;
    default:
      return null;
  }
}
