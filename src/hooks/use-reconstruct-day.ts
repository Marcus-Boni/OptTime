"use client";

/**
 * State for the "Preencher meu dia" reconstruction.
 *
 * Owns the whole editable draft — the generated plan plus every tweak made to
 * it — and keeps it cached per date. Closing the modal is not a decision to
 * throw work away: reopening restores the plan exactly as it was left, and a
 * new generation only happens when the user asks for one.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useCachedAiResult } from "@/hooks/use-cached-ai-result";
import { createAiResultCache } from "@/lib/ai/result-cache";
import {
  dispatchTimeEntriesUpdated,
  TIME_ENTRIES_UPDATED_EVENT,
} from "@/lib/time-events";
import type { DayPlan, DayPlanItem } from "@/types/reconstruct";

/** A plan is a draft of *today's* work — it has no value tomorrow. */
const PLAN_TTL_MS = 8 * 60 * 60 * 1000;
/** Past this the plan still shows, with a gentle nudge to regenerate. */
const PLAN_STALE_AFTER_MS = 45 * 60 * 1000;

export interface DayPlanDraftItem extends DayPlanItem {
  /** Unchecked items stay visible but are not logged. */
  included: boolean;
}

export interface DayPlanDraft {
  plan: DayPlan;
  items: DayPlanDraftItem[];
  /** True once the user touched the generated proposal. */
  edited: boolean;
}

const planCache = createAiResultCache<DayPlanDraft>({
  namespace: "day-plan",
  // v5: Preserve the call evidence identity through review and application.
  version: 5,
  ttlMs: PLAN_TTL_MS,
  maxEntries: 10,
  storage: "session",
});

export interface ReconstructDayController {
  plan: DayPlan | null;
  items: DayPlanDraftItem[];
  selectedItems: DayPlanDraftItem[];
  selectedMinutes: number;
  generatedAt: Date | null;
  hasEdits: boolean;
  isBuilding: boolean;
  isRegenerating: boolean;
  isApplying: boolean;
  isStale: boolean;
  staleReason: string | null;
  error: string | null;
  regenerate: () => Promise<void>;
  updateItem: (id: string, patch: Partial<DayPlanDraftItem>) => void;
  apply: () => Promise<number>;
  discard: () => void;
}

export interface UseReconstructDayOptions {
  /** YYYY-MM-DD being reconstructed. */
  date: string;
  /** Generate on first bind. Keep false while the surface is closed. */
  enabled: boolean;
  /** Included in the cache key so 20h, 30h and 40h profiles keep separate drafts. */
  weeklyCapacityHours?: number | null;
}

export function getReconstructDayCacheKey(
  date: string,
  weeklyCapacityHours?: number | null,
): string {
  if (weeklyCapacityHours === undefined || weeklyCapacityHours === null) {
    return `plan:${date}`;
  }

  const capacity = Number.isFinite(weeklyCapacityHours)
    ? Math.max(0, weeklyCapacityHours)
    : 0;

  return `plan:${date}:capacity:${capacity}`;
}

async function fetchDayPlan(
  date: string,
  signal: AbortSignal,
): Promise<DayPlanDraft> {
  const res = await fetch("/api/time-suggestions/reconstruct", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
    signal,
  });

  const body = (await res.json().catch(() => ({}))) as {
    plan?: DayPlan;
    error?: string;
  };

  if (!res.ok || !body.plan) {
    throw new Error(body.error ?? "Não foi possível montar o plano do dia.");
  }

  return {
    plan: body.plan,
    items: body.plan.items.map((item) => ({ ...item, included: true })),
    edited: false,
  };
}

export function useReconstructDay({
  date,
  enabled,
  weeklyCapacityHours,
}: UseReconstructDayOptions): ReconstructDayController {
  const [isApplying, setIsApplying] = useState(false);
  /** Mirrors `isApplying` for listeners that must not re-subscribe. */
  const isApplyingRef = useRef(false);

  const fetcher = useCallback(
    (signal: AbortSignal) => fetchDayPlan(date, signal),
    [date],
  );

  const result = useCachedAiResult<DayPlanDraft>({
    cache: planCache,
    key: getReconstructDayCacheKey(date, weeklyCapacityHours),
    fetcher,
    enabled,
    staleAfterMs: PLAN_STALE_AFTER_MS,
    ageStaleReason:
      "Este plano foi montado há um tempo — gere de novo para pegar as atividades mais recentes.",
  });

  const { data, markStale, update, discard } = result;
  const regenerateResult = result.regenerate;

  // Entries changed elsewhere (another tab, the day grid, the timer): the plan
  // may now propose hours that are already logged. Flag it, never auto-rebuild
  // over an edited draft.
  useEffect(() => {
    if (!enabled) return;

    function handleEntriesUpdated() {
      if (isApplyingRef.current) return;
      markStale("Seus lançamentos mudaram desde que este plano foi gerado.");
    }

    window.addEventListener(TIME_ENTRIES_UPDATED_EVENT, handleEntriesUpdated);
    return () =>
      window.removeEventListener(
        TIME_ENTRIES_UPDATED_EVENT,
        handleEntriesUpdated,
      );
  }, [enabled, markStale]);

  const items = useMemo(() => data?.items ?? [], [data]);

  const selectedItems = useMemo(
    () => items.filter((item) => item.included),
    [items],
  );

  const selectedMinutes = useMemo(
    () => selectedItems.reduce((sum, item) => sum + item.minutes, 0),
    [selectedItems],
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<DayPlanDraftItem>) => {
      update((current) => ({
        ...current,
        edited: true,
        items: current.items.map((item) =>
          item.id === id ? { ...item, ...patch } : item,
        ),
      }));
    },
    [update],
  );

  const regenerate = useCallback(async () => {
    await regenerateResult();
  }, [regenerateResult]);

  const apply = useCallback(async (): Promise<number> => {
    const payload = selectedItems
      .filter((item) => item.description.trim().length >= 3)
      .map((item) => ({
        projectId: item.projectId,
        description: item.description.trim(),
        minutes: item.minutes,
        billable: item.billable,
        azureWorkItemId: item.azureWorkItemId,
        azureWorkItemTitle: item.azureWorkItemTitle,
        source: item.source,
        sourceId: item.sourceId,
      }));

    if (payload.length === 0) {
      throw new Error("Selecione ao menos um item com descrição válida.");
    }

    isApplyingRef.current = true;
    setIsApplying(true);

    try {
      const res = await fetch("/api/time-suggestions/reconstruct/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, items: payload }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        created?: number;
        error?: string;
      };

      if (!res.ok) {
        throw new Error(body.error ?? "Não foi possível lançar as horas.");
      }

      // The plan became reality — keeping it cached would offer the same hours
      // a second time on the next open.
      discard();

      // Every open view (day, week, autofill radar) refreshes on this event.
      dispatchTimeEntriesUpdated();

      return body.created ?? payload.length;
    } finally {
      isApplyingRef.current = false;
      setIsApplying(false);
    }
  }, [date, selectedItems, discard]);

  return {
    plan: data?.plan ?? null,
    items,
    selectedItems,
    selectedMinutes,
    generatedAt: result.generatedAt,
    hasEdits: data?.edited ?? false,
    isBuilding: result.isLoading,
    isRegenerating: result.isRefreshing,
    isApplying,
    isStale: result.isStale,
    staleReason: result.staleReason,
    error: result.error,
    regenerate,
    updateItem,
    apply,
    discard,
  };
}
