"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  CircleDot,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  SkipForward,
  Sparkles,
  X,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useOperatorPolicy } from "@/hooks/use-operator-policy";
import {
  hasExecuted,
  markExecuted,
  planKey,
} from "@/lib/ai/operator/executed-store";
import {
  ExecutionError,
  executeAction,
  logOperatorAction,
} from "@/lib/ai/operator/executors";
import { describeStep, isConfirmableAction } from "@/lib/ai/operator/plan";
import { OPERATOR_ACTIONS } from "@/lib/ai/operator/policy";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import type {
  ConfirmableAction,
  OperatorPlanAction,
  OperatorPlanStep,
} from "@/lib/ai/types";
import { cn } from "@/lib/utils";

type StepState = "pending" | "running" | "done" | "failed" | "skipped";

interface StepRuntime {
  state: StepState;
  message: string | null;
}

/**
 * A plan runs at most once. The marker is durable because conversations (and
 * their cards) are restored from localStorage — an in-memory guard would let a
 * page reload replay the whole plan.
 */
function hasPlanRun(planId: string): boolean {
  return hasExecuted(planKey(planId));
}

function markPlanStarted(planId: string): void {
  markExecuted(planKey(planId));
}

function stepWarning(action: ConfirmableAction): string | null {
  return "warning" in action ? (action.warning ?? null) : null;
}

// ─── Step row ────────────────────────────────────────────────────────

interface StepRowProps {
  step: OperatorPlanStep;
  runtime: StepRuntime;
  autoRuns: boolean;
  canSkip: boolean;
  onSkip: () => void;
}

function StepIcon({ state }: { state: StepState }) {
  if (state === "running") {
    return (
      <Loader2
        className="h-4 w-4 animate-spin text-orange-500 motion-reduce:animate-none"
        aria-hidden="true"
      />
    );
  }

  if (state === "done") {
    return (
      <Check
        className="h-4 w-4 text-emerald-600 dark:text-emerald-400"
        aria-hidden="true"
      />
    );
  }

  if (state === "failed") {
    return (
      <AlertTriangle
        className="h-4 w-4 text-red-500 dark:text-red-400"
        aria-hidden="true"
      />
    );
  }

  if (state === "skipped") {
    return (
      <SkipForward className="h-4 w-4 text-neutral-400" aria-hidden="true" />
    );
  }

  return <CircleDot className="h-4 w-4 text-neutral-400" aria-hidden="true" />;
}

const STATE_LABELS: Record<StepState, string> = {
  pending: "pendente",
  running: "em execução",
  done: "concluída",
  failed: "falhou",
  skipped: "ignorada",
};

function StepRow({ step, runtime, autoRuns, canSkip, onSkip }: StepRowProps) {
  const action = step.action;
  const meta = isConfirmableAction(action)
    ? OPERATOR_ACTIONS[action.kind]
    : undefined;
  const warning = isConfirmableAction(action) ? stepWarning(action) : null;

  return (
    <li
      className={cn(
        "flex gap-2.5 rounded-lg border p-2.5 transition-colors duration-150",
        runtime.state === "done" &&
          "border-emerald-500/30 bg-emerald-500/5 dark:bg-emerald-950/20",
        runtime.state === "failed" &&
          "border-red-500/30 bg-red-500/5 dark:bg-red-950/20",
        runtime.state === "running" && "border-orange-500/40 bg-orange-500/10",
        runtime.state === "skipped" && "border-border/60 opacity-60",
        runtime.state === "pending" && "border-border/60",
      )}
    >
      <span className="mt-0.5 shrink-0">
        <StepIcon state={runtime.state} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
          <span className="truncate">{step.title}</span>
          <span className="sr-only"> — {STATE_LABELS[runtime.state]}</span>
          {autoRuns && runtime.state === "pending" && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-orange-500/15 px-1.5 py-0.5 font-medium text-[9px] text-orange-600 uppercase tracking-wide dark:text-orange-400"
              title="Esta ação está autorizada a rodar sem confirmação"
            >
              <Zap className="h-2.5 w-2.5" aria-hidden="true" />
              auto
            </span>
          )}
          {meta?.outward && (
            <span
              className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-500/15 px-1.5 py-0.5 font-medium text-[9px] text-blue-600 uppercase tracking-wide dark:text-blue-400"
              title="Esta ação é visível fora do app e sempre exige confirmação"
            >
              <ShieldCheck className="h-2.5 w-2.5" aria-hidden="true" />
              externa
            </span>
          )}
        </p>

        {step.detail && (
          <p className="mt-0.5 truncate text-[11px] text-neutral-600 dark:text-neutral-400">
            {step.detail}
          </p>
        )}

        {runtime.message && (
          <p
            className={cn(
              "mt-1 text-[11px]",
              runtime.state === "failed"
                ? "text-red-600 dark:text-red-400"
                : "text-emerald-600 dark:text-emerald-400",
            )}
          >
            {runtime.message}
          </p>
        )}

        {warning && runtime.state === "pending" && (
          <p className="mt-1 flex gap-1 text-[11px] text-amber-700 dark:text-amber-400">
            <AlertTriangle
              className="mt-0.5 h-3 w-3 shrink-0"
              aria-hidden="true"
            />
            <span>{warning}</span>
          </p>
        )}
      </div>

      {canSkip && runtime.state === "pending" && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onSkip}
          className="h-6 shrink-0 cursor-pointer px-1.5 text-[10px] text-neutral-500 hover:text-foreground"
        >
          Pular
        </Button>
      )}
    </li>
  );
}

