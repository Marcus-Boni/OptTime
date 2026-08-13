"use client";

import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  AlertTriangle,
  Check,
  History,
  Loader2,
  Mic,
  RefreshCw,
  RotateCcw,
  SkipForward,
  Undo2,
  Zap,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { OPERATOR_ACTIONS } from "@/lib/ai/operator/policy";
import type { OperatorLogEntry } from "@/lib/ai/operator/types";
import type { ConfirmableActionKind } from "@/lib/ai/types";
import {
  dispatchTimeEntriesUpdated,
  dispatchTimesheetsUpdated,
} from "@/lib/time-events";
import { cn } from "@/lib/utils";

type HistoryItem = OperatorLogEntry & { reversible: boolean };

const STATUS_META: Record<
  OperatorLogEntry["status"],
  { icon: React.ReactNode; label: string; className: string }
> = {
  executed: {
    icon: <Check className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "Executada",
    className: "text-emerald-600 dark:text-emerald-400",
  },
  failed: {
    icon: <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "Falhou",
    className: "text-red-600 dark:text-red-400",
  },
  skipped: {
    icon: <SkipForward className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "Ignorada",
    className: "text-neutral-500",
  },
  undone: {
    icon: <Undo2 className="h-3.5 w-3.5" aria-hidden="true" />,
    label: "Desfeita",
    className: "text-neutral-500",
  },
};

function relativeTime(iso: string): string {
  try {
    return formatDistanceToNow(new Date(iso), {
      addSuffix: true,
      locale: ptBR,
    });
  } catch {
    return "";
  }
}

function actionLabel(kind: string): string {
  return OPERATOR_ACTIONS[kind as ConfirmableActionKind]?.label ?? kind;
}

// ─── Row ─────────────────────────────────────────────────────────────

function HistoryRow({
  entry,
  isUndoing,
  onUndo,
}: {
  entry: HistoryItem;
  isUndoing: boolean;
  onUndo: () => void;
}) {
  const status = STATUS_META[entry.status];

  return (
    <li className="flex gap-2.5 border-border/50 border-b py-2.5 last:border-b-0">
      <span className={cn("mt-0.5 shrink-0", status.className)}>
        {status.icon}
      </span>

      <div className="min-w-0 flex-1">
        <p className="font-medium text-[12px] text-foreground">
          {entry.summary}
        </p>

        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px] text-neutral-500">
          <span>{actionLabel(entry.kind)}</span>
          <span aria-hidden="true">·</span>
          <span>{relativeTime(entry.createdAt)}</span>

          {entry.authorization === "auto" && (
            <span className="inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400">
              <Zap className="h-2.5 w-2.5" aria-hidden="true" />
              automática
            </span>
          )}

          {entry.inputMode === "voice" && (
            <span className="inline-flex items-center gap-0.5">
              <Mic className="h-2.5 w-2.5" aria-hidden="true" />
              por voz
            </span>
          )}

          {entry.planId && <span>em plano</span>}
        </p>

        {entry.errorMessage && (
          <p className="mt-1 text-[10px] text-red-600 dark:text-red-400">
            {entry.errorMessage}
          </p>
        )}
      </div>

      {entry.reversible && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onUndo}
          disabled={isUndoing}
          aria-busy={isUndoing}
          className="h-6 shrink-0 cursor-pointer gap-1 px-1.5 text-[10px] text-neutral-500 hover:text-foreground"
        >
          {isUndoing ? (
            <Loader2
              className="h-3 w-3 animate-spin motion-reduce:animate-none"
              aria-hidden="true"
            />
          ) : (
            <RotateCcw className="h-3 w-3" aria-hidden="true" />
          )}
          Desfazer
        </Button>
      )}
    </li>
  );
}

// ─── Panel ───────────────────────────────────────────────────────────

export interface OperatorHistoryPanelProps {
  /** Reload whenever this changes, e.g. when the panel becomes visible. */
  isActive?: boolean;
}

export function OperatorHistoryPanel({
  isActive = true,
}: OperatorHistoryPanelProps) {
  const [entries, setEntries] = useState<HistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [undoingId, setUndoingId] = useState<string | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/operator/log?limit=30");
      if (!res.ok) return;

      const data = (await res.json()) as { entries: HistoryItem[] };
      if (mountedRef.current) setEntries(data.entries);
    } catch (error: unknown) {
      console.error("[OperatorHistoryPanel] load:", error);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isActive) load();
  }, [isActive, load]);

  async function handleUndo(entry: HistoryItem) {
    setUndoingId(entry.id);

    try {
      const res = await fetch(`/api/operator/log/${entry.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "undo" }),
      });

      const payload = (await res.json().catch(() => null)) as {
        error?: string;
        restored?: boolean;
      } | null;

      if (!res.ok) {
        throw new Error(payload?.error ?? "Não foi possível desfazer.");
      }

      toast.success(
        payload?.restored
          ? "Lançamento restaurado."
          : "Ação desfeita — lançamento removido.",
      );

      dispatchTimeEntriesUpdated();
      dispatchTimesheetsUpdated();
      await load();
    } catch (error: unknown) {
      console.error("[OperatorHistoryPanel] handleUndo:", error);
      toast.error(
        error instanceof Error ? error.message : "Não foi possível desfazer.",
      );
    } finally {
      setUndoingId(null);
    }
  }

  return (
    <section
      className="space-y-2"
      aria-label="Histórico de ações do assistente"
    >
      <header className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 font-semibold text-[11px] text-neutral-500 uppercase tracking-wide">
          <History className="h-3.5 w-3.5" aria-hidden="true" />
          Ações executadas
        </h3>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={load}
          aria-label="Atualizar o histórico"
          className="h-6 w-6 cursor-pointer p-0 text-neutral-500 hover:text-foreground"
        >
          <RefreshCw className="h-3 w-3" aria-hidden="true" />
        </Button>
      </header>

      {isLoading ? (
        <output className="block space-y-2" aria-label="Carregando o histórico">
          {["a", "b", "c"].map((key) => (
            <div
              key={key}
              className="h-10 animate-pulse rounded-lg bg-neutral-200/70 motion-reduce:animate-none dark:bg-neutral-800/60"
            />
          ))}
        </output>
      ) : entries.length === 0 ? (
        <p className="rounded-lg border border-border/60 border-dashed px-3 py-4 text-center text-[11px] text-neutral-500">
          Nenhuma ação executada pelo assistente ainda. Peça algo como “registre
          2 horas no projeto X” para começar.
        </p>
      ) : (
        <ul>
          {entries.map((entry) => (
            <HistoryRow
              key={entry.id}
              entry={entry}
              isUndoing={undoingId === entry.id}
              onUndo={() => handleUndo(entry)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

export default OperatorHistoryPanel;
