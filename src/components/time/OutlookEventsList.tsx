"use client";

import { RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { OutlookEventCard } from "@/components/time/OutlookEventCard";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { OutlookEvent } from "@/hooks/use-outlook-events";
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

  const importedDescriptions = useMemo(
    () =>
      new Set(existingEntries.map((entry) => normalizeText(entry.description))),
    [existingEntries],
  );

  const sortedEvents = useMemo(
    () =>
      [...events].sort((left, right) => {
        const leftImported = importedDescriptions.has(
          normalizeText(left.subject),
        );
        const rightImported = importedDescriptions.has(
          normalizeText(right.subject),
        );

        if (leftImported !== rightImported) {
          return leftImported ? 1 : -1;
        }

        return (
          new Date(left.start.dateTime).getTime() -
          new Date(right.start.dateTime).getTime()
        );
      }),
    [events, importedDescriptions],
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
        Nenhuma reuniao encontrada para esta data.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {sortedEvents.map((event) => (
        <OutlookEventCard
          key={event.id}
          event={event}
          isImported={importedDescriptions.has(normalizeText(event.subject))}
          onImport={onCreateFromOutlook}
        />
      ))}
    </div>
  );
}
