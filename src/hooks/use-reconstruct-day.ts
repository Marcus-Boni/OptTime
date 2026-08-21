"use client";

import { useCallback, useState } from "react";
import { dispatchTimeEntriesUpdated } from "@/lib/time-events";
import type { DayPlan, DayPlanItem } from "@/types/reconstruct";

export interface ApplyDayPlanItemPayload {
  projectId: string;
  description: string;
  minutes: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  source: DayPlanItem["source"];
}

export interface ReconstructDayController {
  plan: DayPlan | null;
  isBuilding: boolean;
  isApplying: boolean;
  error: string | null;
  build: (date: string) => Promise<DayPlan | null>;
  apply: (date: string, items: ApplyDayPlanItemPayload[]) => Promise<number>;
  reset: () => void;
}

export function useReconstructDay(): ReconstructDayController {
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [isBuilding, setIsBuilding] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const build = useCallback(async (date: string): Promise<DayPlan | null> => {
    setIsBuilding(true);
    setError(null);
    setPlan(null);

    try {
      const res = await fetch("/api/time-suggestions/reconstruct", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date }),
      });

      const body = (await res.json().catch(() => ({}))) as {
        plan?: DayPlan;
        error?: string;
      };

      if (!res.ok || !body.plan) {
        throw new Error(
          body.error ?? "Não foi possível montar o plano do dia.",
        );
      }

      setPlan(body.plan);
      return body.plan;
    } catch (err: unknown) {
      console.error("[useReconstructDay] build:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
      return null;
    } finally {
      setIsBuilding(false);
    }
  }, []);

  const apply = useCallback(
    async (date: string, items: ApplyDayPlanItemPayload[]): Promise<number> => {
      setIsApplying(true);
      try {
        const res = await fetch("/api/time-suggestions/reconstruct/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ date, items }),
        });

        const body = (await res.json().catch(() => ({}))) as {
          created?: number;
          error?: string;
        };

        if (!res.ok) {
          throw new Error(body.error ?? "Não foi possível lançar as horas.");
        }

        // Every open view (day, week, autofill radar) refreshes on this event.
        dispatchTimeEntriesUpdated();

        return body.created ?? items.length;
      } finally {
        setIsApplying(false);
      }
    },
    [],
  );

  const reset = useCallback(() => {
    setPlan(null);
    setError(null);
  }, []);

  return { plan, isBuilding, isApplying, error, build, apply, reset };
}
