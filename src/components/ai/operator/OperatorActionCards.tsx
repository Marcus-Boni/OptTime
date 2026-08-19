"use client";

/**
 * Single-action confirmation cards for the operator's extended action set.
 *
 * All of them run through the shared `executeAction` dispatcher and record the
 * result in the audit trail, so a lone card and a plan step behave identically.
 */

import {
  AlertTriangle,
  ArrowRight,
  Check,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Mail,
  Pause,
  Pencil,
  Play,
  Send,
  ShieldCheck,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Users,
  X,
  Zap,
} from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAutoRunAction } from "@/hooks/use-auto-run-action";
import { actionKey, markExecuted } from "@/lib/ai/operator/executed-store";
import {
  ExecutionError,
  executeAction,
  logOperatorAction,
} from "@/lib/ai/operator/executors";
import { describeStep } from "@/lib/ai/operator/plan";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import type {
  ApproveTimesheetAction,
  ConfirmableAction,
  DeleteTimeEntryAction,
  ExportReportAction,
  NotifyTeamAction,
  PauseTimerAction,
  RejectTimesheetAction,
  ResumeTimerAction,
  UpdateTimeEntryAction,
} from "@/lib/ai/types";
import { cn, formatDuration } from "@/lib/utils";

// ─── Shared shell ────────────────────────────────────────────────────

type Tone = "brand" | "danger" | "info";

const TONE_STYLES: Record<
  Tone,
  { shell: string; header: string; badge: string; button: string }
> = {
  brand: {
    shell: "border-orange-500/30 bg-orange-500/10 dark:bg-orange-950/20",
    header: "border-orange-500/20 text-orange-600 dark:text-orange-400",
    badge: "bg-orange-500/20 text-orange-700 dark:text-orange-300",
    button: "bg-orange-500 hover:bg-orange-600",
  },
  danger: {
    shell: "border-red-500/30 bg-red-500/10 dark:bg-red-950/20",
    header: "border-red-500/20 text-red-600 dark:text-red-400",
    badge: "bg-red-500/20 text-red-700 dark:text-red-300",
    button: "bg-red-600 hover:bg-red-700",
  },
  info: {
    shell: "border-blue-500/30 bg-blue-500/10 dark:bg-blue-950/20",
    header: "border-blue-500/20 text-blue-600 dark:text-blue-400",
    badge: "bg-blue-500/20 text-blue-700 dark:text-blue-300",
    button: "bg-blue-600 hover:bg-blue-700",
  },
};

interface ActionShellProps {
  title: string;
  icon: React.ReactNode;
  tone?: Tone;
  badge?: string;
  warning?: string | null;
  children: React.ReactNode;
}

function ActionShell({
  title,
  icon,
  tone = "brand",
  badge,
  warning,
  children,
}: ActionShellProps) {
  const styles = TONE_STYLES[tone];

  return (
    <section
      className={cn("mt-3 rounded-xl border p-3 shadow-sm", styles.shell)}
    >
      <header
        className={cn(
          "flex items-center justify-between gap-2 border-b pb-2",
          styles.header,
        )}
      >
        <h4 className="flex items-center gap-1.5 font-semibold text-[11px] uppercase tracking-wide">
          {icon}
          {title}
        </h4>
        {badge && (
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 font-mono font-bold text-[11px]",
              styles.badge,
            )}
          >
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

/**
 * Confirm/cancel footer shared by every card. Owns the request lifecycle so no
 * individual card re-implements loading, error handling or audit logging.
 */
function useActionExecution(
  action: ConfirmableAction,
  inputMode: OperatorInputMode,
) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [doneMessage, setDoneMessage] = useState<string | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  /** Distinguishes a delegated run from a clicked one in the audit trail. */
  const wasAutoRef = useRef(false);
  const busyRef = useRef(false);

  async function run(override?: ConfirmableAction) {
    // The ref closes the gap between two calls landing in the same tick, which
    // state alone cannot.
    if (busyRef.current || isDone) return;

    busyRef.current = true;
    const target = override ?? action;
    const authorization = wasAutoRef.current ? "auto" : "confirmed";
    setIsSubmitting(true);

    try {
      const outcome = await executeAction(target);

      markExecuted(actionKey(action));
      setIsDone(true);
      setDoneMessage(outcome.message);
      toast.success(outcome.message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: target.kind,
        summary: describeStep(target).title,
        status: "executed",
        authorization,
        inputMode,
        resultId: outcome.resultId,
        errorMessage: null,
      });
    } catch (error: unknown) {
      const message =
        error instanceof ExecutionError || error instanceof Error
          ? error.message
          : "Não foi possível concluir a ação.";

      console.error(`[OperatorActionCard:${target.kind}]`, error);
      toast.error(message);

      await logOperatorAction({
        planId: null,
        stepIndex: 0,
        kind: target.kind,
        summary: describeStep(target).title,
        status: "failed",
        authorization,
        inputMode,
        resultId: null,
        errorMessage: message,
      });
    } finally {
      busyRef.current = false;
      setIsSubmitting(false);
    }
  }

  const { willAutoRun } = useAutoRunAction(action, () => {
    wasAutoRef.current = true;
    return run();
  });

  return {
    isSubmitting,
    isDone,
    doneMessage,
    isDismissed,
    willAutoRun,
    dismiss: () => setIsDismissed(true),
    run,
  };
}

