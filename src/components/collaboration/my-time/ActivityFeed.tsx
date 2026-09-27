"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import {
  ExternalLink,
  GitCommitHorizontal,
  GitPullRequest,
  Loader2,
  type LucideIcon,
  PhoneCall,
  SquareKanban,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { MeetingTitle } from "@/components/collaboration/MeetingTitle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatMeetingRange } from "@/hooks/use-collaboration-day";
import { describeTeamCall } from "@/lib/collaboration/calls";
import {
  cn,
  formatDateLabel,
  formatDuration,
  formatLocalDate,
} from "@/lib/utils";
import type {
  MeetingSignal,
  PeriodAction,
  PeriodActionKind,
  PeriodActionsResult,
  TeamCallSignal,
} from "@/types/collaboration";

/** Days rendered before the "ver tudo" toggle. */
const VISIBLE_DAYS = 3;
/**
 * Rows rendered per day before the day collapses behind a counter.
 *
 * Without it a single day of twenty commits stretched the card past three
 * thousand pixels, leaving the column beside it as a wall of empty card. A
 * nested scroll area was the first attempt and was worse: this project's
 * `ScrollArea` root carries no `overflow-hidden`, so `max-h` clipped nothing
 * and the list spilled over the cards below it.
 */
const VISIBLE_ROWS_PER_DAY = 5;

const KIND_META: Record<
  PeriodActionKind,
  { icon: LucideIcon; label: string; className: string }
> = {
  meeting: {
    icon: Users,
    label: "Reunião",
    className: "bg-brand-500/12 text-brand-500",
  },
  call: {
    icon: PhoneCall,
    label: "Chamada",
    className: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  },
  pull_request: {
    icon: GitPullRequest,
    label: "Pull request",
    className: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  },
  commit: {
    icon: GitCommitHorizontal,
    label: "Commit",
    className: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  },
  work_item: {
    icon: SquareKanban,
    label: "Work item",
    className: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  },
};

const FILTERS: Array<{ value: PeriodActionKind | "all"; label: string }> = [
  { value: "all", label: "Tudo" },
  { value: "meeting", label: "Reuniões" },
  { value: "call", label: "Chamadas" },
  { value: "pull_request", label: "PRs" },
  { value: "commit", label: "Commits" },
  { value: "work_item", label: "Work items" },
];

function meetingToAction(meeting: MeetingSignal): PeriodAction {
  return {
    id: `meeting-${meeting.id}`,
    kind: "meeting",
    title: meeting.title,
    // The browser's own calendar, not the UTC prefix of the instant: a late
    // meeting would otherwise be filed under tomorrow.
    date: formatLocalDate(new Date(meeting.startIso)),
    timestampIso: meeting.startIso,
    context: formatMeetingRange(meeting),
    minutes: meeting.minutes,
    url: null,
  };
}

function callToAction(call: TeamCallSignal): PeriodAction {
  return {
    id: `call-${call.id}`,
    kind: "call",
    title: describeTeamCall(call),
    date: call.date ?? formatLocalDate(new Date(call.startIso)),
    timestampIso: call.startIso,
    context:
      call.alreadyLogged === true
        ? "Participação medida · já apontada"
        : "Participação medida no Teams",
    minutes: Math.max(1, call.minutes),
    url: call.joinWebUrl ?? null,
  };
}

