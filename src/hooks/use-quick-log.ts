"use client";

/**
 * Turns a batch of detected meetings into time entries, across several days.
 *
 * Writes go through `POST /api/time-suggestions/reconstruct/apply`, which
 * already owns timesheet locking, project access, the transaction and the
 * Azure DevOps sync. That route is per-day and caps a batch at twelve items,
 * so this hook groups and chunks — and reports the days that were refused
 * instead of failing the whole operation, because a locked week in the middle
 * of a month must not block the days around it.
 */

import { useCallback, useState } from "react";
import { dispatchTimeEntriesUpdated } from "@/lib/time-events";

/** The apply route refuses a batch larger than this. */
const MAX_ITEMS_PER_CALL = 12;

export interface QuickLogItem {
  source?: "calendar" | "teams_call";
  sourceId?: string;
  /** YYYY-MM-DD, in the app timezone. */
  date: string;
  description: string;
  minutes: number;
}

export interface QuickLogFailure {
  date: string;
  reason: string;
}

export interface QuickLogResult {
  created: number;
  failures: QuickLogFailure[];
}

export interface QuickLogController {
  isApplying: boolean;
  apply: (
    items: QuickLogItem[],
    options: { projectId: string; billable: boolean },
  ) => Promise<QuickLogResult>;
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

export function useQuickLog(): QuickLogController {
  const [isApplying, setIsApplying] = useState(false);

  const apply = useCallback(
    async (
      items: QuickLogItem[],
      { projectId, billable }: { projectId: string; billable: boolean },
    ): Promise<QuickLogResult> => {
      setIsApplying(true);

      const byDate = new Map<string, QuickLogItem[]>();
      for (const item of items) {
        const bucket = byDate.get(item.date);
        if (bucket) bucket.push(item);
        else byDate.set(item.date, [item]);
      }

      let created = 0;
      const failures: QuickLogFailure[] = [];

      try {
        // Sequential on purpose: the apply route recomputes the day's total and
        // the timesheet lock on every call, and two concurrent writes for the
        // same week would race each other.
        for (const [date, dayItems] of [...byDate.entries()].sort()) {
          for (const batch of chunk(dayItems, MAX_ITEMS_PER_CALL)) {
            try {
              const res = await fetch(
                "/api/time-suggestions/reconstruct/apply",
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    date,
                    items: batch.map((item) => ({
                      projectId,
                      description: item.description,
                      minutes: item.minutes,
                      billable,
                      azureWorkItemId: null,
                      azureWorkItemTitle: null,
                      source: item.source ?? "calendar",
                      sourceId: item.sourceId,
                    })),
                  }),
                },
              );

              const body = (await res.json().catch(() => ({}))) as {
                created?: number;
                error?: string;
              };

              if (!res.ok) {
                failures.push({
                  date,
                  reason: body.error ?? "Não foi possível lançar este dia.",
                });
                // A refused day is refused for every batch of that day.
                break;
              }

              created += body.created ?? batch.length;
            } catch (error: unknown) {
              console.error("[useQuickLog] apply:", error);
              failures.push({ date, reason: "Falha de rede." });
              break;
            }
          }
        }

        // Every open view (day, week, autofill radar) refreshes on this event.
        if (created > 0) dispatchTimeEntriesUpdated();

        return { created, failures };
      } finally {
        setIsApplying(false);
      }
    },
    [],
  );

  return { isApplying, apply };
}
