"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarClock, PanelLeftClose, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { MeetingCard } from "@/components/collaboration/MeetingCard";
import { MeetingExclusionsNote } from "@/components/collaboration/MeetingExclusionsNote";
import { ReauthNotice } from "@/components/collaboration/ReauthNotice";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useCollaborationDay } from "@/hooks/use-collaboration-day";
import { useUserTimePreferences } from "@/hooks/use-user-time-preferences";
import { parseLocalDate } from "@/lib/utils";
import type { MeetingSignal } from "@/types/collaboration";

const SKELETON_KEYS = ["picker-1", "picker-2", "picker-3"];

export interface MeetingPickerDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** YYYY-MM-DD being filled. */
  selectedDate: string;
  onSelectMeeting: (meeting: MeetingSignal) => void;
}

/**
 * The day's meetings, alongside the entry form, for picking one.
 *
 * Reads the same `CollaborationDay` as the day panel, so a meeting the person
 * declined or that lost a double-booking never shows up here either — before
 * this, the drawer had its own endpoint, its own hook and no rules at all, and
 * the two surfaces disagreed about what the day contained.
 *
 * The difference is the job, not the data: the panel is a multi-select for
 * closing the day, this is a single pick that fills the fields beside it. It
 * asks for already-logged meetings so they stay visible as "Já registrado".
 */
export function MeetingPickerDrawer({
  open,
  onOpenChange,
  selectedDate,
  onSelectMeeting,
}: MeetingPickerDrawerProps) {
  const { preferences, updatePreferences } = useUserTimePreferences();
  const { day, isLoading, isRefreshing, error, reload } = useCollaborationDay({
    date: selectedDate,
    enabled: open,
    includeLogged: true,
  });

  const [defaultOpen, setDefaultOpen] = useState(
    preferences.outlookDrawerDefaultOpen,
  );

  useEffect(() => {
    setDefaultOpen(preferences.outlookDrawerDefaultOpen);
  }, [preferences.outlookDrawerDefaultOpen]);

  function handleDefaultOpenChange(checked: boolean) {
    const previous = defaultOpen;
    setDefaultOpen(checked);

    void (async () => {
      const success = await updatePreferences(
        { timeOutlookDefaultOpen: checked },
        {
          errorMessage:
            "Não foi possível salvar a abertura automática da agenda.",
        },
      );

      if (!success) setDefaultOpen(previous);
    })();
  }

  if (!open) return null;

  const isPending = isLoading;

  const meetings = day?.meetings ?? [];
  const pending = meetings.filter((meeting) => !meeting.alreadyLogged);
  // What still needs doing floats to the top; the rest stays in chronological
  // order so the day still reads as a timeline.
  const ordered = [...meetings].sort((a, b) => {
    if (a.alreadyLogged !== b.alreadyLogged) return a.alreadyLogged ? 1 : -1;
    return new Date(a.startIso).getTime() - new Date(b.startIso).getTime();
  });
  const formattedDate = format(
    parseLocalDate(selectedDate),
    "EEEE, d 'de' MMMM",
    { locale: ptBR },
  );

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex h-full min-h-0 flex-col bg-muted/5 md:bg-background">
        <div className="border-b border-border/60 px-4 py-4 sm:px-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground/80">
                <CalendarClock className="size-3" aria-hidden="true" />
                Reuniões do dia
              </div>
              <h3 className="mt-0.5 font-display text-sm font-bold capitalize text-foreground">
                {formattedDate}
              </h3>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <Badge
                variant="outline"
                className="rounded-full border-border/60 bg-background/70 text-xs"
              >
                {isPending
                  ? "Lendo…"
                  : isRefreshing
                    ? "Atualizando…"
                    : `${pending.length} ${pending.length === 1 ? "pendente" : "pendentes"}`}
              </Badge>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                aria-label="Minimizar agenda"
              >
                <PanelLeftClose className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between rounded-xl border border-border/60 bg-background/50 px-3 py-1.5">
            <p
              id="meeting-picker-default-open"
              className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground"
            >
              Abrir automaticamente
            </p>
            <Switch
              size="sm"
              checked={defaultOpen}
              onCheckedChange={handleDefaultOpenChange}
              aria-labelledby="meeting-picker-default-open"
              className="origin-right scale-75"
            />
          </div>
        </div>

        <div
          aria-busy={isPending || isRefreshing}
          className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5 sm:px-6"
          onWheel={(event) => event.stopPropagation()}
        >
          {isPending && (
            <output
              aria-label="Carregando reuniões do dia"
              className="block space-y-3"
            >
              {SKELETON_KEYS.map((key) => (
                <Skeleton key={key} className="h-28 w-full rounded-xl" />
              ))}
            </output>
          )}

          {error && (
            <div className="space-y-3 rounded-xl border border-border bg-card/80 p-4">
              <p className="text-sm text-muted-foreground">{error}</p>
              <Button
                variant="outline"
                size="sm"
                className="rounded-full"
                onClick={() => void reload()}
                disabled={isPending || isRefreshing}
              >
                <RefreshCw className="mr-2 size-3.5" aria-hidden="true" />
                Tentar novamente
              </Button>
            </div>
          )}

          {day?.needsReauth && <ReauthNotice feature="o resumo do seu dia" />}

          {day?.warnings.map((warning) => (
            <p key={warning} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}

          {day && !error && meetings.length === 0 && (
            <div className="rounded-xl border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
              {day.exclusions.length > 0
                ? "Nenhuma reunião elegível nesta data — veja abaixo o que foi descartado."
                : "Nenhuma reunião encontrada para esta data."}
            </div>
          )}

          {!isPending &&
            ordered.map((meeting) => (
              <MeetingCard
                key={meeting.id}
                meeting={meeting}
                onPick={onSelectMeeting}
                disabled={isRefreshing}
              />
            ))}

          {day && <MeetingExclusionsNote exclusions={day.exclusions} />}
        </div>
      </div>
    </TooltipProvider>
  );
}