interface ConfirmFooterProps {
  label: string;
  icon: React.ReactNode;
  tone?: Tone;
  disabled?: boolean;
  isSubmitting: boolean;
  /** The user delegated this action, so it runs without the buttons. */
  willAutoRun?: boolean;
  onConfirm: () => void;
  onDismiss: () => void;
}

function ConfirmFooter({
  label,
  icon,
  tone = "brand",
  disabled,
  isSubmitting,
  willAutoRun,
  onConfirm,
  onDismiss,
}: ConfirmFooterProps) {
  // Delegated actions never show a confirm button — the click already happened
  // once, in the settings.
  if (willAutoRun) {
    return (
      <p className="flex items-center justify-end gap-1.5 pt-2 text-[11px] text-orange-600 dark:text-orange-400">
        <Zap className="h-3 w-3" aria-hidden="true" />
        {isSubmitting ? "Executando automaticamente…" : "Autorizada por você"}
      </p>
    );
  }

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={onDismiss}
        className="h-8 cursor-pointer text-[11px]"
      >
        <X className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
        Cancelar
      </Button>
      <Button
        type="button"
        size="sm"
        onClick={onConfirm}
        disabled={disabled || isSubmitting}
        aria-busy={isSubmitting}
        className={cn(
          "h-8 cursor-pointer gap-1.5 text-[11px] text-white",
          TONE_STYLES[tone].button,
        )}
      >
        {isSubmitting ? (
          <Loader2
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          icon
        )}
        {label}
      </Button>
    </div>
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

function DismissedState() {
  return (
    <p className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-500">
      <X className="h-3.5 w-3.5" aria-hidden="true" />
      Ação cancelada — nada foi alterado.
    </p>
  );
}

// ─── Update time entry ───────────────────────────────────────────────

export function UpdateTimeEntryCard({
  action,
  inputMode,
}: {
  action: UpdateTimeEntryAction;
  inputMode: OperatorInputMode;
}) {
  const exec = useActionExecution(action, inputMode);
  if (exec.isDismissed) return <DismissedState />;

  const durationChanged =
    action.current.durationMinutes !== action.next.durationMinutes;
  const descriptionChanged =
    action.current.description !== action.next.description;
  const billableChanged = action.current.billable !== action.next.billable;

  return (
    <ActionShell
      title="Confirmar edição"
      icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
      badge={formatDuration(action.next.durationMinutes)}
      warning={action.warning}
    >
      <div className="mt-2.5 space-y-1.5">
        <p className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: action.projectColor ?? "#f97316" }}
            aria-hidden="true"
          />
          <span className="truncate">{action.projectName ?? "Projeto"}</span>
          <span className="font-mono text-[10px] text-neutral-500">
            {action.date}
          </span>
        </p>

        <dl className="space-y-1 pl-4 text-[11px]">
          {durationChanged && (
            <div className="flex items-center gap-1.5">
              <dt className="text-neutral-500">Duração:</dt>
              <dd className="flex items-center gap-1.5 font-mono">
                <span className="text-neutral-500 line-through">
                  {formatDuration(action.current.durationMinutes)}
                </span>
                <ArrowRight
                  className="h-3 w-3 text-orange-500"
                  aria-hidden="true"
                />
                <span className="font-semibold text-foreground">
                  {formatDuration(action.next.durationMinutes)}
                </span>
              </dd>
            </div>
          )}

          {descriptionChanged && (
            <div>
              <dt className="text-neutral-500">Descrição:</dt>
              <dd className="mt-0.5">
                <span className="block text-neutral-500 line-through">
                  “{action.current.description}”
                </span>
                <span className="block font-medium text-foreground">
                  “{action.next.description}”
                </span>
              </dd>
            </div>
          )}

          {billableChanged && (
            <div className="flex items-center gap-1.5">
              <dt className="text-neutral-500">Faturável:</dt>
              <dd className="font-medium text-foreground">
                {action.current.billable ? "Sim" : "Não"} →{" "}
                {action.next.billable ? "Sim" : "Não"}
              </dd>
            </div>
          )}
        </dl>

        {exec.isDone ? (
          <DoneState label={exec.doneMessage ?? "Lançamento atualizado!"} />
        ) : (
          <ConfirmFooter
            label="Confirmar edição"
            icon={<Check className="h-3.5 w-3.5" aria-hidden="true" />}
            isSubmitting={exec.isSubmitting}
            willAutoRun={exec.willAutoRun}
            onConfirm={() => exec.run()}
            onDismiss={exec.dismiss}
          />
        )}
      </div>
    </ActionShell>
  );
}

