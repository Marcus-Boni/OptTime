"use client";

import { CalendarClock, Check, Loader2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MeetingTitle } from "@/components/collaboration/MeetingTitle";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatMeetingRange } from "@/hooks/use-collaboration-day";
import { useQuickLog } from "@/hooks/use-quick-log";
import { cn, formatDateLabel, formatDuration } from "@/lib/utils";
import type { MeetingSignal } from "@/types/collaboration";

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  billable?: boolean;
  members?: { userId: string }[];
}

export interface QuickLogDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Meetings the period found without a matching time entry. */
  meetings: MeetingSignal[];
  /** Refreshes the page once entries exist. */
  onLogged: () => void;
}

/** The meeting's local date, from the browser's own calendar. */
function meetingDate(meeting: MeetingSignal): string {
  const instant = new Date(meeting.startIso);
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, "0");
  const day = String(instant.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * "Apontar em 1 clique" — the batch that closes the gap between the calendar
 * and the timesheet.
 *
 * The one thing it cannot do for the person is choose a project: a time entry
 * without one does not exist, and guessing it would put hours on the wrong
 * client. Everything else is pre-filled — title, duration and date come from
 * the meeting exactly as the rest of the page reports them.
 */
export function QuickLogDialog({
  open,
  onOpenChange,
  meetings,
  onLogged,
}: QuickLogDialogProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const { isApplying, apply } = useQuickLog();

  useEffect(() => {
    if (!open) return;
    setSkipped(new Set());

    let active = true;

    async function loadProjects(): Promise<void> {
      try {
        const res = await fetch("/api/projects?status=active");
        if (!res.ok) return;

        const data = (await res.json()) as { projects?: ProjectOption[] };
        if (active) setProjects(data.projects ?? []);
      } catch (error: unknown) {
        console.error("[QuickLogDialog] loadProjects:", error);
      }
    }

    void loadProjects();
    return () => {
      active = false;
    };
  }, [open]);

  const selected = useMemo(
    () => meetings.filter((meeting) => !skipped.has(meeting.id)),
    [meetings, skipped],
  );

  const grouped = useMemo(() => {
    const byDate = new Map<string, MeetingSignal[]>();
    for (const meeting of meetings) {
      const date = meetingDate(meeting);
      const bucket = byDate.get(date);
      if (bucket) bucket.push(meeting);
      else byDate.set(date, [meeting]);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [meetings]);

  const totalMinutes = selected.reduce(
    (sum, meeting) => sum + meeting.minutes,
    0,
  );

  function toggle(id: string): void {
    setSkipped((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApply(): Promise<void> {
    if (!projectId || selected.length === 0) return;

    const project = projects.find((item) => item.id === projectId);

    const { created, failures } = await apply(
      selected.map((meeting) => ({
        date: meetingDate(meeting),
        description: meeting.title,
        minutes: meeting.minutes,
      })),
      { projectId, billable: project?.billable ?? true },
    );

    if (created > 0) {
      toast.success(
        `${created} reunião(ões) lançada(s) · ${formatDuration(totalMinutes)}`,
      );
      onLogged();
    }

    if (failures.length > 0) {
      // Named days, not a generic failure: "a semana está submetida" is
      // actionable, "não foi possível" is not.
      toast.error(
        `${failures.length} dia(s) não puderam ser lançados: ${failures
          .map(
            (failure) => `${formatDateLabel(failure.date)} (${failure.reason})`,
          )
          .join("; ")}`,
      );
    }

    if (failures.length === 0) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-display">
            <CalendarClock
              className="size-4 text-brand-500"
              aria-hidden="true"
            />
            Apontar reuniões do período
          </DialogTitle>
          <DialogDescription>
            Título, duração e data vêm da sua agenda. Só falta dizer em qual
            projeto elas entram.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <ProjectCombobox
            projects={projects}
            value={projectId}
            onChange={setProjectId}
            placeholder="Escolha o projeto"
            disabled={isApplying}
          />

          <ScrollArea className="-mr-4 h-[42vh] overflow-hidden pr-4">
            <div className="space-y-4">
              {grouped.map(([date, dayMeetings]) => (
                <div key={date}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {formatDateLabel(date)}
                  </p>

                  <ul className="space-y-1">
                    {dayMeetings.map((meeting) => {
                      const isSelected = !skipped.has(meeting.id);

                      return (
                        <li key={meeting.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 transition-colors",
                              isSelected
                                ? "border-brand-500/40 bg-brand-500/5"
                                : "border-border/50 bg-muted/10",
                            )}
                          >
                            <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                disabled={isApplying}
                                onChange={() => toggle(meeting.id)}
                                className="peer size-4 cursor-pointer appearance-none rounded border border-border bg-background transition-colors checked:border-brand-500 checked:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                              />
                              <Check
                                className="pointer-events-none absolute size-3 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                                aria-hidden="true"
                              />
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-foreground">
                                <MeetingTitle
                                  title={meeting.title}
                                  subject={meeting.subject}
                                />
                              </span>
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                {formatMeetingRange(meeting)}
                              </span>
                            </span>

                            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                              {formatDuration(meeting.minutes)}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>

        <DialogFooter className="sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {selected.length} selecionada(s) ·{" "}
            <span className="font-mono tabular-nums text-foreground">
              {formatDuration(totalMinutes)}
            </span>
          </p>

          <Button
            onClick={handleApply}
            disabled={isApplying || !projectId || selected.length === 0}
            className="gap-1.5"
          >
            {isApplying ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
            Lançar {selected.length}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
