"use client";

/**
 * AI Operator — cards for the actions that drive the interface.
 *
 * Unlike the write cards these never ask for a form: the whole interaction is
 * "take me there". What changes with the autonomy mode is only *who* pulls the
 * trigger — the user, or the assistant the moment the answer lands.
 */

import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  Compass,
  CornerUpLeft,
  Loader2,
  SlidersHorizontal,
  Sparkles,
  Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useAutoRunAction } from "@/hooks/use-auto-run-action";
import { actionKey, markExecuted } from "@/lib/ai/operator/executed-store";
import { logOperatorAction } from "@/lib/ai/operator/executors";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import {
  describeUiCommand,
  executeUiCommand,
  revealApp,
} from "@/lib/ai/operator/ui-bridge";
import { UI_COMMANDS } from "@/lib/ai/operator/ui-commands";
import type { NavigateAction, UiCommandAction } from "@/lib/ai/types";
import { cn } from "@/lib/utils";

/** Icons that hint at what the button is about to do. */
const COMMAND_ICON_CLASS = "h-3.5 w-3.5 shrink-0";

interface UiActionShellProps {
  detail: string | null;
  /** Rendered on the right: the trigger, or the settled confirmation. */
  children: React.ReactNode;
  icon: React.ReactNode;
  title: string;
  autoBadge: boolean;
}

/**
 * Deliberately lighter than the write-action shell: nothing is at stake here,
 * so the card reads as an affordance rather than as a decision.
 */
function UiActionShell({
  detail,
  children,
  icon,
  title,
  autoBadge,
}: UiActionShellProps) {
  return (
    <section className="mt-3 rounded-xl border border-border/60 bg-neutral-50/70 p-3 dark:border-white/10 dark:bg-neutral-900/50">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-500/15 text-orange-600 dark:text-orange-400">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-[12px] text-foreground">
              {title}
            </p>
            {detail && (
              <p className="truncate text-[11px] text-muted-foreground">
                {detail}
              </p>
            )}
          </div>
        </div>

        {children}
      </div>

      {autoBadge && (
        <p className="mt-2 flex items-center gap-1.5 text-[10px] text-orange-600 dark:text-orange-400">
          <Zap className="h-3 w-3 shrink-0" aria-hidden="true" />
          Autorizado por você nas configurações do Operador IA
        </p>
      )}
    </section>
  );
}

function SettledState({
  label,
  onUndo,
  undoLabel,
}: {
  label: string;
  onUndo?: () => void;
  undoLabel?: string;
}) {
  return (
    <motion.div
      key="done"
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="flex shrink-0 items-center gap-2"
    >
      <span className="flex items-center gap-1 font-semibold text-[11px] text-emerald-600 dark:text-emerald-400">
        <Check className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </span>

      {onUndo && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUndo}
          className="h-7 cursor-pointer gap-1 px-2 text-[11px] text-muted-foreground hover:text-foreground"
        >
          <CornerUpLeft className="h-3 w-3" aria-hidden="true" />
          {undoLabel ?? "Voltar"}
        </Button>
      )}
    </motion.div>
  );
}

// ─── Navigate ────────────────────────────────────────────────────────

export interface NavigateCardProps {
  action: NavigateAction;
  inputMode?: OperatorInputMode;
}

