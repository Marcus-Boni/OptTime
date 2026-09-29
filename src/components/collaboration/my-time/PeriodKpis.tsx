"use client";

import {
  Briefcase,
  CalendarClock,
  Clock,
  type LucideIcon,
  Users,
} from "lucide-react";
import { ProgressRing } from "@/components/collaboration/my-time/ProgressRing";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatClock } from "@/lib/collaboration/period";
import { cn, formatDuration } from "@/lib/utils";
import type { CollaborationPeriod } from "@/types/collaboration";

interface MetricProps {
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  tooltip: string;
  /** 0–100; renders the ring in place of the icon when present. */
  progress?: number;
  tone?: "default" | "brand" | "positive" | "action";
  /** Turns the whole cell into a button. */
  onAction?: () => void;
  actionLabel?: string;
}

const TONE_TEXT: Record<NonNullable<MetricProps["tone"]>, string> = {
  default: "text-muted-foreground",
  brand: "text-brand-500",
  positive: "text-emerald-600 dark:text-emerald-400",
  action: "text-amber-600 dark:text-amber-400",
};

function Metric({
  icon: Icon,
  label,
  value,
  hint,
  tooltip,
  progress,
  tone = "default",
  onAction,
  actionLabel,
}: MetricProps) {
  const body = (
    <div className="flex h-full items-start gap-3 px-5 py-4">
      {progress === undefined ? (
        <span
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted",
            TONE_TEXT[tone],
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </span>
      ) : (
        <ProgressRing
          value={progress}
          className={cn("mt-0.5", TONE_TEXT[tone])}
          label={`${label}: ${Math.round(progress)}%`}
        >
          <span className="text-foreground">{Math.round(progress)}</span>
        </ProgressRing>
      )}

      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "mt-1 block font-mono text-2xl font-bold tabular-nums",
            tone === "action" ? TONE_TEXT.action : "text-foreground",
          )}
        >
          {value}
        </span>
        <span className="mt-1 block text-[11px] leading-relaxed text-muted-foreground">
          {hint}
        </span>
        {onAction && actionLabel && (
          <span className="mt-1.5 block text-[11px] font-medium text-brand-500 underline-offset-4 group-hover:underline">
            {actionLabel}
          </span>
        )}
      </span>
    </div>
  );

  const cell = onAction ? (
    <button
      type="button"
      onClick={onAction}
      className="group h-full w-full rounded-xl text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand-500/40"
    >
      {body}
    </button>
  ) : (
    body
  );

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="h-full bg-card">{cell}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs leading-relaxed">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

export interface PeriodKpisProps {
  period: CollaborationPeriod;
  /** Opens the batch dialog from the "sem registro" cell. */
  onLogMeetings?: () => void;
}

/**
 * The four numbers, in one frame.
 *
 * Deliberately a single card split by dividers rather than four separate
 * cards: the previous version stacked bordered boxes inside bordered boxes and
 * the page read as a wall of containers.
 *
 * None of the four rewards working more hours. "Maior janela sem reunião" is
 * here instead of a raw hour count precisely because it is the one number that
 * gets better when the week is arranged well rather than when it is longer —
 * and it is named "janela", never "foco", so it cannot be mistaken for the
 * Microsoft figure that sums every free gap of the week.
 */
