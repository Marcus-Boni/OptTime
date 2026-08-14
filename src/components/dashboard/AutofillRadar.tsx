"use client";

/**
 * Proactive time-logging surface ("zero-friction logging").
 *
 * Sits at the top of the dashboard and turns Azure DevOps activity the user
 * never logged into one-click entries. Every proposal shows its evidence and
 * how the duration was estimated, so accepting one is an informed decision
 * rather than blind trust.
 *
 * Confirmation runs through the operator executors, which means these entries
 * land in the operator audit log and stay undoable like any other AI action.
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDot,
  ExternalLink,
  GitCommitHorizontal,
  GitPullRequest,
  GitPullRequestDraft,
  Info,
  Loader2,
  Pencil,
  RefreshCw,
  Sparkles,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { DurationInput } from "@/components/time/DurationInput";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { ActionTooltip } from "@/components/ui/tooltip";
import {
  type AutofillRadarController,
  useAutofillRadar,
} from "@/hooks/use-autofill-radar";
import {
  ExecutionError,
  executeAction,
  logOperatorAction,
} from "@/lib/ai/operator/executors";
import { cn, formatDateLabel, formatDuration } from "@/lib/utils";
import type { AutofillProposal, AutofillSignal } from "@/types/autofill";
import type { SuggestionConfidence } from "@/types/time-suggestions";

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  members?: { userId: string }[];
}

const SIGNAL_META: Record<
  AutofillSignal,
  { icon: React.ReactNode; label: string; accent: string }
> = {
  pr_completed: {
    icon: <GitPullRequest className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "PR concluído",
    accent: "text-emerald-600 dark:text-emerald-400",
  },
  pr_active: {
    icon: <GitPullRequestDraft className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "PR em revisão",
    accent: "text-blue-600 dark:text-blue-400",
  },
  commits_unlogged: {
    icon: <GitCommitHorizontal className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "Commits sem apontamento",
    accent: "text-orange-600 dark:text-orange-400",
  },
  work_item_active: {
    icon: <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "Task em andamento",
    accent: "text-neutral-500",
  },
};

const CONFIDENCE_META: Record<
  SuggestionConfidence,
  { label: string; className: string }
> = {
  high: {
    label: "Alta confiança",
    className: "border-emerald-500/30 text-emerald-600 dark:text-emerald-400",
  },
  medium: {
    label: "Confiança média",
    className: "border-amber-500/30 text-amber-600 dark:text-amber-400",
  },
  low: {
    label: "Sugestão",
    className: "border-neutral-500/30 text-neutral-500",
  },
};

// ─── Row ─────────────────────────────────────────────────────────────

interface ProposalRowProps {
  proposal: AutofillProposal;
  projects: ProjectOption[];
  onAccepted: (fingerprint: string) => void;
  onDismiss: (proposal: AutofillProposal) => void;
  onNeedProjects: () => void;
}

function ProposalRow({
  proposal,
  projects,
  onAccepted,
  onDismiss,
  onNeedProjects,
}: ProposalRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [projectId, setProjectId] = useState(proposal.projectId);
  const [description, setDescription] = useState(proposal.description);
  const [durationMinutes, setDurationMinutes] = useState(
    proposal.durationMinutes,
  );
  const [billable, setBillable] = useState(proposal.billable);

  const signal = SIGNAL_META[proposal.signal];
  const confidence = CONFIDENCE_META[proposal.confidence];

  const selectedProject = projects.find((item) => item.id === projectId);
  const projectName = selectedProject?.name ?? proposal.projectName;
  const projectColor = selectedProject?.color ?? proposal.projectColor;

  function handleStartEditing() {
    onNeedProjects();
    setIsEditing(true);
  }

  async function handleConfirm() {
    if (isSubmitting) return;

    if (!description.trim()) {
      toast.error("A descrição não pode estar vazia.");
      setIsEditing(true);
      return;
    }

    setIsSubmitting(true);

    try {
      const outcome = await executeAction({
        kind: "create_time_entry",
        projectId,
        projectName,
        projectColor,
        description: description.trim(),
        date: proposal.date,
        durationMinutes,
        billable,
        azureWorkItemId: proposal.azureWorkItemId,
        azureWorkItemTitle: proposal.azureWorkItemTitle,
        warning: null,
      });

      toast.success(
        `${formatDuration(durationMinutes)} registradas em ${projectName}.`,
      );

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: "create_time_entry",
        summary: `Registrar ${formatDuration(durationMinutes)} em ${projectName} (sugestão automática)`,
        status: "executed",
        authorization: "confirmed",
        inputMode: "text",
        resultId: outcome.resultId,
        errorMessage: null,
      });

      onAccepted(proposal.fingerprint);
    } catch (error: unknown) {
      const message =
        error instanceof ExecutionError || error instanceof Error
          ? error.message
          : "Não foi possível registrar as horas.";

      console.error("[AutofillRadar] handleConfirm:", error);
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="rounded-xl border border-border/60 bg-background/50 p-3 transition-colors duration-150 hover:border-orange-500/30">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span
              className={cn("inline-flex items-center gap-1", signal.accent)}
            >
              {signal.icon}
              {signal.label}
            </span>
            <span className="text-neutral-400" aria-hidden="true">
              ·
            </span>
            <span className="font-medium text-neutral-600 dark:text-neutral-300">
              {formatDateLabel(proposal.date)}
            </span>
            <Badge
              variant="outline"
              className={cn("h-4 px-1.5 text-[9px]", confidence.className)}
            >
              {confidence.label}
            </Badge>
          </p>

          <p className="mt-1 flex items-center gap-1.5 font-semibold text-foreground text-sm">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: projectColor }}
              aria-hidden="true"
            />
            <span className="truncate">{projectName}</span>
          </p>

          <p className="mt-0.5 truncate text-neutral-600 text-xs dark:text-neutral-400">
            {description}
          </p>
        </div>

        <span className="shrink-0 rounded-full bg-orange-500/15 px-2.5 py-0.5 font-bold font-mono text-[12px] text-orange-700 dark:text-orange-300">
          {formatDuration(durationMinutes)}
        </span>
      </div>

      {/* Evidence */}
      <ul className="mt-2 space-y-1">
        {proposal.evidence.map((item) => (
          <li
            key={`${item.kind}-${item.label}`}
            className="flex items-start gap-1.5 text-[11px] text-neutral-500"
          >
            <span className="mt-[3px] h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
            <span className="min-w-0">
              {item.url ? (
                <Link
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 underline decoration-dotted underline-offset-2 hover:text-orange-600 dark:hover:text-orange-400"
                >
                  {item.label}
                  <ExternalLink className="h-2.5 w-2.5" aria-hidden="true" />
                </Link>
              ) : (
                item.label
              )}
              {item.detail && (
                <span className="text-neutral-400"> — {item.detail}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {proposal.loggedMinutesOnDate > 0 && (
        <p className="mt-1.5 text-[10px] text-neutral-500">
          Você já tem {formatDuration(proposal.loggedMinutesOnDate)} nesse dia.
        </p>
      )}

      {/* Adjust panel */}
      <AnimatePresence initial={false}>
        {isEditing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-3 border-border/60 border-t pt-3">
              <div className="space-y-1">
                <label
                  htmlFor={`autofill-project-${proposal.fingerprint}`}
                  className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
                >
                  Projeto
                </label>
                <div id={`autofill-project-${proposal.fingerprint}`}>
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
                  htmlFor={`autofill-duration-${proposal.fingerprint}`}
                  className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
                >
                  Duração
                </label>
                <div id={`autofill-duration-${proposal.fingerprint}`}>
                  <DurationInput
                    value={durationMinutes}
                    onChange={setDurationMinutes}
                  />
                </div>
                <p className="flex items-start gap-1 text-[10px] text-neutral-500">
                  <Info
                    className="mt-0.5 h-2.5 w-2.5 shrink-0"
                    aria-hidden="true"
                  />
                  {proposal.durationBasis}
                </p>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor={`autofill-description-${proposal.fingerprint}`}
                  className="block font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
                >
                  Descrição
                </label>
                <Textarea
                  id={`autofill-description-${proposal.fingerprint}`}
                  rows={2}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="resize-none bg-background/80 text-xs"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor={`autofill-billable-${proposal.fingerprint}`}
                  className="font-medium text-[11px] text-neutral-600 dark:text-neutral-300"
                >
                  Faturável
                </label>
                <Switch
                  id={`autofill-billable-${proposal.fingerprint}`}
                  checked={billable}
                  onCheckedChange={setBillable}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Actions */}
      <div className="mt-2.5 flex items-center justify-end gap-1.5">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDismiss(proposal)}
          disabled={isSubmitting}
          className="h-7 cursor-pointer text-[11px] text-neutral-500 hover:text-foreground"
        >
          <X className="mr-1 h-3 w-3" aria-hidden="true" />
          Descartar
        </Button>

        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            isEditing ? setIsEditing(false) : handleStartEditing()
          }
          disabled={isSubmitting}
          aria-expanded={isEditing}
          className="h-7 cursor-pointer gap-1 border-orange-500/30 text-[11px] text-orange-600 hover:bg-orange-500/10 dark:text-orange-300"
        >
          {isEditing ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <Pencil className="h-3 w-3" aria-hidden="true" />
          )}
          {isEditing ? "Fechar" : "Ajustar"}
        </Button>

        <Button
          type="button"
          size="sm"
          onClick={handleConfirm}
          disabled={isSubmitting}
          aria-busy={isSubmitting}
          className="h-7 cursor-pointer gap-1 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
        >
          {isSubmitting ? (
            <Loader2
              className="h-3 w-3 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <Check className="h-3 w-3" aria-hidden="true" />
          )}
          Confirmar
        </Button>
      </div>
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────

export interface AutofillRadarProps {
  /** Pass an existing controller to share state; otherwise one is created. */
  controller?: AutofillRadarController;
}

export function AutofillRadar({ controller }: AutofillRadarProps) {
  const prefersReducedMotion = useReducedMotion();
  const ownController = useAutofillRadar({ enabled: !controller });
  const radar = controller ?? ownController;

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsRequested, setProjectsRequested] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);

  // The project list is only needed by the adjust panel, so it is fetched the
  // first time someone opens one.
  async function loadProjects() {
    if (projectsRequested) return;
    setProjectsRequested(true);

    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;

      const data = (await res.json()) as { projects?: ProjectOption[] };
      setProjects(data.projects ?? []);
    } catch (error: unknown) {
      console.error("[AutofillRadar] loadProjects:", error);
    }
  }

  const totalMinutes = useMemo(
    () =>
      radar.proposals.reduce(
        (sum, proposal) => sum + proposal.durationMinutes,
        0,
      ),
    [radar.proposals],
  );

  /** Confirms every proposal in order, stopping at the first failure. */
  async function handleConfirmAll() {
    if (isBatchRunning) return;
    setIsBatchRunning(true);

    let accepted = 0;

    try {
      for (const proposal of [...radar.proposals]) {
        try {
          const outcome = await executeAction({
            kind: "create_time_entry",
            projectId: proposal.projectId,
            projectName: proposal.projectName,
            projectColor: proposal.projectColor,
            description: proposal.description,
            date: proposal.date,
            durationMinutes: proposal.durationMinutes,
            billable: proposal.billable,
            azureWorkItemId: proposal.azureWorkItemId,
            azureWorkItemTitle: proposal.azureWorkItemTitle,
            warning: null,
          });

          await logOperatorAction({
            planId: null,
            stepIndex: 0,
            kind: "create_time_entry",
            summary: `Registrar ${formatDuration(proposal.durationMinutes)} em ${proposal.projectName} (sugestão automática)`,
            status: "executed",
            authorization: "confirmed",
            inputMode: "text",
            resultId: outcome.resultId,
            errorMessage: null,
          });

          radar.resolve(proposal.fingerprint);
          accepted += 1;
        } catch (error: unknown) {
          console.error("[AutofillRadar] handleConfirmAll:", error);
          toast.error(
            error instanceof Error
              ? `Parou em "${proposal.description}": ${error.message}`
              : "Falha ao registrar uma das sugestões.",
          );
          break;
        }
      }

      if (accepted > 0) {
        toast.success(
          accepted === 1
            ? "1 registro criado."
            : `${accepted} registros criados.`,
        );
      }
    } finally {
      setIsBatchRunning(false);
    }
  }

  // Nothing to show: stay completely out of the way.
  if (radar.isLoading) {
    return (
      <output
        className="block animate-pulse rounded-xl border border-border/50 bg-card/60 p-4 motion-reduce:animate-none"
        aria-label="Procurando atividade sem apontamento"
      >
        <div className="h-4 w-52 rounded bg-neutral-200 dark:bg-neutral-800" />
        <div className="mt-2 h-3 w-72 rounded bg-neutral-200/70 dark:bg-neutral-800/60" />
      </output>
    );
  }

  if (radar.proposals.length === 0) return null;

  return (
    <motion.div
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: -8 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
    >
      <Card className="border-orange-500/30 bg-gradient-to-br from-orange-500/10 via-card/80 to-card/80 backdrop-blur">
        <CardContent className="p-4">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <h2 className="flex items-center gap-1.5 font-display font-semibold text-base text-foreground">
                <Sparkles
                  className="h-4 w-4 text-orange-500"
                  aria-hidden="true"
                />
                Horas que faltam registrar
              </h2>
              <p className="mt-0.5 text-muted-foreground text-xs">
                Encontramos {radar.proposals.length} atividade(s) no Azure
                DevOps sem apontamento
                {radar.from && radar.to
                  ? ` entre ${formatDateLabel(radar.from)} e ${formatDateLabel(radar.to)}`
                  : ""}
                .
              </p>
            </div>

            <ActionTooltip label="Procurar novamente" side="left">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => radar.refresh()}
                aria-label="Procurar novamente"
                className="h-7 w-7 shrink-0 cursor-pointer p-0 text-neutral-500 hover:text-foreground"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </ActionTooltip>
          </header>

          {radar.warnings.length > 0 && (
            <ul className="mt-2 space-y-1">
              {radar.warnings.map((warning) => (
                <li
                  key={warning}
                  className="flex gap-1.5 text-[11px] text-amber-700 dark:text-amber-400"
                >
                  <AlertTriangle
                    className="mt-0.5 h-3 w-3 shrink-0"
                    aria-hidden="true"
                  />
                  <span>{warning}</span>
                </li>
              ))}
            </ul>
          )}

          <ul className="mt-3 space-y-2">
            <AnimatePresence initial={false}>
              {radar.proposals.map((proposal) => (
                <motion.li
                  key={proposal.fingerprint}
                  layout={!prefersReducedMotion}
                  initial={
                    prefersReducedMotion ? undefined : { opacity: 0, y: 8 }
                  }
                  animate={
                    prefersReducedMotion ? undefined : { opacity: 1, y: 0 }
                  }
                  exit={
                    prefersReducedMotion
                      ? undefined
                      : { opacity: 0, scale: 0.98 }
                  }
                  transition={{ duration: 0.2 }}
                >
                  <ProposalRow
                    proposal={proposal}
                    projects={projects}
                    onAccepted={radar.resolve}
                    onDismiss={radar.dismiss}
                    onNeedProjects={loadProjects}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>

          {radar.proposals.length > 1 && (
            <div className="mt-3 flex items-center justify-between gap-3 border-border/60 border-t pt-3">
              <p className="text-[11px] text-muted-foreground">
                Total sugerido:{" "}
                <span className="font-mono font-semibold text-foreground">
                  {formatDuration(totalMinutes)}
                </span>
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleConfirmAll}
                disabled={isBatchRunning}
                aria-busy={isBatchRunning}
                className="h-8 cursor-pointer gap-1.5 border-orange-500/40 text-[11px] text-orange-600 hover:bg-orange-500/10 dark:text-orange-300"
              >
                {isBatchRunning ? (
                  <Loader2
                    className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                    aria-hidden="true"
                  />
                ) : (
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                Confirmar todas ({radar.proposals.length})
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default AutofillRadar;