// ─── Delete time entry ───────────────────────────────────────────────

export function DeleteTimeEntryCard({
  action,
  inputMode,
}: {
  action: DeleteTimeEntryAction;
  inputMode: OperatorInputMode;
}) {
  const exec = useActionExecution(action, inputMode);
  if (exec.isDismissed) return <DismissedState />;

  return (
    <ActionShell
      title="Confirmar exclusão"
      icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
      tone="danger"
      badge={formatDuration(action.durationMinutes)}
      warning={action.warning}
    >
      <div className="mt-2.5 space-y-1.5">
        <p className="flex items-center gap-1.5 font-semibold text-[12px] text-foreground">
          <span
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: action.projectColor ?? "#ef4444" }}
            aria-hidden="true"
          />
          <span className="truncate">{action.projectName ?? "Projeto"}</span>
        </p>

        <p className="pl-4 text-[11px] text-neutral-600 italic dark:text-neutral-300">
          “{action.description}”
        </p>
        <p className="pl-4 font-mono text-[10px] text-neutral-500">
          {action.date}
        </p>

        {exec.isDone ? (
          <DoneState label={exec.doneMessage ?? "Lançamento excluído."} />
        ) : (
          <ConfirmFooter
            label="Excluir"
            icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            tone="danger"
            isSubmitting={exec.isSubmitting}
            willAutoRun={exec.willAutoRun}
            onConfirm={() => exec.run()}
            onDismiss={exec.dismiss}
          />
        )}
      </div>
    </ActionShell>
  );
}

// ─── Pause / resume timer ────────────────────────────────────────────

export function TimerToggleCard({
  action,
  inputMode,
}: {
  action: PauseTimerAction | ResumeTimerAction;
  inputMode: OperatorInputMode;
}) {
  const exec = useActionExecution(action, inputMode);
  if (exec.isDismissed) return <DismissedState />;

  const pausing = action.kind === "pause_timer";

  return (
    <ActionShell
      title={pausing ? "Pausar cronômetro" : "Retomar cronômetro"}
      icon={
        pausing ? (
          <Pause className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Play className="h-3.5 w-3.5" aria-hidden="true" />
        )
      }
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

        {exec.isDone ? (
          <DoneState
            label={
              exec.doneMessage ??
              (pausing ? "Cronômetro pausado." : "Cronômetro retomado.")
            }
          />
        ) : (
          <ConfirmFooter
            label={pausing ? "Pausar agora" : "Retomar agora"}
            icon={
              pausing ? (
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
              )
            }
            isSubmitting={exec.isSubmitting}
            willAutoRun={exec.willAutoRun}
            onConfirm={() => exec.run()}
            onDismiss={exec.dismiss}
          />
        )}
      </div>
    </ActionShell>
  );
}