export function PeriodKpis({ period, onLogMeetings }: PeriodKpisProps) {
  const { totals, shape } = period;

  // Without the calendar these three cannot be computed, and printing zeros
  // would be worse than printing nothing: "sem registro: em dia" would claim
  // every meeting is logged when we could not read a single one.
  const hasCalendar = period.sources.calendar;

  const unloggedMeetings = Math.max(
    0,
    totals.meetingMinutes - totals.loggedMeetingMinutes,
  );
  const unloggedCalls = (period.calls ?? [])
    .filter((call) => call.alreadyLogged !== true)
    .reduce((sum, call) => sum + (call.minutes || 0), 0);
  const totalUnlogged = unloggedMeetings + unloggedCalls;

  const callMinutes = (period.calls ?? []).reduce(
    (sum, call) => sum + (call.minutes || 0),
    0,
  );
  const totalCommunicationMinutes = totals.meetingMinutes + callMinutes;

  const loggedFromMeetings = Math.min(
    totals.loggedMeetingMinutes,
    totals.loggedMinutes,
  );
  const executionMinutes = Math.max(
    0,
    totals.loggedMinutes - loggedFromMeetings,
  );
  const executionSharePercent =
    totals.loggedMinutes > 0
      ? Math.round((executionMinutes / totals.loggedMinutes) * 100)
      : 0;

  const targetProgress =
    totals.targetMinutes > 0
      ? (totals.loggedMinutes / totals.targetMinutes) * 100
      : 0;

  // The headline duration counts every meeting; the percentage counts only the
  // minutes that landed inside the working window. Naming the difference is
  // what keeps "6h30" and "14%" from looking like a contradiction.
  const outsideWindowMinutes = Math.max(
    0,
    totals.meetingMinutes - shape.meetingMinutesInWindow,
  );

  return (
    // The hairline grid: a 1px gap over a border-coloured background draws the
    // separators. `divide-x` cannot do this — in a two-column grid it puts a
    // left border on the third cell, which lands against the outer edge.
    <div
      className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 xl:grid-cols-4"
      data-tour="my-time-kpis"
    >
      <Metric
        icon={Clock}
        tone="brand"
        label="Horas registradas"
        value={formatDuration(totals.loggedMinutes)}
        progress={targetProgress}
        hint={`de ${formatDuration(totals.targetMinutes)} previstas em ${totals.workingDays} dia(s) útil(is)`}
        tooltip="As horas que você já apontou no período. A previsão vem da sua capacidade semanal distribuída pelos dias úteis do seu horário de trabalho no Outlook."
      />

      <Metric
        icon={Users}
        tone={
          hasCalendar && shape.meetingLoadPercent >= 50 ? "action" : "default"
        }
        label={callMinutes > 0 ? "Reuniões & Chamadas" : "Carga de reuniões"}
        value={
          hasCalendar || callMinutes > 0
            ? formatDuration(totalCommunicationMinutes)
            : "—"
        }
        progress={hasCalendar ? shape.meetingLoadPercent : undefined}
        hint={
          !hasCalendar && callMinutes === 0
            ? "agenda indisponível neste período"
            : callMinutes > 0
              ? `${formatDuration(totals.meetingMinutes)} em reuniões + ${formatDuration(callMinutes)} em chamadas · ${shape.meetingLoadPercent}% da jornada`
              : shape.contractedMinutes === 0
                ? `${period.ledger.attended.count} reunião(ões) no período`
                : outsideWindowMinutes > 0
                  ? `${formatDuration(shape.meetingMinutesInWindow)} dentro da jornada de ${formatDuration(shape.contractedMinutes)} (${shape.meetingLoadPercent}%) · ${formatDuration(outsideWindowMinutes)} fora do expediente`
                  : `${shape.meetingLoadPercent}% da sua jornada de ${formatDuration(shape.contractedMinutes)}, em ${period.ledger.attended.count} reunião(ões)`
        }
        tooltip={
          callMinutes > 0
            ? `Tempo total em reuniões da agenda (${formatDuration(totals.meetingMinutes)}) e chamadas medidas no Teams (${formatDuration(callMinutes)}). A porcentagem (${shape.meetingLoadPercent}%) mede a carga de reuniões sobre a sua jornada de trabalho (${formatDuration(shape.contractedMinutes)}).`
            : `Duração já normalizada: reuniões sobrepostas são recortadas para que a mesma hora não conte duas vezes. A porcentagem é sobre a sua jornada de trabalho (${formatDuration(shape.contractedMinutes)} no período), e não sobre a janela ${formatClock(shape.windowStartMinute)}–${formatClock(shape.windowEndMinute)} do Outlook, que é maior porque inclui o almoço.`
        }
      />

      <Metric
        icon={Briefcase}
        tone={
          totals.loggedMinutes > 0 && executionSharePercent >= 60
            ? "positive"
            : "default"
        }
        label="Trabalho em projetos"
        value={
          totals.loggedMinutes > 0 ? formatDuration(executionMinutes) : "—"
        }
        progress={totals.loggedMinutes > 0 ? executionSharePercent : undefined}
        hint={
          totals.loggedMinutes === 0
            ? "nenhum registro de horas no período"
            : `${executionSharePercent}% do seu tempo apontado foi dedicado a entregas práticas`
        }
        tooltip="Horas que você registrou e que não vieram de uma reunião da agenda. Mede o tempo efetivamente dedicado a tarefas, desenvolvimento e entregas de projetos."
      />

      <Metric
        icon={CalendarClock}
        tone={
          !hasCalendar && (period.calls?.length ?? 0) === 0
            ? "default"
            : totalUnlogged > 0
              ? "action"
              : "positive"
        }
        label="Sem registro"
        value={
          !hasCalendar && (period.calls?.length ?? 0) === 0
            ? "—"
            : totalUnlogged > 0
              ? formatDuration(totalUnlogged)
              : "em dia"
        }
        hint={
          !hasCalendar && (period.calls?.length ?? 0) === 0
            ? "sem a agenda não dá para dizer o que falta apontar"
            : totalUnlogged > 0
              ? unloggedMeetings > 0 && unloggedCalls > 0
                ? `${formatDuration(unloggedMeetings)} em reuniões + ${formatDuration(unloggedCalls)} em chamadas`
                : unloggedCalls > 0
                  ? `${formatDuration(unloggedCalls)} em chamadas Teams sem apontamento`
                  : "reuniões que aconteceram e ainda não viraram apontamento"
              : "todos os compromissos e chamadas já estão apontados"
        }
        tooltip="Comparação entre as reuniões da agenda e chamadas no Teams detectadas contra as horas já lançadas no seu registro de horas."
        onAction={
          (hasCalendar || (period.calls?.length ?? 0) > 0) && totalUnlogged > 0
            ? onLogMeetings
            : undefined
        }
        actionLabel="Apontar em 1 clique"
      />
    </div>
  );
}
