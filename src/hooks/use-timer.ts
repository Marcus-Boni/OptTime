"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTimerDisplay } from "@/lib/utils";

export interface ActiveTimer {
  id: string;
  userId: string;
  projectId: string;
  description: string;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  billable: boolean;
  startedAt: string;
  pausedAt: string | null;
  accumulatedMs: number;
  createdAt: string;
  project: {
    id: string;
    name: string;
    code: string;
    color: string;
  };
}

export function useTimer() {
  const [timer, setTimer] = useState<ActiveTimer | null>(null);
  const [loading, setLoading] = useState(true);
  const [displayTime, setDisplayTime] = useState("00:00:00");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchTimer = useCallback(async () => {
    try {
      const res = await fetch("/api/timer");
      if (!res.ok) return;
      const data = await res.json();
      setTimer(data.timer);
    } catch {
      // ignore network errors silently
    } finally {
      setLoading(false);
    }
  }, []);

  // Compute elapsed ms from server timer state
  const getElapsedMs = useCallback((t: ActiveTimer): number => {
    if (t.pausedAt) return t.accumulatedMs;
    const now = Date.now();
    const since = new Date(t.startedAt).getTime();
    return t.accumulatedMs + (now - since);
  }, []);

  // Poll server every 5s to stay in sync; update display every 1s locally
  useEffect(() => {
    fetchTimer();
    const pollInterval = setInterval(fetchTimer, 5000);
    return () => clearInterval(pollInterval);
  }, [fetchTimer]);

  // Local tick for display
  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);

    if (!timer) {
      setDisplayTime("00:00:00");
      return;
    }

    const tick = () => {
      setDisplayTime(formatTimerDisplay(getElapsedMs(timer)));
    };
    tick();
    intervalRef.current = setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [timer, getElapsedMs]);

  const startTimer = useCallback(
    async (data: {
      projectId: string;
      description?: string;
      billable?: boolean;
      azureWorkItemId?: number;
      azureWorkItemTitle?: string;
    }) => {
      const res = await fetch("/api/timer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao iniciar timer");
      }
      const result = await res.json();
      setTimer(result.timer);
      return result.timer as ActiveTimer;
    },
    [],
  );

  const pauseTimer = useCallback(async () => {
    const res = await fetch("/api/timer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "pause" }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Falha ao pausar timer");
    }
    const result = await res.json();
    setTimer(result.timer);
  }, []);

  const resumeTimer = useCallback(async () => {
    const res = await fetch("/api/timer", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resume" }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Falha ao retomar timer");
    }
    const result = await res.json();
    setTimer(result.timer);
  }, []);

  const stopTimer = useCallback(async () => {
    const res = await fetch("/api/timer", { method: "DELETE" });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Falha ao parar timer");
    }
    const result = await res.json();
    setTimer(null);
    return result.entry;
  }, []);

  const updateTimer = useCallback(
    async (data: {
      description?: string;
      billable?: boolean;
      azureWorkItemId?: number;
      azureWorkItemTitle?: string;
    }) => {
      const res = await fetch("/api/timer", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update", ...data }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao atualizar timer");
      }
      const result = await res.json();
      setTimer(result.timer);
    },
    [],
  );

  const isRunning = !!timer && !timer.pausedAt;
  const isPaused = !!timer && !!timer.pausedAt;

  return {
    timer,
    loading,
    displayTime,
    isRunning,
    isPaused,
    hasTimer: !!timer,
    refetch: fetchTimer,
    startTimer,
    pauseTimer,
    resumeTimer,
    stopTimer,
    updateTimer,
  };
}
