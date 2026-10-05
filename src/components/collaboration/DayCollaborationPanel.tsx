"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ArrowUpRight,
  CalendarClock,
  Check,
  Loader2,
  PhoneCall,
  Plane,
  RefreshCw,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ActivityPortraitBar } from "@/components/collaboration/ActivityPortraitBar";
import { MeetingBadges } from "@/components/collaboration/MeetingBadges";
import { MeetingExclusionsNote } from "@/components/collaboration/MeetingExclusionsNote";
import { MeetingTitle } from "@/components/collaboration/MeetingTitle";
import { ReauthNotice } from "@/components/collaboration/ReauthNotice";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  formatMeetingRange,
  useCollaborationDay,
} from "@/hooks/use-collaboration-day";
import { useQuickLog } from "@/hooks/use-quick-log";
import { describeTeamCall } from "@/lib/collaboration/calls";
import { cn, formatDuration } from "@/lib/utils";
import type { MeetingSignal, TeamCallSignal } from "@/types/collaboration";

/** Beyond this the list collapses behind a "ver todas" toggle. */
const VISIBLE_MEETINGS = 5;
/** The apply route caps a batch at 12 items. */
const MAX_BATCH = 12;

interface ProjectOption {
  id: string;
  name: string;
  color: string;
  billable?: boolean;
  members?: { userId: string }[];
}

export interface DayCollaborationPanelProps {
  /** YYYY-MM-DD being inspected. */
  date: string;
  /** The day belongs to a submitted or approved timesheet. */
  locked: boolean;
  lockMessage?: string;
  /** Opens the manual form pre-filled from one meeting. */
  onAdjust?: (meeting: MeetingSignal) => void;
}

// ─── Meeting row ──────────────────────────────────────────────────────

interface MeetingRowProps {
  meeting: MeetingSignal;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
  onAdjust?: (meeting: MeetingSignal) => void;
}

function MeetingRow({
  meeting,
  selected,
  disabled,
  onToggle,
  onAdjust,
}: MeetingRowProps) {
  return (
    <li className="group">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
          selected
            ? "border-brand-500/40 bg-brand-500/5"
            : "border-border/50 bg-muted/10 hover:border-border",
          disabled && "opacity-60",
        )}
      >
        <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(meeting.id)}
            aria-label={`${selected ? "Remover" : "Incluir"} ${meeting.title}`}
            className={cn(
              "peer size-4 cursor-pointer appearance-none rounded border border-border bg-background transition-colors",
              "checked:border-brand-500 checked:bg-brand-500 hover:border-brand-500/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40",
              "disabled:cursor-not-allowed",
            )}
          />
          <Check
            className="pointer-events-none absolute size-3 text-white opacity-0 transition-opacity peer-checked:opacity-100"
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="min-w-0 text-sm font-medium text-foreground">
              <MeetingTitle title={meeting.title} subject={meeting.subject} />
            </p>
            <MeetingBadges meeting={meeting} />
          </div>

          <p className="mt-0.5 text-xs text-muted-foreground">
            {meeting.evidence}
          </p>

          {meeting.participants.length > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground/80">
              <Users className="size-3 shrink-0" aria-hidden="true" />
              <span className="truncate">
                {meeting.participants
                  .slice(0, 4)
                  .map((person) => person.name)
                  .join(", ")}
                {meeting.participantCount > 4 &&
                  ` e mais ${meeting.participantCount - 4}`}
              </span>
            </p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-xs tabular-nums text-foreground">
            {formatDuration(meeting.minutes)}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatMeetingRange(meeting)}
          </span>
          {onAdjust && !disabled && (
            <button
              type="button"
              onClick={() => onAdjust(meeting)}
              className="rounded text-[10px] text-muted-foreground underline-offset-2 opacity-0 transition-opacity hover:text-brand-500 hover:underline focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 group-hover:opacity-100"
            >
              ajustar
            </button>
          )}
        </div>
      </div>
    </li>
  );
}

function formatCallRange(call: TeamCallSignal): string {
  const format = (iso: string): string =>
    new Date(iso).toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    });

  return `${format(call.startIso)} - ${format(call.endIso)}`;
}

interface CallRowProps {
  call: TeamCallSignal;
  selected: boolean;
  disabled: boolean;
  onToggle: (id: string) => void;
}

