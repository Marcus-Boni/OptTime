"use client";

import { useCallback, useEffect, useState } from "react";
import {
  dispatchTimesheetsUpdated,
  TIMESHEETS_UPDATED_EVENT,
} from "@/lib/time-events";

interface UseTimesheetsOptions {
  enabled?: boolean;
}

export interface Timesheet {
  id: string;
  userId: string;
  period: string;
  periodType: string;
  totalMinutes: number;
  billableMinutes: number;
  status: "open" | "submitted" | "approved" | "rejected";
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  weeklyCapacity: number;
  periodStart: string;
  periodEnd: string;
  approver?: { id: string; name: string } | null;
  user?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    department: string | null;
  };
  entries?: unknown[];
}

export interface TimesheetEntryProject {
  id: string;
  name: string;
  code: string;
  color: string;
  azureProjectUrl?: string | null;
}

export interface TimesheetEntry {
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
  project: TimesheetEntryProject;
}

export interface TimesheetDetail extends Timesheet {
  entries: TimesheetEntry[];
}

export function useTimesheets(
  status?: string,
  options: UseTimesheetsOptions = {},
) {
  const enabled = options.enabled ?? true;
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimesheets = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      const queryString = params.toString();
      const url = queryString
        ? `/api/timesheets?${queryString}`
        : "/api/timesheets";
      const res = await fetch(url);
      if (!res.ok) throw new Error("Falha ao carregar timesheets");
      const data = await res.json();
      setTimesheets(data.timesheets ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [enabled, status]);

  useEffect(() => {
    if (!enabled) return;

    fetchTimesheets();
  }, [enabled, fetchTimesheets]);

  useEffect(() => {
    if (!enabled) return;

    const handleTimesheetsUpdated = () => {
      void fetchTimesheets();
    };

    window.addEventListener(TIMESHEETS_UPDATED_EVENT, handleTimesheetsUpdated);

    return () => {
      window.removeEventListener(
        TIMESHEETS_UPDATED_EVENT,
        handleTimesheetsUpdated,
      );
    };
  }, [enabled, fetchTimesheets]);

  const getOrCreateTimesheet = useCallback(
    async (period: string, periodType = "weekly") => {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period, periodType }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao criar timesheet");
      }
      const data = await res.json();
      await fetchTimesheets();
      dispatchTimesheetsUpdated();
      return data.timesheet as Timesheet;
    },
    [fetchTimesheets],
  );

  const submitTimesheet = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao submeter timesheet");
      }
      await fetchTimesheets();
      dispatchTimesheetsUpdated();
    },
    [fetchTimesheets],
  );

  const approveTimesheet = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao aprovar timesheet");
      }
      await fetchTimesheets();
      dispatchTimesheetsUpdated();
    },
    [fetchTimesheets],
  );

  const rejectTimesheet = useCallback(
    async (id: string, rejectionReason: string) => {
      const res = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao rejeitar timesheet");
      }
      await fetchTimesheets();
      dispatchTimesheetsUpdated();
    },
    [fetchTimesheets],
  );

  return {
    timesheets,
    loading,
    error,
    refetch: fetchTimesheets,
    getOrCreateTimesheet,
    submitTimesheet,
    approveTimesheet,
    rejectTimesheet,
  };
}

export function useTimesheetDetail(id: string) {
  const [timesheet, setTimesheet] = useState<TimesheetDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTimesheet = useCallback(async () => {
    if (!id) {
      setTimesheet(null);
      setError("Timesheet inválido");
      setLoading(false);
      return;
    }

    setLoading(true);

    try {
      const res = await fetch(`/api/timesheets/${id}`);
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Falha ao carregar timesheet");
      }

      setTimesheet((data.timesheet ?? null) as TimesheetDetail | null);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
      setTimesheet(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchTimesheet();
  }, [fetchTimesheet]);

  const submitTimesheet = useCallback(async () => {
    const res = await fetch(`/api/timesheets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "submit" }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Falha ao submeter timesheet");
    }

    await fetchTimesheet();
    dispatchTimesheetsUpdated();
  }, [fetchTimesheet, id]);

  return {
    timesheet,
    loading,
    error,
    refetch: fetchTimesheet,
    submitTimesheet,
  };
}

export function useTimesheetApprovals() {
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchApprovals = useCallback(async () => {
    try {
      const res = await fetch("/api/timesheets/approvals");
      if (!res.ok) throw new Error("Falha ao carregar aprovações");
      const data = await res.json();
      setTimesheets(data.timesheets ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const approveTimesheet = useCallback(
    async (id: string) => {
      const res = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao aprovar timesheet");
      }
      await fetchApprovals();
      dispatchTimesheetsUpdated();
    },
    [fetchApprovals],
  );

  const rejectTimesheet = useCallback(
    async (id: string, rejectionReason: string) => {
      const res = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao rejeitar timesheet");
      }
      await fetchApprovals();
      dispatchTimesheetsUpdated();
    },
    [fetchApprovals],
  );

  return {
    timesheets,
    loading,
    error,
    refetch: fetchApprovals,
    approveTimesheet,
    rejectTimesheet,
    pendingCount: timesheets.length,
  };
}

// ─── useTimesheetHistory ────────────────────────────────────────────────────────

interface UseTimesheetHistoryOptions {
  enabled?: boolean;
}

export function useTimesheetHistory(
  options: UseTimesheetHistoryOptions = {},
) {
  const enabled = options.enabled ?? false;
  const [timesheets, setTimesheets] = useState<Timesheet[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/timesheets/history");
      if (!res.ok) throw new Error("Falha ao carregar histórico");
      const data = await res.json();
      setTimesheets(data.timesheets ?? []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    fetchHistory();
  }, [enabled, fetchHistory]);

  useEffect(() => {
    if (!enabled) return;
    const handleUpdate = () => { void fetchHistory(); };
    window.addEventListener(TIMESHEETS_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(TIMESHEETS_UPDATED_EVENT, handleUpdate);
    };
  }, [enabled, fetchHistory]);

  return { timesheets, loading, error, refetch: fetchHistory };
}
