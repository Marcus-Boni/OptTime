"use client";

/**
 * The written summary at the top of Meu Tempo.
 *
 * Follows the rule every AI surface in this app shares: **generate once, keep
 * it until the person asks again**. Switching the period away and back shows
 * what was already produced instead of spending another model call, and the
 * refresh button is always an explicit act.
 */

import { useCallback, useMemo } from "react";
import { useCachedAiResult } from "@/hooks/use-cached-ai-result";
import type { PeriodRange } from "@/hooks/use-my-time";
import { createAiResultCache } from "@/lib/ai/result-cache";
import type {
  DeliveryCounts,
  PeriodAssistantResult,
} from "@/types/collaboration";

/** A closed period does not change; the key moves when the window does. */
const ASSISTANT_TTL_MS = 12 * 60 * 60 * 1000;
/** Past this the summary still shows, with a discreet offer to refresh. */
const ASSISTANT_STALE_AFTER_MS = 3 * 60 * 60 * 1000;

const assistantCache = createAiResultCache<PeriodAssistantResult>({
  namespace: "period-assistant",
  version: 2,
  ttlMs: ASSISTANT_TTL_MS,
  maxEntries: 8,
  storage: "local",
});

export interface PeriodAssistantController {
  result: PeriodAssistantResult | null;
  generatedAt: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  staleReason: string | null;
  error: string | null;
  regenerate: () => void;
}

export interface UsePeriodAssistantOptions {
  range: PeriodRange;
  /** Azure DevOps counts, when they have arrived. */
  delivery: DeliveryCounts | null;
  /** Generate on first bind. Keep false until the period itself has loaded. */
  enabled: boolean;
}

async function fetchAssistant(
  range: PeriodRange,
  delivery: DeliveryCounts | null,
  signal: AbortSignal,
): Promise<PeriodAssistantResult> {
  const res = await fetch("/api/collaboration/assistant", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ from: range.from, to: range.to, delivery }),
    cache: "no-store",
    signal,
  });

  const payload = (await res.json().catch(() => ({}))) as {
    result?: PeriodAssistantResult;
    error?: string;
  };

  if (!res.ok || !payload.result) {
    throw new Error(payload.error ?? "Falha ao gerar o resumo do período.");
  }

  return payload.result;
}

export function usePeriodAssistant({
  range,
  delivery,
  enabled,
}: UsePeriodAssistantOptions): PeriodAssistantController {
  const key = `${range.from}_${range.to}`;

  // The Azure DevOps counts land after the first render. Including them in the
  // signature flags the summary as outdated instead of silently regenerating
  // it — the same contract the day plan uses.
  const signature = delivery
    ? `${delivery.pullRequests}-${delivery.commits}-${delivery.workItems}`
    : "no-delivery";

  const fetcher = useCallback(
    (signal: AbortSignal) => fetchAssistant(range, delivery, signal),
    [range, delivery],
  );

  const controller = useCachedAiResult<PeriodAssistantResult>({
    cache: assistantCache,
    key: enabled ? key : null,
    fetcher,
    enabled,
    signature,
    staleAfterMs: ASSISTANT_STALE_AFTER_MS,
    ageStaleReason: "Gerado há algumas horas — os dados podem ter mudado.",
  });

  const regenerate = useCallback(() => {
    void controller.regenerate();
  }, [controller]);

  return useMemo(
    () => ({
      result: controller.data,
      generatedAt: controller.generatedAt,
      isLoading: controller.isLoading,
      isRefreshing: controller.isRefreshing,
      isStale: controller.isStale,
      staleReason: controller.staleReason,
      error: controller.error,
      regenerate,
    }),
    [controller, regenerate],
  );
}