function ActionRow({
  action,
  subject,
  onReview,
}: {
  action: PeriodAction;
  /** Raw calendar subject, so a shortened meeting title keeps its tooltip. */
  subject?: string;
  onReview?: () => void;
}) {
  const meta = KIND_META[action.kind];
  const Icon = meta.icon;

  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-muted/40">
      <span
        className={cn(
          "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg",
          meta.className,
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="min-w-0 text-sm text-foreground">
          {action.kind === "meeting" && subject !== undefined ? (
            <MeetingTitle title={action.title} subject={subject} />
          ) : (
            <span className="line-clamp-2">{action.title}</span>
          )}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
          <span>{meta.label}</span>
          {action.context && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{action.context}</span>
            </>
          )}
          {action.minutes !== null && (
            <>
              <span aria-hidden="true">·</span>
              <span className="font-mono tabular-nums">
                {formatDuration(action.minutes)}
              </span>
            </>
          )}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
        {onReview && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="h-7 px-2 text-[11px]"
            onClick={onReview}
          >
            Revisar
          </Button>
        )}

        {action.url && (
          <Button asChild variant="ghost" size="icon" className="size-7">
            <a
              href={action.url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Abrir ${meta.label}`}
            >
              <ExternalLink className="size-3.5" aria-hidden="true" />
            </a>
          </Button>
        )}
      </div>
    </li>
  );
}

export interface ActivityFeedProps {
  meetings: MeetingSignal[];
  calls?: TeamCallSignal[];
  actions: PeriodActionsResult | null;
  isLoadingActions: boolean;
  /** When set, only this day's rows are shown — driven by the day chart. */
  selectedDate?: string | null;
  onReviewCall?: (call: TeamCallSignal) => void;
}

/**
 * Everything the person did in the period, from every source at once.
 *
 * Meetings arrive with the calendar and render immediately; the Azure DevOps
 * rows drop in when that integration answers. The filter exists because the
 * two audiences this page serves — a lead and a developer — read completely
 * different halves of the same list.
 */
export function ActivityFeed({
  meetings,
  calls = [],
  actions,
  isLoadingActions,
  selectedDate = null,
  onReviewCall,
}: ActivityFeedProps) {
  const [filter, setFilter] = useState<PeriodActionKind | "all">("all");
  const [expanded, setExpanded] = useState(false);
  const [expandedDays, setExpandedDays] = useState<Set<string>>(new Set());

  function toggleDay(date: string): void {
    setExpandedDays((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  }

  const prefersReduced = useReducedMotion();

  const subjectById = useMemo(
    () => new Map(meetings.map((meeting) => [meeting.id, meeting.subject])),
    [meetings],
  );

  const callByActionId = useMemo(
    () => new Map(calls.map((call) => [`call-${call.id}`, call])),
    [calls],
  );

  const grouped = useMemo(() => {
    const all = [
      ...meetings.map(meetingToAction),
      ...calls.map(callToAction),
      ...(actions?.actions ?? []),
    ]
      .filter((action) => filter === "all" || action.kind === filter)
      .filter((action) => !selectedDate || action.date === selectedDate);

    all.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));

    const byDate = new Map<string, PeriodAction[]>();
    for (const action of all) {
      const bucket = byDate.get(action.date);
      if (bucket) bucket.push(action);
      else byDate.set(action.date, [action]);
    }

    return [...byDate.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [meetings, calls, actions, filter, selectedDate]);

  const visible = expanded ? grouped : grouped.slice(0, VISIBLE_DAYS);
  const totalActions = grouped.reduce((sum, [, rows]) => sum + rows.length, 0);

  return (
    <Card className="border-border/50 bg-card/80" data-tour="my-time-activity">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="font-display text-base">
              Ações realizadas
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              {totalActions > 0
                ? `${totalActions} registro(s) de atividade${selectedDate ? " neste dia" : " no período"}.`
                : `Nenhuma atividade encontrada${selectedDate ? " neste dia" : " no período"}.`}
            </p>
          </div>

          {isLoadingActions && (
            <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden="true" />
              lendo o Azure DevOps…
            </span>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              variant={filter === option.value ? "secondary" : "ghost"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setFilter(option.value)}
              aria-pressed={filter === option.value}
            >
              {option.label}
            </Button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {visible.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Nada para mostrar com esse filtro.
          </p>
        ) : (
          <div className="space-y-4">
            <AnimatePresence initial={false}>
              {visible.map(([date, rows]) => {
                const dayExpanded = expandedDays.has(date);
                const shown = dayExpanded
                  ? rows
                  : rows.slice(0, VISIBLE_ROWS_PER_DAY);
                const hidden = rows.length - shown.length;

                return (
                  <motion.div
                    key={date}
                    initial={prefersReduced ? false : { opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <div className="mb-1 flex items-center gap-2">
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        {formatDateLabel(date)}
                      </h3>
                      <span
                        className="h-px flex-1 bg-border/50"
                        aria-hidden="true"
                      />
                      <Badge variant="outline" className="text-[10px]">
                        {rows.length}
                      </Badge>
                    </div>

                    <ul className="space-y-0.5">
                      {shown.map((action) => {
                        const call =
                          action.kind === "call"
                            ? callByActionId.get(action.id)
                            : undefined;

                        return (
                          <ActionRow
                            key={action.id}
                            action={action}
                            onReview={
                              call &&
                              call.alreadyLogged !== true &&
                              onReviewCall
                                ? () => onReviewCall(call)
                                : undefined
                            }
                            subject={
                              action.kind === "meeting"
                                ? (subjectById.get(
                                    action.id.replace("meeting-", ""),
                                  ) ?? action.title)
                                : undefined
                            }
                          />
                        );
                      })}
                    </ul>

                    {(hidden > 0 || dayExpanded) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="mt-1 h-7 w-full text-[11px] text-muted-foreground"
                        onClick={() => toggleDay(date)}
                      >
                        {dayExpanded
                          ? "Mostrar menos deste dia"
                          : `+${hidden} neste dia`}
                      </Button>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>

            {grouped.length > VISIBLE_DAYS && (
              <Button
                variant="ghost"
                size="sm"
                className="w-full text-xs"
                onClick={() => setExpanded((current) => !current)}
              >
                {expanded
                  ? "Mostrar menos"
                  : `Ver todos os ${grouped.length} dias`}
              </Button>
            )}
          </div>
        )}

        {!isLoadingActions &&
          actions &&
          !actions.sources.azureDevOpsConfigured && (
            <p className="mt-4 rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-[11px] leading-relaxed text-muted-foreground">
              Conecte o Azure DevOps em Configurações → Integrações para ver
              também pull requests, commits e work items aqui.
            </p>
          )}
      </CardContent>
    </Card>
  );
}
