"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarClock,
  Link2,
  PanelLeftClose,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { OutlookEventsList } from "@/components/time/OutlookEventsList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  type OutlookEvent,
  useOutlookEvents,
} from "@/hooks/use-outlook-events";
import { useTimeEntries } from "@/hooks/use-time-entries";
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

  useEffect(() => {
    setDefaultOpen(getTimePreferences().outlookDrawerDefaultOpen);
  }, []);

  const handleDefaultOpenChange = (checked: boolean) => {
    setDefaultOpen(checked);
    saveTimePreference("outlookDrawerDefaultOpen", checked);
  };

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
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Estado
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            {outlook.status === "loading"
              ? "Atualizando"
              : outlook.status === "connected"
                ? "Conectado"
                : outlook.status === "empty"
                  ? "Sem reuniões"
                  : outlook.status === "needs_reconnect"
                    ? "Reconectar"
                    : outlook.status === "not_connected"
                      ? "Não conectado"
                      : "Falha transitória"}
          </p>
        </div>

        <div className="rounded-2xl border border-border/60 bg-background/70 p-3">
          <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            <Link2 className="h-3.5 w-3.5" />
            No dia
          </div>
          <p className="mt-2 text-sm font-medium text-foreground">
            {entries.length}{" "}
            {entries.length === 1 ? "lançamento" : "lançamentos"}
          </p>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between rounded-2xl border border-border/60 bg-background/70 px-4 py-3">
        <div className="pr-4">
          <p className="text-sm font-medium text-foreground">
            Abrir junto com lançamento
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Exibir esta agenda aberta por padrão no modal de registro.
          </p>
        </div>
        <Switch
          checked={defaultOpen}
          onCheckedChange={handleDefaultOpenChange}
        />
      </div>

      {outlook.status === "needs_reconnect" && (
        <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
            <p className="text-muted-foreground">
              A conexão Microsoft foi encontrada, mas o refresh token não está
              mais utilizável. Reconecte a integração.
            </p>
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
    <div className="flex h-full min-h-0 flex-col bg-muted/5 md:bg-background/95">
      <div className="border-b border-border/60 px-5 pb-5 pt-6 sm:px-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              Agenda do Outlook
            </div>
            <h3 className="mt-1.5 font-display text-base font-semibold capitalize text-foreground">
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
