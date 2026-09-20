"use client";

/**
 * Provenance line for a cached AI result: when it was produced, whether it
 * carries unsaved edits, and the single control that spends a new generation.
 *
 * Shared by every surface that keeps an AI artifact around, so the promise
 * reads the same everywhere — nothing regenerates behind the user's back.
 */

import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Loader2, PenLine, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** The label reads "há 2 minutos"; refreshing it more often adds nothing. */
const TICK_MS = 30_000;

export interface GeneratedStampProps {
  generatedAt: Date | null;
  isRefreshing: boolean;
  onRegenerate: () => void;
  /** Shown as a quiet badge, e.g. when the draft carries local edits. */
  editedNote?: string | null;
  regenerateLabel?: string;
  disabled?: boolean;
  className?: string;
}

/** Re-renders on an interval so a relative timestamp does not go stale. */
function useTicker(active: boolean): void {
  const [, setTick] = useState(0);

  useEffect(() => {
    if (!active) return;

    const id = window.setInterval(() => setTick((value) => value + 1), TICK_MS);
    return () => window.clearInterval(id);
  }, [active]);
}

export function GeneratedStamp({
  generatedAt,
  isRefreshing,
  onRegenerate,
  editedNote = null,
  regenerateLabel = "Gerar novamente",
  disabled = false,
  className,
}: GeneratedStampProps) {
  useTicker(generatedAt !== null);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5",
        className,
      )}
    >
      <p className="flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
        {generatedAt ? (
          <>
            <span className="truncate">
              Gerado{" "}
              <time dateTime={generatedAt.toISOString()}>
                {formatDistanceToNowStrict(generatedAt, {
                  locale: ptBR,
                  addSuffix: true,
                })}
              </time>
            </span>

            {editedNote ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-500/10 px-2 py-0.5 font-medium text-[10px] text-brand-500">
                <PenLine className="size-2.5" aria-hidden="true" />
                {editedNote}
              </span>
            ) : null}
          </>
        ) : null}
      </p>

      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={onRegenerate}
        disabled={disabled || isRefreshing}
        className="shrink-0 cursor-pointer gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
      >
        {isRefreshing ? (
          <Loader2
            className="size-3 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <RefreshCw className="size-3" aria-hidden="true" />
        )}
        {isRefreshing ? "Gerando…" : regenerateLabel}
      </Button>
    </div>
  );
}

export default GeneratedStamp;