// ─── Approve / reject timesheet ──────────────────────────────────────

export function TimesheetReviewCard({
  action,
  inputMode,
}: {
  action: ApproveTimesheetAction | RejectTimesheetAction;
  inputMode: OperatorInputMode;
}) {
  const exec = useActionExecution(action, inputMode);
  if (exec.isDismissed) return <DismissedState />;

  const approving = action.kind === "approve_timesheet";

  return (
    <ActionShell
      title={approving ? "Aprovar timesheet" : "Rejeitar timesheet"}
      icon={
        approving ? (
          <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
        )
      }
      tone={approving ? "brand" : "danger"}
      badge={formatDuration(action.totalMinutes)}
      warning={action.warning}
    >
      <div className="mt-2.5 space-y-1.5">
        <p className="font-semibold text-[12px] text-foreground">
          {action.userName}
        </p>
        <p className="font-mono text-[11px] text-neutral-500">
          {action.period}
        </p>

        {!approving && (
          <p className="mt-1 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-700 dark:text-red-300">
            <span className="font-semibold">Motivo: </span>
            {action.reason}
          </p>
        )}

        <p className="flex items-center gap-1 pt-1 text-[10px] text-neutral-500">
          <ShieldCheck className="h-3 w-3" aria-hidden="true" />O colaborador
          será notificado desta decisão.
        </p>

        {exec.isDone ? (
          <DoneState
            label={
              exec.doneMessage ??
              (approving ? "Timesheet aprovado!" : "Timesheet rejeitado.")
            }
          />
        ) : (
          <ConfirmFooter
            label={approving ? "Aprovar" : "Rejeitar"}
            icon={
              approving ? (
                <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
              )
            }
            tone={approving ? "brand" : "danger"}
            isSubmitting={exec.isSubmitting}
            willAutoRun={exec.willAutoRun}
            onConfirm={() => exec.run()}
            onDismiss={exec.dismiss}
          />
        )}
      </div>
    </ActionShell>
  );
}

// ─── Export report ───────────────────────────────────────────────────

export function ExportReportCard({
  action,
  inputMode,
}: {
  action: ExportReportAction;
  inputMode: OperatorInputMode;
}) {
  const [format, setFormat] = useState(action.format);
  const exec = useActionExecution(action, inputMode);
  if (exec.isDismissed) return <DismissedState />;

  const isEmpty = action.entryCount === 0;

  return (
    <ActionShell
      title="Gerar relatório"
      icon={<FileText className="h-3.5 w-3.5" aria-hidden="true" />}
      badge={format.toUpperCase()}
      warning={action.warning}
    >
      <div className="mt-2.5 space-y-2">
        <div>
          <p className="font-semibold text-[12px] text-foreground">
            {action.title}
          </p>
          <p className="text-[11px] text-neutral-500">
            {action.periodLabel} · {action.entryCount} lançamento(s) ·{" "}
            {formatDuration(action.totalMinutes)}
          </p>
          <p className="mt-0.5 text-[10px] text-neutral-500">
            {action.reportKind === "detailed"
              ? "Lançamento por lançamento"
              : "Resumo agrupado por projeto"}
          </p>
        </div>

        {!exec.isDone && (
          <fieldset className="flex items-center gap-1.5">
            <legend className="sr-only">Formato do arquivo</legend>
            {(["pdf", "xlsx"] as const).map((option) => (
              <Button
                key={option}
                type="button"
                variant="outline"
                size="sm"
                aria-pressed={format === option}
                onClick={() => setFormat(option)}
                className={cn(
                  "h-7 cursor-pointer gap-1 text-[10px]",
                  format === option
                    ? "border-orange-500/50 bg-orange-500/10 text-orange-600 dark:text-orange-300"
                    : "text-neutral-500",
                )}
              >
                {option === "pdf" ? (
                  <FileText className="h-3 w-3" aria-hidden="true" />
                ) : (
                  <FileSpreadsheet className="h-3 w-3" aria-hidden="true" />
                )}
                {option === "pdf" ? "PDF" : "Excel"}
              </Button>
            ))}
          </fieldset>
        )}

        {exec.isDone ? (
          <DoneState label={exec.doneMessage ?? "Arquivo gerado!"} />
        ) : (
          <ConfirmFooter
            label="Gerar e baixar"
            icon={<Download className="h-3.5 w-3.5" aria-hidden="true" />}
            disabled={isEmpty}
            isSubmitting={exec.isSubmitting}
            willAutoRun={exec.willAutoRun}
            onConfirm={() => exec.run({ ...action, format })}
            onDismiss={exec.dismiss}
          />
        )}
      </div>
    </ActionShell>
  );
}