function CallRow({ call, selected, disabled, onToggle }: CallRowProps) {
  return (
    <li className="group">
      <div
        className={cn(
          "flex items-start gap-3 rounded-xl border px-3 py-2.5 transition-colors",
          selected
            ? "border-sky-500/40 bg-sky-500/5"
            : "border-border/50 bg-muted/10 hover:border-border",
          disabled && "opacity-60",
        )}
      >
        <span className="relative mt-0.5 flex size-4 shrink-0 items-center justify-center">
          <input
            type="checkbox"
            checked={selected}
            disabled={disabled}
            onChange={() => onToggle(call.id)}
            aria-label={`${selected ? "Remover" : "Incluir"} ${describeTeamCall(call)}`}
            className={cn(
              "peer size-4 cursor-pointer appearance-none rounded border border-border bg-background transition-colors",
              "checked:border-sky-500 checked:bg-sky-500 hover:border-sky-500/50",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40",
              "disabled:cursor-not-allowed",
            )}
          />
          <Check
            className="pointer-events-none absolute size-3 text-white opacity-0 transition-opacity peer-checked:opacity-100"
            aria-hidden="true"
          />
        </span>

        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-sm font-medium text-foreground">
            {describeTeamCall(call)}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <PhoneCall className="size-3" aria-hidden="true" />
            <span>Participação medida no Teams</span>
            {call.wasClipped === true && (
              <>
                <span aria-hidden="true">·</span>
                <span>sem sobrepor agenda</span>
              </>
            )}
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="font-mono text-xs tabular-nums text-foreground">
            {formatDuration(Math.max(1, call.minutes))}
          </span>
          <span className="font-mono text-[10px] tabular-nums text-muted-foreground">
            {formatCallRange(call)}
          </span>
        </div>
      </div>
    </li>
  );
}

// ─── Panel ────────────────────────────────────────────────────────────

/**
 * "O que você fez hoje" — the day's meetings, ready to become entries.
 *
 * Built for the people whose work never reaches Azure DevOps: the list is
 * already filtered of cancellations, declined invitations and double-booking,
 * so what shows up is what actually happened.
 */
