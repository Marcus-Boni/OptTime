"use client";

import { useCallback, useEffect, useState } from "react";

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isAllDay: boolean;
  categories: string[];
  webLink: string;
}

interface UseOutlookEventsOptions {
  startDate: string;
  endDate: string;
  enabled?: boolean;
}

type OutlookEventsResponse = {
  connected?: boolean;
  error?: string;
  events?: OutlookEvent[];
  needsReconnect?: boolean;
  status?:
    | "connected"
    | "empty"
    | "error"
    | "needs_reconnect"
    | "not_connected";
  wasRefreshing?: boolean;
};

export function useOutlookEvents({
  startDate,
  endDate,
  enabled = true,
}: UseOutlookEventsOptions) {
  const [events, setEvents] = useState<OutlookEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [needsReconnect, setNeedsReconnect] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<
    | "idle"
    | "loading"
    | "connected"
    | "empty"
    | "not_connected"
    | "needs_reconnect"
    | "error"
  >("idle");

  const fetchEvents = useCallback(async () => {
    if (!enabled) {
      setEvents([]);
      setConnected(null);
      setNeedsReconnect(false);
      setError(null);
      setStatus("idle");
      return;
    }

    setLoading(true);
    setStatus("loading");
    setError(null);
    setNeedsReconnect(false);

    try {
      const start = `${startDate}T00:00:00`;
      const end = `${endDate}T23:59:59`;
      const response = await fetch(
        `/api/outlook/events?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: "no-store" },
      );

      const data = (await response.json()) as OutlookEventsResponse;

      if (!response.ok && response.status !== 500) {
        throw new Error(data.error ?? "Failed to fetch Outlook events");
      }

      const nextEvents = data.events ?? [];
      const nextConnected = data.connected ?? false;
      const nextNeedsReconnect = data.needsReconnect ?? false;

      setConnected(nextConnected);
      setEvents(nextEvents);
      setNeedsReconnect(nextNeedsReconnect);
      setError(
        response.ok ? null : (data.error ?? "Failed to fetch Outlook events"),
      );

      if (nextConnected === false) {
        setStatus("not_connected");
      } else if (nextNeedsReconnect) {
        setStatus("needs_reconnect");
      } else if (!response.ok || data.status === "error") {
        setStatus("error");
      } else if (nextEvents.length === 0) {
        setStatus("empty");
      } else {
        setStatus("connected");
      }
    } catch (err) {
      setConnected(true);
      setEvents([]);
      setNeedsReconnect(false);
      setError(
        err instanceof Error ? err.message : "Failed to fetch Outlook events",
      );
      setStatus("error");
    } finally {
      setLoading(false);
    }
  }, [enabled, endDate, startDate]);

  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  return {
    events,
    loading,
    connected,
    needsReconnect,
    error,
    status,
    refetch: fetchEvents,
  };
}

/**
 * Microsoft Graph returns UTC datetimes without the trailing "Z".
 * Without the "Z", JavaScript's Date constructor treats the string as
 * local time instead of UTC, causing a 3-hour offset in Brazil (UTC-3).
 */
function parseGraphDateTime(iso: string): Date {
  return new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
}

export function getEventDurationMinutes(event: OutlookEvent): number {
  const start = parseGraphDateTime(event.start.dateTime);
  const end = parseGraphDateTime(event.end.dateTime);
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

export function formatEventTimeRange(event: OutlookEvent): string {
  const start = parseGraphDateTime(event.start.dateTime);
  const end = parseGraphDateTime(event.end.dateTime);

  const formatter = (date: Date) =>
    date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return `${formatter(start)} - ${formatter(end)}`;
}