// ─── Notify team ─────────────────────────────────────────────────────

const VISIBLE_RECIPIENTS = 6;

export function NotifyTeamCard({
  action,
  inputMode,
}: {
  action: NotifyTeamAction;
  inputMode: OperatorInputMode;
}) {
  const [showAll, setShowAll] = useState(false);
  const exec = useActionExecution(action, inputMode);
  if (exec.isDismissed) return <DismissedState />;

  const visible = showAll
    ? action.recipients
    : action.recipients.slice(0, VISIBLE_RECIPIENTS);
  const hidden = action.recipients.length - visible.length;

  return (
    <ActionShell
      title="Enviar notificação"
      icon={<Mail className="h-3.5 w-3.5" aria-hidden="true" />}
      tone="info"
      badge={`${action.recipients.length} pessoa(s)`}
      warning={action.warning}
    >
      <div className="mt-2.5 space-y-2">
        <div>
          <p className="font-semibold text-[12px] text-foreground">
            {action.subject}
          </p>
          {action.projectName && (
            <p className="text-[11px] text-neutral-500">{action.projectName}</p>
          )}
        </div>

        <p className="whitespace-pre-wrap rounded-lg bg-background/60 px-2.5 py-2 text-[11px] text-neutral-700 leading-relaxed dark:text-neutral-300">
          {action.message}
        </p>

        {action.contextLines.length > 0 && (
          <ul className="space-y-0.5 border-blue-500/40 border-l-2 pl-2.5">
            {action.contextLines.map((line) => (
              <li
                key={line}
                className="text-[10px] text-neutral-600 dark:text-neutral-400"
              >
                {line}
              </li>
            ))}
          </ul>
        )}

        <div>
          <p className="flex items-center gap-1 font-medium text-[10px] text-neutral-500 uppercase tracking-wide">
            <Users className="h-3 w-3" aria-hidden="true" />
            Destinatários
          </p>
          <p className="mt-1 text-[11px] text-neutral-600 dark:text-neutral-300">
            {visible.map((person) => person.name).join(", ")}
            {hidden > 0 && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="cursor-pointer text-blue-600 underline underline-offset-2 dark:text-blue-400"
                >
                  +{hidden} outros
                </button>
              </>
            )}
          </p>
        </div>

        {exec.isDone ? (
          <DoneState label={exec.doneMessage ?? "Notificação enviada!"} />
        ) : (
          <>
            <p className="flex items-center gap-1 text-[10px] text-neutral-500">
              <ShieldCheck className="h-3 w-3" aria-hidden="true" />
              E-mails reais serão enviados. Esta ação nunca acontece sozinha.
            </p>
            <ConfirmFooter
              label="Enviar e-mails"
              icon={<Send className="h-3.5 w-3.5" aria-hidden="true" />}
              tone="info"
              isSubmitting={exec.isSubmitting}
              willAutoRun={exec.willAutoRun}
              onConfirm={() => exec.run()}
              onDismiss={exec.dismiss}
            />
          </>
        )}
      </div>
    </ActionShell>
  );
}
