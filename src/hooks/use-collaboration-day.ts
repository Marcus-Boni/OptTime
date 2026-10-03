"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dispatchTimeEntriesUpdated,
  TIME_ENTRIES_UPDATED_EVENT,
} from "@/lib/time-events";
import type { CollaborationDay, MeetingSignal } from "@/types/collaboration";

export interface LogMeetingsItem {
  projectId: string;
  description: string;
  minutes: number;
  billable: boolean;
}

export interface CollaborationDayController {
  day: CollaborationDay | null;
  isLoading: boolean;
  isLogging: boolean;
  error: string | null;
  reload: () => Promise<void>;
  /** Creates one time entry per meeting; returns how many were created. */
  logMeetings: (items: LogMeetingsItem[]) => Promise<number>;
}

interface UseCollaborationDayOptions {
  /** YYYY-MM-DD in the app timezone. */
  date: string;
  enabled?: boolean;
  /**
   * Keep already-logged meetings in the list, flagged `alreadyLogged`.
   * The picker inside the entry form wants the whole day marked; the day
   * panel wants only what is left to do.
   */
  includeLogged?: boolean;
}

/**
 * Reads "o que você fez" for one day and turns picked meetings into entries.
 *
 * Writes go through the reconstructor's apply route, which already owns
 * timesheet locking, project access and the Azure DevOps sync — this hook
 * never touches the database contract on its own.
 */
export function useCollaborationDay({
  date,
  enabled = true,
  includeLogged = false,
}: UseCollaborationDayOptions): CollaborationDayController {
  const [day, setDay] = useState<CollaborationDay | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLogging, setIsLogging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!enabled) return;

      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({ date });
        if (includeLogged) params.set("includeLogged", "1");

        const res = await fetch(`/api/collaboration/day?${params}`, { signal });

        const body = (await res.json().catch(() => ({}))) as {
          day?: CollaborationDay;
          error?: string;
        };

        if (signal?.aborted) return;

        if (!res.ok || !body.day) {
          throw new Error(body.error ?? "Não foi possível ler o seu dia.");
        }

        setDay(body.day);
      } catch (err: unknown) {
        if (signal?.aborted) return;
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[useCollaborationDay] load:", err);
        setError(err instanceof Error ? err.message : "Erro desconhecido.");
        setDay(null);
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [date, enabled, includeLogged],
  );

  useEffect(() => {
    if (!enabled) return;

    let controller = new AbortController();
    const handleUpdated = () => {
      controller.abort();
      controller = new AbortController();
      void load(controller.signal);
    };

    void load(controller.signal);
    window.addEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
      controller.abort();
    };
  }, [enabled, load]);

  const reload = useCallback(async () => {
    await load();
  }, [load]);

  const logMeetings = useCallback(
    async (items: LogMeetingsItem[]): Promise<number> => {
      setIsLogging(true);

      try {
        const res = await fetch("/api/time-suggestions/reconstruct/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            date,
            items: items.map((item) => ({
              ...item,
              azureWorkItemId: null,
              azureWorkItemTitle: null,
              source: "calendar" as const,
            })),
          }),
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
        await load();

        return body.created ?? items.length;
      } finally {
        setIsLogging(false);
      }
    },
    [date, load],
  );

  return { day, isLoading, isLogging, error, reload, logMeetings };
}

/** Time range label for a meeting row, e.g. "14:00 – 14:45". */
export function formatMeetingRange(meeting: MeetingSignal): string {
  const format = (iso: string) =>
    new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return `${format(meeting.startIso)} – ${format(meeting.endIso)}`;
}
