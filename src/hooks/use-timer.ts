"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  dispatchTimeEntriesUpdated,
  dispatchTimerUpdated,
  TIMER_UPDATED_EVENT,
} from "@/lib/time-events";
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

  const getClientTimeZone = useCallback(() => {
    if (typeof window === "undefined") {
      return "UTC";
    }

    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);

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

  // Compute elapsed ms from server timer state.
  // When paused, accumulatedMs already holds the total elapsed up to the pause moment —
  // we do NOT add (now - startedAt) because startedAt is the original start, not the pause time.
  // We clamp to 0 to guard against any clock skew between client and server.
  const getElapsedMs = useCallback((t: ActiveTimer): number => {
    if (t.pausedAt) return Math.max(0, t.accumulatedMs);
    const now = Date.now();
    const since = new Date(t.startedAt).getTime();
    return Math.max(0, t.accumulatedMs + (now - since));
  }, []);

  // Poll server every 5s to stay in sync; update display every 1s locally
  useEffect(() => {
    fetchTimer();
    const pollInterval = setInterval(fetchTimer, 5000);

    const handleTimerUpdated = () => {
      void fetchTimer();
    };

    window.addEventListener(TIMER_UPDATED_EVENT, handleTimerUpdated);

    return () => {
      clearInterval(pollInterval);
      window.removeEventListener(TIMER_UPDATED_EVENT, handleTimerUpdated);
    };
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
        headers: {
          "Content-Type": "application/json",
          "x-timezone": getClientTimeZone(),
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao iniciar timer");
      }
      const result = await res.json();
      setTimer(result.timer);
      dispatchTimerUpdated();
      return result.timer as ActiveTimer;
    },
    [getClientTimeZone],
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
    dispatchTimerUpdated();
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
    dispatchTimerUpdated();
  }, []);

  const stopTimer = useCallback(async () => {
    const res = await fetch("/api/timer", {
      method: "DELETE",
      headers: { "x-timezone": getClientTimeZone() },
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error ?? "Falha ao parar timer");
    }
    const result = await res.json();
    setTimer(null);
    dispatchTimeEntriesUpdated();
    dispatchTimerUpdated();
    return result.entry;
  }, [getClientTimeZone]);

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
      dispatchTimerUpdated();
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