// ─── Plan card ───────────────────────────────────────────────────────

export interface OperatorPlanCardProps {
  action: OperatorPlanAction;
  inputMode?: OperatorInputMode;
}

export function OperatorPlanCard({
  action,
  inputMode = "text",
}: OperatorPlanCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const { permissionFor, isLoading } = useOperatorPolicy();

  const [runtimes, setRuntimes] = useState<Record<string, StepRuntime>>(() =>
    Object.fromEntries(
      action.steps.map((step) => [
        step.id,
        { state: "pending" as StepState, message: null },
      ]),
    ),
  );
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  /** Steps the user chose not to run; consulted inside the run loop. */
  const skippedRef = useRef<Set<string>>(new Set());

  const setRuntime = useCallback((stepId: string, next: StepRuntime) => {
    setRuntimes((current) => ({ ...current, [stepId]: next }));
  }, []);

  const confirmableSteps = useMemo(
    () => action.steps.filter((step) => isConfirmableAction(step.action)),
    [action.steps],
  );

  /** True when every step is pre-authorised, so the plan may run on arrival. */
  const runsUnattended = useMemo(() => {
    if (isLoading || confirmableSteps.length === 0) return false;

    return confirmableSteps.every((step) => {
      const stepAction = step.action;
      if (!isConfirmableAction(stepAction)) return true;
      return permissionFor(stepAction.kind) === "auto";
    });
  }, [confirmableSteps, isLoading, permissionFor]);

  const runFrom = useCallback(
    async (startIndex: number) => {
      setIsRunning(true);

      let completed = 0;
      let failedAt: number | null = null;

      for (let index = startIndex; index < action.steps.length; index++) {
        const step = action.steps[index];
        if (!step) continue;

        const stepAction = step.action;

        if (!isConfirmableAction(stepAction)) continue;

        if (skippedRef.current.has(step.id)) {
          setRuntime(step.id, { state: "skipped", message: null });
          continue;
        }

        setRuntime(step.id, { state: "running", message: null });

        try {
          const outcome = await executeAction(stepAction);

          setRuntime(step.id, { state: "done", message: outcome.message });
          completed++;

          await logOperatorAction({
            planId: action.planId,
            stepIndex: step.index,
            kind: stepAction.kind,
            summary: describeStep(stepAction).title,
            status: "executed",
            authorization: runsUnattended ? "auto" : "confirmed",
            inputMode,
            resultId: outcome.resultId,
            errorMessage: null,
          });
        } catch (error: unknown) {
          const message =
            error instanceof ExecutionError || error instanceof Error
              ? error.message
              : "Falha ao executar a ação.";

          console.error("[OperatorPlanCard] step failed:", error);
          setRuntime(step.id, { state: "failed", message });

          await logOperatorAction({
            planId: action.planId,
            stepIndex: step.index,
            kind: stepAction.kind,
            summary: describeStep(stepAction).title,
            status: "failed",
            authorization: runsUnattended ? "auto" : "confirmed",
            inputMode,
            resultId: null,
            errorMessage: message,
          });

          failedAt = index;
          break;
        }
      }

      setIsRunning(false);
      setHasRun(true);

      if (failedAt !== null) {
        toast.error(
          `Plano interrompido na etapa ${failedAt + 1}. As etapas seguintes não foram executadas.`,
        );
        return;
      }

      if (completed > 0) {
        toast.success(
          completed === 1
            ? "Ação concluída!"
            : `Plano concluído — ${completed} ações executadas.`,
        );
      }
    },
    [action.planId, action.steps, inputMode, runsUnattended, setRuntime],
  );

  // Autopilot: a fully pre-authorised plan starts the moment it arrives.
  useEffect(() => {
    if (isLoading || !runsUnattended) return;
    if (hasPlanRun(action.planId)) return;

    markPlanStarted(action.planId);
    runFrom(0);
  }, [action.planId, isLoading, runsUnattended, runFrom]);

  function handleRun() {
    if (hasPlanRun(action.planId)) {
      toast.info("Este plano já foi executado.");
      setHasRun(true);
      return;
    }

    markPlanStarted(action.planId);
    runFrom(0);
  }

  function handleSkip(stepId: string) {
    skippedRef.current.add(stepId);
    setRuntime(stepId, { state: "skipped", message: null });
  }

  /** Resumes after a failure, starting at the step that follows it. */
  function handleContinue() {
    const failedIndex = action.steps.findIndex(
      (step) => runtimes[step.id]?.state === "failed",
    );
    if (failedIndex < 0) return;

    runFrom(failedIndex + 1);
  }

  const doneCount = action.steps.filter(
    (step) =>
      runtimes[step.id]?.state === "done" ||
      runtimes[step.id]?.state === "skipped",
  ).length;

  const hasFailure = action.steps.some(
    (step) => runtimes[step.id]?.state === "failed",
  );
  const hasPendingAfterFailure =
    hasFailure &&
    action.steps.some((step) => runtimes[step.id]?.state === "pending");

  const progress = Math.round((doneCount / action.steps.length) * 100);
  const warnings = action.steps
    .map((step) =>
      isConfirmableAction(step.action) ? stepWarning(step.action) : null,
    )
    .filter((value): value is string => Boolean(value));

  if (isDismissed) {
    return (
      <p className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-500">
        <X className="h-3.5 w-3.5" aria-hidden="true" />
        Plano descartado — nada foi executado.
      </p>
    );
  }

  return (
    <motion.section
      initial={prefersReducedMotion ? undefined : { opacity: 0, y: 8 }}
      animate={prefersReducedMotion ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/10 p-3 shadow-sm dark:bg-orange-950/20"
      aria-label="Plano de ações do assistente"
    >
      <header className="flex items-center justify-between gap-2 border-orange-500/20 border-b pb-2">
        <h4 className="flex items-center gap-1.5 font-semibold text-[11px] text-orange-600 uppercase tracking-wide dark:text-orange-400">
          <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
          Plano de ação
        </h4>
        <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 font-mono font-bold text-[11px] text-orange-700 dark:text-orange-300">
          {action.steps.length} etapas
        </span>
      </header>

      {(isRunning || hasRun) && (
        <div className="mt-2.5">
          <Progress
            value={progress}
            aria-label={`Progresso do plano: ${progress}%`}
            className="h-1.5"
          />
          <p className="mt-1 text-right font-mono text-[10px] text-neutral-500">
            {doneCount}/{action.steps.length}
          </p>
        </div>
      )}

      <ul className="mt-2.5 space-y-1.5">
        {action.steps.map((step) => {
          const stepAction = step.action;
          const autoRuns =
            isConfirmableAction(stepAction) &&
            permissionFor(stepAction.kind) === "auto";

          return (
            <StepRow
              key={step.id}
              step={step}
              runtime={runtimes[step.id] ?? { state: "pending", message: null }}
              autoRuns={autoRuns}
              canSkip={!isRunning && !hasRun}
              onSkip={() => handleSkip(step.id)}
            />
          );
        })}
      </ul>

      {warnings.length > 0 && !hasRun && (
        <ul className="mt-2 space-y-1">
          {warnings.map((warning) => (
            <li
              key={warning}
              className="flex gap-1.5 rounded-lg bg-amber-500/15 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-400"
            >
              <AlertTriangle
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>{warning}</span>
            </li>
          ))}
        </ul>
      )}

      {!hasRun && !isRunning && (
        <div className="flex items-center justify-end gap-2 pt-2.5">
          {runsUnattended ? (
            <p className="flex items-center gap-1 text-[11px] text-orange-600 dark:text-orange-400">
              <Zap className="h-3 w-3" aria-hidden="true" />
              Executando automaticamente…
            </p>
          ) : (
            <>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setIsDismissed(true)}
                className="h-8 cursor-pointer text-[11px]"
              >
                <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Descartar
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={handleRun}
                className="h-8 cursor-pointer gap-1.5 bg-orange-500 text-[11px] text-white hover:bg-orange-600"
              >
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                Executar plano
              </Button>
            </>
          )}
        </div>
      )}

      {isRunning && (
        <p className="flex items-center justify-end gap-1.5 pt-2.5 text-[11px] text-orange-600 dark:text-orange-400">
          <Loader2
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          Executando o plano…
        </p>
      )}

      {hasPendingAfterFailure && !isRunning && (
        <div className="flex items-center justify-end pt-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleContinue}
            className="h-8 cursor-pointer gap-1.5 border-orange-500/30 text-[11px] text-orange-600 hover:bg-orange-500/10 dark:text-orange-300"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Continuar as etapas restantes
          </Button>
        </div>
      )}
    </motion.section>
  );
}

export default OperatorPlanCard;
