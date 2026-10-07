"use client";

import { CalendarClock, Check, Loader2, PhoneCall } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { MeetingTitle } from "@/components/collaboration/MeetingTitle";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { Badge } from "@/components/ui/badge";
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
import { Switch } from "@/components/ui/switch";
import { formatMeetingRange } from "@/hooks/use-collaboration-day";
import { useQuickLog } from "@/hooks/use-quick-log";
import { describeTeamCall } from "@/lib/collaboration/calls";
import { cn, formatDateLabel, formatDuration } from "@/lib/utils";
import type { MeetingSignal, TeamCallSignal } from "@/types/collaboration";

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
  /** Teams calls measured from call records, without a calendar invite. */
  calls?: TeamCallSignal[];
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

function callDate(call: TeamCallSignal): string {
  if (call.date) return call.date;

  const instant = new Date(call.startIso);
  const year = instant.getFullYear();
  const month = String(instant.getMonth() + 1).padStart(2, "0");
  const day = String(instant.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function callRange(call: TeamCallSignal): string {
  const format = (iso: string): string =>
    new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return `${format(call.startIso)} - ${format(call.endIso)}`;
}

type ReviewItem =
  | {
      kind: "meeting";
      id: string;
      date: string;
      minutes: number;
      meeting: MeetingSignal;
    }
  | {
      kind: "call";
      id: string;
      date: string;
      minutes: number;
      call: TeamCallSignal;
    };

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
  calls = [],
  onLogged,
}: QuickLogDialogProps) {
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectId, setProjectId] = useState("");
  const [billable, setBillable] = useState(true);
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const { isApplying, apply } = useQuickLog();

  function handleProjectChange(nextId: string): void {
    setProjectId(nextId);
    const matched = projects.find((item) => item.id === nextId);
    if (matched?.billable !== undefined) {
      setBillable(matched.billable);
    }
  }

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

  const reviewItems = useMemo<ReviewItem[]>(
    () => [
      ...meetings.map((meeting) => ({
        kind: "meeting" as const,
        id: `meeting:${meeting.id}`,
        date: meetingDate(meeting),
        minutes: meeting.minutes,
        meeting,
      })),
      ...calls.map((call) => ({
        kind: "call" as const,
        id: `call:${call.id}`,
        date: callDate(call),
        minutes: Math.max(1, call.minutes),
        call,
      })),
    ],
    [meetings, calls],
  );

  const selected = useMemo(
    () => reviewItems.filter((item) => !skipped.has(item.id)),
    [reviewItems, skipped],
  );

  const grouped = useMemo(() => {
    const byDate = new Map<string, ReviewItem[]>();
    for (const item of reviewItems) {
      const bucket = byDate.get(item.date);
      if (bucket) bucket.push(item);
      else byDate.set(item.date, [item]);
    }
    return [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [reviewItems]);

  const totalMinutes = selected.reduce((sum, item) => sum + item.minutes, 0);

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

    const { created, failures } = await apply(
      selected.map((item) => ({
        date: item.date,
        source: item.kind === "call" ? "teams_call" : "calendar",
        sourceId: item.kind === "call" ? item.call.id : undefined,
        description:
          item.kind === "meeting"
            ? item.meeting.title
            : describeTeamCall(item.call),
        minutes: item.minutes,
      })),
      { projectId, billable },
    );

    if (created > 0) {
      toast.success(
        `${created} item(ns) lançado(s) · ${formatDuration(totalMinutes)}`,
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
            Apontar atividades do período
          </DialogTitle>
          <DialogDescription>
            Reuniões vêm da agenda. Chamadas vêm da sua participação medida no
            Teams. Revise tudo antes de escolher o projeto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 flex-1">
              <ProjectCombobox
                projects={projects}
                value={projectId}
                onChange={handleProjectChange}
                placeholder="Escolha o projeto"
                disabled={isApplying}
              />
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 rounded-xl border border-border/40 bg-muted/20 px-3 py-1.5">
              <Switch
                id="quicklog-billable"
                size="sm"
                checked={billable}
                onCheckedChange={setBillable}
                disabled={isApplying}
                aria-label="Lançar como faturável"
              />
              <label
                htmlFor="quicklog-billable"
                className="cursor-pointer text-xs font-medium text-foreground select-none flex items-center gap-1.5"
              >
                <span>Faturável</span>
                {billable ? (
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    (Sim)
                  </span>
                ) : (
                  <span className="text-[10px] text-muted-foreground font-normal">
                    (Não)
                  </span>
                )}
              </label>
            </div>
          </div>

          <ScrollArea className="-mr-4 h-[42vh] overflow-hidden pr-4">
            <div className="space-y-4">
              {grouped.map(([date, dayItems]) => (
                <div key={date}>
                  <p className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {formatDateLabel(date)}
                  </p>

                  <ul className="space-y-1">
                    {dayItems.map((item) => {
                      const isSelected = !skipped.has(item.id);

                      return (
                        <li key={item.id}>
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
                                onChange={() => toggle(item.id)}
                                className="peer size-4 cursor-pointer appearance-none rounded border border-border bg-background transition-colors checked:border-brand-500 checked:bg-brand-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                              />
                              <Check
                                className="pointer-events-none absolute size-3 text-white opacity-0 transition-opacity peer-checked:opacity-100"
                                aria-hidden="true"
                              />
                            </span>

                            <span className="min-w-0 flex-1">
                              <span className="block text-sm text-foreground">
                                {item.kind === "meeting" ? (
                                  <MeetingTitle
                                    title={item.meeting.title}
                                    subject={item.meeting.subject}
                                  />
                                ) : (
                                  <span className="line-clamp-2">
                                    {describeTeamCall(item.call)}
                                  </span>
                                )}
                              </span>
                              <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                                {item.kind === "meeting" ? (
                                  formatMeetingRange(item.meeting)
                                ) : (
                                  <>
                                    <PhoneCall
                                      className="size-3"
                                      aria-hidden="true"
                                    />
                                    <span>{callRange(item.call)}</span>
                                    <span aria-hidden="true">·</span>
                                    <span>participação medida</span>
                                  </>
                                )}
                              </span>
                            </span>

                            <span className="shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                              {formatDuration(item.minutes)}
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
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">
              {selected.length} selecionada(s) ·{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatDuration(totalMinutes)}
              </span>
            </p>
            {selected.length > 0 && (
              <Badge
                variant="outline"
                className={
                  billable
                    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-medium"
                    : "border-muted-foreground/30 bg-muted/30 text-muted-foreground text-[10px] font-medium"
                }
              >
                {billable ? "Faturável" : "Não faturável"}
              </Badge>
            )}
          </div>

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
