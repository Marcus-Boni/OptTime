"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dispatchTimeEntriesUpdated,
  TIME_ENTRIES_UPDATED_EVENT,
} from "@/lib/time-events";

export interface TimeEntryProject {
  id: string;
  name: string;
  code: string;
  color: string;
  azureProjectUrl?: string | null;
}

export interface TimeEntry {
  id: string;
  userId: string;
  projectId: string;
  timesheetId: string | null;
  description: string;
  date: string;
  duration: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  startTime: string | null;
  endTime: string | null;
  azdoSyncStatus: string;
  createdAt: string;
  updatedAt: string;
  project: TimeEntryProject;
  timesheet?: {
    status: string;
  } | null;
}

interface UseTimeEntriesOptions {
  from?: string;
  to?: string;
  projectId?: string;
}

export function useTimeEntries(options: UseTimeEntriesOptions = {}) {
  const [entries, setEntries] = useState<TimeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEntries = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (options.from) params.set("from", options.from);
      if (options.to) params.set("to", options.to);
      if (options.projectId) params.set("projectId", options.projectId);

      const res = await fetch(`/api/time-entries?${params.toString()}`);
      if (!res.ok) throw new Error("Falha ao carregar entradas");
      const data = await res.json();
      setEntries(data.entries ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [options.from, options.to, options.projectId]);

  useEffect(() => {
    fetchEntries();
  }, [fetchEntries]);

  const createEntry = useCallback(
    async (data: {
      projectId: string;
      description: string;
      date: string;
      duration: number;
      billable: boolean;
      azureWorkItemId?: number;
      azureWorkItemTitle?: string;
    }) => {
      const res = await fetch("/api/time-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao criar entrada");
      }
      const result = await res.json();
      await fetchEntries();
      dispatchTimeEntriesUpdated();
      return result.entry as TimeEntry;
    },
    [fetchEntries],
  );

  const updateEntry = useCallback(
    async (
      id: string,
      data: {
        projectId?: string;
        description?: string;
        date?: string;
        duration?: number;
        billable?: boolean;
        azureWorkItemId?: number | null;
        azureWorkItemTitle?: string | null;
      },
    ) => {
      const res = await fetch(`/api/time-entries/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao atualizar entrada");
      }
      await fetchEntries();
      dispatchTimeEntriesUpdated();
    },
    [fetchEntries],
  );

  const deleteEntry = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/time-entries/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao excluir entrada");
      }
      await fetchEntries();
      dispatchTimeEntriesUpdated();
    },
    [fetchEntries],
  );

  useEffect(() => {
    const handleUpdated = () => {
      void fetchEntries();
    };

    window.addEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
    };
  }, [fetchEntries]);

  return {
    entries,
    loading,
    error,
    refetch: fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
  };
}