export function NavigateCard({
  action,
  inputMode = "text",
}: NavigateCardProps) {
  const router = useRouter();
  const [isDone, setIsDone] = useState(false);
  /** Distinguishes a delegated run from a clicked one in the audit trail. */
  const wasAutoRef = useRef(false);

  const go = useCallback(() => {
    // The panel only steps aside when it would otherwise hide the destination.
    revealApp({ closePanel: false });
    router.push(action.path);
    setIsDone(true);

    logOperatorAction({
      planId: null,
      stepIndex: 0,
      kind: "navigate",
      summary: action.label,
      status: "executed",
      authorization: wasAutoRef.current ? "auto" : "confirmed",
      inputMode,
      resultId: null,
      errorMessage: null,
    });
  }, [action.label, action.path, inputMode, router]);

  const { isAutoRunning, willAutoRun, alreadyRan } = useAutoRunAction(
    action,
    () => {
      wasAutoRef.current = true;
      go();
      toast.success(action.label.replace(/^Abrir /, "Abri "), {
        description: "Levei você direto — dá para voltar a qualquer momento.",
        action: { label: "Voltar", onClick: () => router.back() },
      });
    },
  );

  function handleClick() {
    markExecuted(actionKey(action));
    go();
  }

  const settled = isDone || alreadyRan;

  return (
    <UiActionShell
      icon={<Compass className={COMMAND_ICON_CLASS} aria-hidden="true" />}
      title={action.label}
      detail={action.detail}
      autoBadge={willAutoRun && !settled}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isAutoRunning ? (
          <motion.span
            key="running"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400"
          >
            <Loader2
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Abrindo…
          </motion.span>
        ) : settled ? (
          <SettledState label="Aberto" onUndo={() => router.back()} />
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="shrink-0"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClick}
              className="h-8 cursor-pointer gap-1.5 border-orange-500/40 text-[11px] text-orange-600 hover:bg-orange-500/10 dark:text-orange-300"
            >
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </UiActionShell>
  );
}

// ─── UI command ──────────────────────────────────────────────────────

export interface UiCommandCardProps {
  action: UiCommandAction;
  inputMode?: OperatorInputMode;
}

export function UiCommandCard({
  action,
  inputMode = "text",
}: UiCommandCardProps) {
  const [isDone, setIsDone] = useState(false);
  const wasAutoRef = useRef(false);
  /** Reversal handed back by the executor, when the command has one. */
  const undoRef = useRef<(() => void) | null>(null);
  const [canUndo, setCanUndo] = useState(false);

  const meta = UI_COMMANDS[action.command];
  const doneLabel = describeUiCommand(action);

  const run = useCallback(() => {
    const outcome = executeUiCommand(action);

    undoRef.current = outcome.undo;
    setCanUndo(outcome.undo !== null);
    setIsDone(true);

    logOperatorAction({
      planId: null,
      stepIndex: 0,
      kind: "ui_command",
      summary: action.label,
      status: "executed",
      authorization: wasAutoRef.current ? "auto" : "confirmed",
      inputMode,
      resultId: null,
      errorMessage: null,
    });
  }, [action, inputMode]);

  const handleUndo = useCallback(() => {
    undoRef.current?.();
    undoRef.current = null;
    setCanUndo(false);
  }, []);

  const { isAutoRunning, willAutoRun, alreadyRan } = useAutoRunAction(
    action,
    () => {
      wasAutoRef.current = true;
      run();

      toast.success(doneLabel, {
        action: undoRef.current
          ? { label: "Desfazer", onClick: handleUndo }
          : undefined,
      });
    },
  );

  function handleClick() {
    markExecuted(actionKey(action));
    run();
  }

  const settled = isDone || alreadyRan;

  return (
    <UiActionShell
      icon={
        meta?.opensOverlay ? (
          <Sparkles className={COMMAND_ICON_CLASS} aria-hidden="true" />
        ) : (
          <SlidersHorizontal
            className={COMMAND_ICON_CLASS}
            aria-hidden="true"
          />
        )
      }
      title={action.label}
      detail={action.detail}
      autoBadge={willAutoRun && !settled}
    >
      <AnimatePresence mode="wait" initial={false}>
        {isAutoRunning ? (
          <motion.span
            key="running"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex shrink-0 items-center gap-1.5 text-[11px] text-orange-600 dark:text-orange-400"
          >
            <Loader2
              className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
            Executando…
          </motion.span>
        ) : settled ? (
          <SettledState
            label={doneLabel}
            onUndo={canUndo ? handleUndo : undefined}
            undoLabel="Desfazer"
          />
        ) : (
          <motion.div
            key="idle"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="shrink-0"
          >
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleClick}
              className={cn(
                "h-8 cursor-pointer gap-1.5 border-orange-500/40 text-[11px] text-orange-600",
                "hover:bg-orange-500/10 dark:text-orange-300",
              )}
            >
              {action.label}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </motion.div>
        )}
      </AnimatePresence>
    </UiActionShell>
  );
}
