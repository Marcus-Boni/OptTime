"use client";

import { RefreshCw } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { OutlookEventCard } from "@/components/time/OutlookEventCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  type OutlookEvent,
  parseGraphDateTime,
} from "@/hooks/use-outlook-events";
import type { TimeEntry } from "@/hooks/use-time-entries";
import { signIn } from "@/lib/auth-client";

interface OutlookEventsListProps {
  existingEntries: TimeEntry[];
  onCreateFromOutlook: (event: OutlookEvent) => void;
  events: OutlookEvent[];
  loading: boolean;
  connected: boolean | null;
  needsReconnect: boolean;
  error: string | null;
  onRetry?: () => void;
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").trim().toLocaleLowerCase("pt-BR");
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function getEventKeys(event: OutlookEvent) {
  const subject = normalizeText(event.subject);
  const start = parseGraphDateTime(event.start.dateTime);
  const end = parseGraphDateTime(event.end.dateTime);

  return {
    fallback: `${subject}|${toDateKey(start)}`,
    precise: `${subject}|${toDateKey(start)}|${start.toISOString()}|${end.toISOString()}`,
  };
}

function getEntryKeys(entry: TimeEntry) {
  const subject = normalizeText(entry.description);

  if (entry.startTime && entry.endTime) {
    const start = new Date(entry.startTime);
    const end = new Date(entry.endTime);

    return {
      precise: `${subject}|${entry.date}|${start.toISOString()}|${end.toISOString()}`,
      fallback: null,
    };
  }

  return {
    precise: null,
    fallback: `${subject}|${entry.date}`,
  };
}

const outlookSkeletonKeys = [
  "outlook-skeleton-1",
  "outlook-skeleton-2",
  "outlook-skeleton-3",
];

export function OutlookEventsList({
  existingEntries,
  onCreateFromOutlook,
  events,
  loading,
  connected,
  needsReconnect,
  error,
  onRetry,
}: OutlookEventsListProps) {
  const [isReconnecting, setIsReconnecting] = useState(false);

  const importedEventKeys = useMemo(() => {
    const precise = new Set<string>();
    const fallback = new Set<string>();

    for (const entry of existingEntries) {
      const keys = getEntryKeys(entry);
      if (keys.precise) precise.add(keys.precise);
      if (keys.fallback) fallback.add(keys.fallback);
    }

    return { precise, fallback };
  }, [existingEntries]);

  const isImported = useCallback(
    (event: OutlookEvent) => {
      const keys = getEventKeys(event);
      return (
        importedEventKeys.precise.has(keys.precise) ||
        importedEventKeys.fallback.has(keys.fallback)
      );
    },
    [importedEventKeys],
  );

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const leftImported = isImported(left);
        const rightImported = isImported(right);

        if (leftImported !== rightImported) {
          return leftImported ? 1 : -1;
        }

        return (
          new Date(left.start.dateTime).getTime() -
          new Date(right.start.dateTime).getTime()
        );
      }),
    [events, isImported],
  );

  async function handleReconnect() {
    setIsReconnecting(true);

    try {
      const callbackURL =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/dashboard/time";

      const { error } = await signIn.social({
        provider: "microsoft",
        callbackURL,
      });

      if (error) {
        throw new Error(error.message || "Erro ao reconectar com Microsoft");
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Erro ao reconectar com Microsoft",
      );
      setIsReconnecting(false);
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {outlookSkeletonKeys.map((key) => (
          <Skeleton key={key} className="h-28 w-full rounded-[24px]" />
        ))}
      </div>
    );
  }

  if (connected === false) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
        Faca login com Microsoft para usar a agenda como acelerador de
        preenchimento.
      </div>
    );
  }

  if (needsReconnect) {
    return (
      <div className="space-y-3 rounded-[24px] border border-amber-500/30 bg-amber-500/10 p-5 text-sm text-muted-foreground">
        <p>
          A conta Microsoft foi encontrada, mas o token nao pode ser renovado.
          Reconecte a integração para continuar usando a agenda.
        </p>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleReconnect()}
            disabled={isReconnecting}
          >
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isReconnecting ? "animate-spin" : ""}`}
            />
            {isReconnecting ? "Redirecionando..." : "Reconectar Microsoft"}
          </Button>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-3 rounded-[24px] border border-border bg-card/80 p-5">
        <p className="text-sm text-foreground">
          Nao foi possivel carregar os eventos do Outlook.
        </p>
        <p className="text-sm text-muted-foreground">{error}</p>
        {onRetry ? (
          <div>
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw className="mr-2 h-4 w-4" />
              Tentar novamente
            </Button>
          </div>
        ) : null}
      </div>
    );
  }

  if (sortedEvents.length === 0) {
    return (
      <div className="rounded-[24px] border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
        Nenhuma reunião encontrada para esta data.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedEvents.map((event) => (
        <OutlookEventCard
          key={event.id}
          event={event}
          isImported={isImported(event)}
          onImport={onCreateFromOutlook}
        />
      ))}
    </div>
  );
}
