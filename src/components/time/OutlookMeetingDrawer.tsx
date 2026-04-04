"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, PanelLeftClose, RefreshCw, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { OutlookEventsList } from "@/components/time/OutlookEventsList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type OutlookEvent,
  useOutlookEvents,
} from "@/hooks/use-outlook-events";
import { useTimeEntries } from "@/hooks/use-time-entries";
import { signIn } from "@/lib/auth-client";
import { getTimePreferences, saveTimePreference } from "@/lib/time-preferences";

interface OutlookMeetingDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  selectedDate: string;
  onSelectEvent: (event: OutlookEvent) => void;
}

export function OutlookMeetingDrawer({
  open,
  onOpenChange,
  selectedDate,
  onSelectEvent,
}: OutlookMeetingDrawerProps) {
  const outlook = useOutlookEvents({
    startDate: selectedDate,
    endDate: selectedDate,
    enabled: open,
  });
  const { entries } = useTimeEntries({
    from: selectedDate,
    to: selectedDate,
  });

  const [defaultOpen, setDefaultOpen] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);

  useEffect(() => {
    setDefaultOpen(getTimePreferences().outlookDrawerDefaultOpen);
  }, []);

  const handleDefaultOpenChange = (checked: boolean) => {
    setDefaultOpen(checked);
    saveTimePreference("outlookDrawerDefaultOpen", checked);
  };

  async function handleReconnectMicrosoft() {
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

  const formattedDate = format(
    new Date(`${selectedDate}T12:00:00`),
    "EEEE, d 'de' MMMM",
    { locale: ptBR },
  );

  const eventCountBadge = (
    <Badge
      variant="outline"
      className="rounded-full border-border/60 bg-background/70 text-xs"
    >
      {outlook.loading ? "Sync" : `${outlook.events.length} eventos`}
    </Badge>
  );

  const drawerMeta = (
    <>
      <div className="mt-3 flex items-center gap-2">
        <div className="flex flex-1 items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 py-1.5">
          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
            Estado
          </span>
          <span className="text-xs font-semibold text-foreground">
            {outlook.status === "loading"
              ? "Sync..."
              : outlook.status === "connected"
                ? "Conectado"
                : outlook.status === "empty"
                  ? "Vazio"
                  : outlook.status === "needs_reconnect"
                    ? "Reconectar"
                    : outlook.status === "not_connected"
                      ? "Offline"
                      : "Erro"}
          </span>
        </div>

        <div className="flex flex-1 items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 py-1.5">
          <p
          id="outlook-drawer-default-open-label"
          className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider"
        >
          Auto-abrir
        </p>
        <Switch
          size="sm"
          checked={defaultOpen}
          onCheckedChange={handleDefaultOpenChange}
          aria-labelledby="outlook-drawer-default-open-label"
          className="scale-75 origin-right"
        />
        </div>
      </div>

      {outlook.status === "needs_reconnect" && (
        <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <div className="space-y-3">
              <p className="text-muted-foreground">
                A conexão Microsoft foi encontrada, mas o refresh token não está
                mais utilizável. Reconecte a integração.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleReconnectMicrosoft()}
                disabled={isReconnecting}
              >
                <RefreshCw
                  className={`mr-2 h-4 w-4 ${isReconnecting ? "animate-spin" : ""}`}
                />
                {isReconnecting ? "Redirecionando..." : "Reconectar Microsoft"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {outlook.status === "error" && (
        <div className="mt-3">
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void outlook.refetch()}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Tentar novamente
          </Button>
        </div>
      )}
    </>
  );

  const eventsList = (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6"
      onWheel={(e) => e.stopPropagation()}
    >
      <OutlookEventsList
        existingEntries={entries}
        onCreateFromOutlook={onSelectEvent}
        events={outlook.events}
        loading={outlook.loading}
        connected={outlook.connected}
        needsReconnect={outlook.needsReconnect}
        error={outlook.error}
        onRetry={() => void outlook.refetch()}
      />
    </div>
  );

  if (!open) return null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-muted/5 md:bg-background">
      <div className="border-b border-border/60 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
              <CalendarClock className="h-3 w-3" />
              Agenda do Outlook
            </div>
            <h3 className="mt-0.5 font-display text-sm font-bold capitalize text-foreground">
              {formattedDate}
            </h3>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {eventCountBadge}
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground"
              aria-label="Minimizar agenda"
            >
              <PanelLeftClose className="h-4 w-4" />
            </button>
          </div>
        </div>
        {drawerMeta}
      </div>
      {eventsList}
    </div>
  );
}
