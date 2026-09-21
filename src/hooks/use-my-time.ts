"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatLocalDate } from "@/lib/utils";
import type {
  CollaborationPeriod,
  DeliveryCounts,
  PeriodActionsResult,
} from "@/types/collaboration";

export {
  PERIOD_PRESETS,
  type PeriodPreset,
  type PeriodRange,
  resolvePeriodRange,
  shiftRange,
} from "@/lib/collaboration/period-presets";

import type { PeriodRange } from "@/lib/collaboration/period-presets";

export interface MyTimeController {
  period: CollaborationPeriod | null;
  actions: PeriodActionsResult | null;
  delivery: DeliveryCounts | null;
  /** First load of the period: there is nothing on screen yet. */
  isLoading: boolean;
  /** The Azure DevOps side is still running. */
  isLoadingActions: boolean;
  error: string | null;
  reload: () => Promise<void>;
}

async function readJson<T>(
  url: string,
  signal: AbortSignal,
  pick: (body: Record<string, unknown>) => T | undefined,
  fallbackError: string,
): Promise<T> {
  const res = await fetch(url, { signal });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const value = pick(body);

  if (!res.ok || value === undefined) {
    throw new Error(
      typeof body.error === "string" ? body.error : fallbackError,
    );
  }

  return value;
}

/**
 * Loads everything Meu Tempo shows for one window.
 *
 * The two requests run in parallel and settle independently: the calendar side
 * paints as soon as Microsoft answers, and the Azure DevOps timeline fills in
 * whenever it finishes. A failure on the slow side never blanks the page.
 */
export function useMyTime(range: PeriodRange): MyTimeController {
  const [period, setPeriod] = useState<CollaborationPeriod | null>(null);
  const [actions, setActions] = useState<PeriodActionsResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingActions, setIsLoadingActions] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { from, to } = range;

  const load = useCallback(
    async (signal?: AbortSignal) => {
      const controller = signal ?? new AbortController().signal;
      const query = new URLSearchParams({ from, to }).toString();

      setIsLoading(true);
      setIsLoadingActions(true);
      setError(null);

      const periodRequest = readJson<CollaborationPeriod>(
        `/api/collaboration/period?${query}`,
        controller,
        (body) => body.period as CollaborationPeriod | undefined,
        "Não foi possível ler o seu período.",
      )
        .then((value) => {
          setPeriod(value);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          console.error("[useMyTime] period:", err);
          setError(err instanceof Error ? err.message : "Erro desconhecido.");
          setPeriod(null);
        })
        .finally(() => {
          if (!controller.aborted) setIsLoading(false);
        });

      const actionsRequest = readJson<PeriodActionsResult>(
        `/api/collaboration/actions?${query}`,
        controller,
        (body) => body.result as PeriodActionsResult | undefined,
        "Não foi possível ler suas ações.",
      )
        .then((value) => {
          setActions(value);
        })
        .catch((err: unknown) => {
          if (err instanceof DOMException && err.name === "AbortError") return;
          // Deliberately silent on screen: the timeline still has the meetings
          // from the period response, and a broken PAT is not this page's
          // problem to shout about.
          console.error("[useMyTime] actions:", err);
          setActions(null);
        })
        .finally(() => {
          if (!controller.aborted) setIsLoadingActions(false);
        });

      await Promise.all([periodRequest, actionsRequest]);
    },
    [from, to],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  const delivery = useMemo<DeliveryCounts | null>(() => {
    if (!actions) return null;
    return {
      pullRequests: actions.actions.filter(
        (action) => action.kind === "pull_request",
      ).length,
      commits: actions.actions.filter((action) => action.kind === "commit")
        .length,
      workItems: actions.actions.filter((action) => action.kind === "work_item")
        .length,
    };
  }, [actions]);

  return {
    period,
    actions,
    delivery,
    isLoading,
    isLoadingActions,
    error,
    reload,
  };
}

/** Today in the browser's own calendar, used to anchor the presets. */
export function localToday(): string {
  return formatLocalDate(new Date());
}
