"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarClock,
  Link2,
  RefreshCw,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import { OutlookEventsList } from "@/components/time/OutlookEventsList";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  type OutlookEvent,
  useOutlookEvents,
} from "@/hooks/use-outlook-events";
import { useTimeEntries } from "@/hooks/use-time-entries";
import { cn } from "@/lib/utils";

interface OutlookMeetingDrawerProps {
  open: boolean;
  selectedDate: string;
  onSelectEvent: (event: OutlookEvent) => void;
}

export function OutlookMeetingDrawer({
  open,
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

  if (!open) return null;

  const formattedDate = format(
    new Date(`${selectedDate}T12:00:00`),
    "EEEE, d 'de' MMMM",
    {
      locale: ptBR,
    },
  );

  const drawerBody = (
    <>
      <div className="border-b border-border/60 px-4 py-4 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              <CalendarClock className="h-3.5 w-3.5" />
              Agenda do Outlook
            </div>
            <h3 className="mt-2 font-display text-lg font-semibold capitalize text-foreground">
              {formattedDate}
            </h3>
           
          </div>

          <Badge
            variant="outline"
            className="rounded-full border-border/60 bg-background/70 text-xs"
          >
            {outlook.loading ? "Sync" : `${outlook.events.length} eventos`}
          </Badge>
        </div>

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

        {outlook.status === "needs_reconnect" ? (
          <div className="mt-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
            <div className="flex items-start gap-2 text-foreground">
              <TriangleAlert className="mt-0.5 h-4 w-4 text-amber-400" />
              <p className="text-muted-foreground">
                A conexão Microsoft foi encontrada, mas o refresh token não está
                mais utilizável. Reconecte a integração.
              </p>
            </div>
          </div>
        ) : null}

        {outlook.status === "error" ? (
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
        ) : null}
      </div>

      <div
        className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5"
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
    </>
  );

  return (
    <>
      <div
        data-outlook-drawer
        className="pointer-events-none fixed inset-0 z-60 hidden min-[1360px]:block"
      >
        <aside className="pointer-events-auto fixed top-[5vh] left-[calc(50%+190px)] flex h-[90vh] w-[320px] flex-col overflow-hidden rounded-[28px] border border-border/60 bg-background/96 shadow-2xl backdrop-blur min-[1500px]:left-[calc(50%+210px)] min-[1500px]:w-90 min-[1700px]:left-[calc(50%+230px)] min-[1700px]:w-95">
          {drawerBody}
        </aside>
      </div>

      <div
        data-outlook-drawer
        className="pointer-events-none fixed inset-x-3 bottom-3 z-60 min-[1360px]:hidden"
      >
        <aside
          className={cn(
            "pointer-events-auto flex h-[46vh] min-h-70 flex-col overflow-hidden rounded-[26px] border border-border/60 bg-background/96 shadow-2xl backdrop-blur",
          )}
        >
          {drawerBody}
        </aside>
      </div>
    </>
  );
}