export function DayCollaborationPanel({
  date,
  locked,
  lockMessage,
  onAdjust,
}: DayCollaborationPanelProps) {
  const prefersReducedMotion = useReducedMotion();
  const { day, isLoading, error, reload } = useCollaborationDay({ date });
  const { isApplying, apply } = useQuickLog();

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectedCallIds, setSelectedCallIds] = useState<Set<string>>(
    new Set(),
  );
  const [projectId, setProjectId] = useState("");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [showAllCalls, setShowAllCalls] = useState(false);

  // High-confidence meetings start selected; the rest is an explicit choice.
  useEffect(() => {
    if (!day) return;
    const highConfidenceMeetings = day.meetings
      .filter((meeting) => meeting.confidence === "high")
      .slice(0, MAX_BATCH);

    setSelectedIds(
      new Set(highConfidenceMeetings.map((meeting) => meeting.id)),
    );
    setSelectedCallIds(
      new Set(
        (day.calls ?? [])
          .filter((call) => call.alreadyLogged !== true)
          .slice(0, Math.max(0, MAX_BATCH - highConfidenceMeetings.length))
          .map((call) => call.id),
      ),
    );
    setShowAll(false);
    setShowAllCalls(false);
  }, [day]);

  useEffect(() => {
    let active = true;

    async function loadProjects() {
      try {
        const res = await fetch("/api/projects?status=active");
        if (!res.ok) return;

        const data = (await res.json()) as { projects?: ProjectOption[] };
        if (active) setProjects(data.projects ?? []);
      } catch (err: unknown) {
        console.error("[DayCollaborationPanel] loadProjects:", err);
      }
    }

    void loadProjects();
    return () => {
      active = false;
    };
  }, []);

  const meetings = day?.meetings ?? [];
  const calls = day?.calls ?? [];
  const visibleMeetings = showAll
    ? meetings
    : meetings.slice(0, VISIBLE_MEETINGS);
  const visibleCalls = showAllCalls ? calls : calls.slice(0, VISIBLE_MEETINGS);

  const selected = useMemo(
    () => meetings.filter((meeting) => selectedIds.has(meeting.id)),
    [meetings, selectedIds],
  );
  const selectedCalls = useMemo(
    () => calls.filter((call) => selectedCallIds.has(call.id)),
    [calls, selectedCallIds],
  );
  const selectedMinutes =
    selected.reduce((sum, meeting) => sum + meeting.minutes, 0) +
    selectedCalls.reduce((sum, call) => sum + Math.max(1, call.minutes), 0);
  const selectedCount = selected.length + selectedCalls.length;

  const handleToggle = useCallback(
    (id: string) => {
      setSelectedIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else if (next.size + selectedCallIds.size < MAX_BATCH) next.add(id);
        return next;
      });
    },
    [selectedCallIds],
  );

  const handleToggleCall = useCallback(
    (id: string) => {
      setSelectedCallIds((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else if (selectedIds.size + next.size < MAX_BATCH) next.add(id);
        return next;
      });
    },
    [selectedIds],
  );

  const handleLog = useCallback(async () => {
    if (!projectId) {
      toast.error("Escolha o projeto antes de lançar.");
      return;
    }
    if (selectedCount === 0) return;

    const project = projects.find((item) => item.id === projectId);

    const { created, failures } = await apply(
      [
        ...selected.map((meeting) => ({
          date,
          description: meeting.title,
          minutes: meeting.minutes,
          source: "calendar" as const,
        })),
        ...selectedCalls.map((call) => ({
          date: call.date ?? date,
          description: describeTeamCall(call),
          minutes: Math.max(1, call.minutes),
          source: "teams_call" as const,
          sourceId: call.id,
        })),
      ],
      { projectId, billable: project?.billable ?? true },
    );

    if (created > 0) {
      toast.success(
        `${created} ${created === 1 ? "item lançado" : "itens lançados"} · ${formatDuration(selectedMinutes)}`,
      );
      setSelectedIds(new Set());
      setSelectedCallIds(new Set());
      void reload();
    }

    if (failures.length > 0) {
      console.error("[DayCollaborationPanel] handleLog:", failures);
      toast.error(
        `${failures.length} dia(s) não puderam ser lançados: ${failures
          .map((failure) => `${failure.date} (${failure.reason})`)
          .join("; ")}`,
      );
    }
  }, [
    apply,
    date,
    projectId,
    projects,
    reload,
    selected,
    selectedCalls,
    selectedCount,
    selectedMinutes,
  ]);

  // ── Loading ──
  // `isLoading` only flips inside the effect, so the first render has
  // isLoading=false and day=null. The absence of both is the pending state.
  if ((isLoading || !day) && !error) {
    return (
      <section className="rounded-[28px] border border-border/60 bg-card/90 p-5 shadow-sm">
        <output
          aria-label="Carregando o que você fez hoje..."
          className="block space-y-3"
        >
          <Skeleton className="h-4 w-48 rounded" />
          <Skeleton className="h-2 w-full rounded-full" />
          <Skeleton className="h-14 w-full rounded-xl" />
          <Skeleton className="h-14 w-full rounded-xl" />
        </output>
      </section>
    );
  }

  // ── Error ──
  if (error) {
    return (
      <section className="rounded-[28px] border border-border/60 bg-card/90 p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="rounded-full"
            onClick={() => void reload()}
          >
            <RefreshCw className="mr-1.5 size-3.5" aria-hidden="true" />
            Tentar de novo
          </Button>
        </div>
      </section>
    );
  }

  // Unreachable — the loading branch above covers a null day. Kept so the
  // narrowing is explicit rather than implied.
  if (!day) return null;

  const hasNothing =
    meetings.length === 0 && calls.length === 0 && day.exclusions.length === 0;
  const portraitWorth =
    !day.needsReauth &&
    day.portrait &&
    (day.portrait.availability === "ok"
      ? day.portrait.totalMinutes > 0
      : meetings.length > 0 || calls.length > 0);

  // Nothing detected and nothing to say — stay out of the way. The re-login
  // prompt is the exception: hiding it would strand the person on a feature
  // that silently never works.
  if (hasNothing && !portraitWorth && !day.needsReauth) return null;

  return (
    <TooltipProvider delayDuration={200}>
      <motion.section
        data-tour="time-collaboration"
        initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
        className="rounded-[28px] border border-border/60 bg-card/90 shadow-sm"
      >
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-500/10">
                <CalendarClock
                  className="size-4 text-brand-500"
                  aria-hidden="true"
                />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-foreground">
                  O que você fez hoje
                </h2>
                <p className="text-xs text-muted-foreground">
                  {meetings.length + calls.length > 0
                    ? `${meetings.length} ${meetings.length === 1 ? "reunião" : "reuniões"} da agenda · ${calls.length} ${calls.length === 1 ? "chamada medida" : "chamadas medidas"}`
                    : "Nenhuma reunião ou chamada para lançar"}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {day.suggestedMinutes > 0 && (
                <Badge
                  variant="secondary"
                  className="rounded-full font-mono text-[11px] tabular-nums"
                >
                  {formatDuration(day.suggestedMinutes)} disponíveis
                </Badge>
              )}

              {/* This panel answers "hoje". The same sources answer the week
                  and the month one click away, which is where a leader goes
                  after noticing something odd in a single day. */}
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-7 gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                <Link href="/dashboard/my-time">
                  Ver o período
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </Link>
              </Button>
            </div>
          </div>

          {day.needsReauth && <ReauthNotice feature="o resumo do seu dia" />}

          {day.away && (
            <div className="flex items-start gap-2 rounded-xl border border-border/50 bg-muted/20 px-3 py-2.5">
              <Plane
                className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xs text-muted-foreground">
                Sua resposta automática está ligada hoje. Nada de cobrança —
                lance só se realmente trabalhou.
              </p>
            </div>
          )}

          {/* Only shown when the mailbox is the source: a target that differs
              from the profile's usual daily capacity has to explain where it came from. */}
          {day.sources.mailbox && day.target.isWorkingDay && (
            <p className="text-xs text-muted-foreground">
              Meta de hoje:{" "}
              <span className="font-mono tabular-nums text-foreground">
                {formatDuration(day.target.minutes)}
              </span>{" "}
              — sua semana de {day.target.workingDaysPerWeek}{" "}
              {day.target.workingDaysPerWeek === 1 ? "dia" : "dias"}, pelo
              horário de trabalho do seu Outlook.
            </p>
          )}

          {day.sources.mailbox && !day.target.isWorkingDay && (
            <p className="text-xs text-muted-foreground">
              Hoje não é dia útil no seu horário de trabalho do Outlook — o que
              você lançar aqui é hora extra.
            </p>
          )}

          {!day.needsReauth && day.portrait && (
            <ActivityPortraitBar portrait={day.portrait} />
          )}

          {day.warnings.map((warning) => (
            <p key={warning} className="text-xs text-muted-foreground">
              {warning}
            </p>
          ))}

          {day.callStatus && day.callStatus.health !== "ok" && (
            <p className="rounded-xl border border-sky-500/20 bg-sky-500/5 px-3 py-2 text-xs text-muted-foreground">
              {day.callStatus.detail}
            </p>
          )}

          {meetings.length + calls.length > 0 && (
            <>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <label
                  htmlFor="collaboration-project"
                  className="shrink-0 text-xs font-medium text-muted-foreground"
                >
                  Lançar em
                </label>
                <div id="collaboration-project" className="min-w-0 flex-1">
                  <ProjectCombobox
                    projects={projects}
                    value={projectId}
                    onChange={setProjectId}
                    placeholder="Escolha o projeto"
                    disabled={locked || isApplying}
                  />
                </div>
              </div>

              {meetings.length > 0 && (
                <ul className="space-y-2">
                  <AnimatePresence initial={false}>
                    {visibleMeetings.map((meeting) => (
                      <motion.div
                        key={meeting.id}
                        layout={!prefersReducedMotion}
                        initial={prefersReducedMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                      >
                        <MeetingRow
                          meeting={meeting}
                          selected={selectedIds.has(meeting.id)}
                          disabled={locked}
                          onToggle={handleToggle}
                          onAdjust={onAdjust}
                        />
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </ul>
              )}

              {meetings.length > VISIBLE_MEETINGS && (
                <button
                  type="button"
                  onClick={() => setShowAll((current) => !current)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  {showAll
                    ? "Mostrar menos"
                    : `Ver todas as ${meetings.length} reuniões`}
                </button>
              )}

              {calls.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 pt-1">
                    <PhoneCall
                      className="size-3.5 text-sky-600 dark:text-sky-400"
                      aria-hidden="true"
                    />
                    <p className="text-xs font-medium text-muted-foreground">
                      Chamadas do Teams sem convite de agenda
                    </p>
                  </div>
                  <ul className="space-y-2">
                    {visibleCalls.map((call) => (
                      <CallRow
                        key={call.id}
                        call={call}
                        selected={selectedCallIds.has(call.id)}
                        disabled={locked || call.alreadyLogged === true}
                        onToggle={handleToggleCall}
                      />
                    ))}
                  </ul>
                </div>
              )}

              {calls.length > VISIBLE_MEETINGS && (
                <button
                  type="button"
                  onClick={() => setShowAllCalls((current) => !current)}
                  className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-500/40"
                >
                  {showAllCalls
                    ? "Mostrar menos chamadas"
                    : `Ver todas as ${calls.length} chamadas`}
                </button>
              )}
            </>
          )}

          <MeetingExclusionsNote exclusions={day.exclusions} />

          {meetings.length + calls.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/40 pt-4">
              <p className="text-xs text-muted-foreground">
                {selectedCount === 0
                  ? "Selecione o que quer lançar"
                  : `${selectedCount} ${selectedCount === 1 ? "selecionada" : "selecionadas"} · ${formatDuration(selectedMinutes)}`}
              </p>

              <Button
                size="sm"
                className="rounded-full bg-brand-500 text-white hover:bg-brand-600"
                disabled={locked || isApplying || selectedCount === 0}
                onClick={() => void handleLog()}
                title={locked ? lockMessage : undefined}
              >
                {isApplying ? (
                  <>
                    <Loader2
                      className="mr-1.5 size-3.5 animate-spin"
                      aria-hidden="true"
                    />
                    Lançando...
                  </>
                ) : (
                  <>
                    <Check className="mr-1.5 size-3.5" aria-hidden="true" />
                    Lançar {selectedCount > 0 ? selectedCount : ""}
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </motion.section>
    </TooltipProvider>
  );
}
