"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  /** Refreshes the current day while keeping already-loaded evidence visible. */
  isRefreshing: boolean;
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

interface CollaborationDayState {
  key: string;
  day: CollaborationDay | null;
  pending: boolean;
  error: string | null;
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
  const key = `${date}:${includeLogged}`;
  const [state, setState] = useState<CollaborationDayState>({
    key,
    day: null,
    pending: true,
    error: null,
  });
  const [isLogging, setIsLogging] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const activeScopeRef = useRef<string | null>(null);
  const ownUpdateRef = useRef(false);

  const load = useCallback(async (): Promise<void> => {
    if (!enabled || activeScopeRef.current !== key) return;
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    const { signal } = controller;
    setState((current) => ({
      key,
      day: current.key === key ? current.day : null,
      pending: true,
      error: null,
    }));

    try {
      const params = new URLSearchParams({ date });
      if (includeLogged) params.set("includeLogged", "1");

      const res = await fetch(`/api/collaboration/day?${params}`, { signal });

      const body = (await res.json().catch(() => ({}))) as {
        day?: CollaborationDay;
        error?: string;
      };

      if (signal.aborted || requestRef.current !== controller) return;

      if (!res.ok || !body.day) {
        throw new Error(body.error ?? "Não foi possível ler o seu dia.");
      }

      setState({ key, day: body.day, pending: false, error: null });
    } catch (err: unknown) {
      if (signal.aborted || requestRef.current !== controller) return;
      console.error("[useCollaborationDay] load:", err);
      setState((current) => ({
        key,
        day: current.key === key ? current.day : null,
        pending: false,
        error: err instanceof Error ? err.message : "Erro desconhecido.",
      }));
    } finally {
      if (requestRef.current === controller) requestRef.current = null;
    }
  }, [date, enabled, includeLogged, key]);

  useEffect(() => {
    activeScopeRef.current = enabled ? key : null;
    if (!enabled) return;
    const handleUpdated = () => {
      if (!ownUpdateRef.current) void load();
    };

    void load();
    window.addEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
      activeScopeRef.current = null;
      requestRef.current?.abort();
      requestRef.current = null;
    };
  }, [enabled, key, load]);

  const reload = useCallback(async (): Promise<void> => {
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
        ownUpdateRef.current = true;
        try {
          dispatchTimeEntriesUpdated();
        } finally {
          ownUpdateRef.current = false;
        }
        await load();

        return body.created ?? items.length;
      } finally {
        setIsLogging(false);
      }
    },
    [date, load],
  );

  const current = state.key === key;
  const day = current ? state.day : null;
  const error = current ? state.error : null;
  const pending = enabled && (!current || state.pending);
  return {
    day,
    isLoading: pending && !day,
    isRefreshing: pending && Boolean(day),
    isLogging,
    error,
    reload,
    logMeetings,
  };
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
