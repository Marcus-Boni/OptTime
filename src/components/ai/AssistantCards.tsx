"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  FolderKanban,
  Inbox,
  ListChecks,
  Timer,
  Users,
} from "lucide-react";
import type {
  ApprovalsCard,
  AssistantCard,
  EntriesListCard,
  ProjectsCard,
  TeamOverviewCard,
  TimerCard,
  TimesheetStatusCard,
  WorkItemsCard,
  WorkSummaryCard,
} from "@/lib/ai/types";
import { cn, formatDuration } from "@/lib/utils";

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  open: {
    label: "Aberto",
    className:
      "bg-neutral-500/10 text-neutral-700 ring-1 ring-neutral-500/20 dark:text-neutral-300",
  },
  submitted: {
    label: "Submetido",
    className:
      "bg-blue-500/10 text-blue-700 ring-1 ring-blue-500/25 dark:text-blue-300",
  },
  approved: {
    label: "Aprovado",
    className:
      "bg-emerald-500/10 text-emerald-700 ring-1 ring-emerald-500/25 dark:text-emerald-300",
  },
  rejected: {
    label: "Rejeitado",
    className:
      "bg-red-500/10 text-red-700 ring-1 ring-red-500/25 dark:text-red-300",
  },
};

function CardShell({
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl bg-card shadow-xs ring-1 ring-black/[0.07] dark:bg-neutral-900/90 dark:ring-white/10">
      <header className="flex items-center justify-between gap-2 border-black/[0.06] border-b px-3.5 py-2.5 dark:border-white/[0.08]">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-orange-600 dark:bg-orange-500/15 dark:text-orange-400"
            aria-hidden="true"
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h4 className="truncate font-semibold text-foreground text-xs">
              {title}
            </h4>
            {subtitle && (
              <p className="truncate text-[10.5px] text-neutral-500 dark:text-neutral-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {badge}
      </header>
      <div className="p-3.5">{children}</div>
    </section>
  );
}

function ProgressBar({
  value,
  target,
  className,
}: {
  value: number;
  target: number;
  className?: string;
}) {
  const percentage =
    target > 0 ? Math.min(100, Math.round((value / target) * 100)) : 0;
  const reached = value >= target && target > 0;

  return (
    <div
      className={cn(
        "h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800",
        className,
      )}
      role="progressbar"
      aria-valuenow={percentage}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progresso em relação à meta"
    >
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500",
          reached ? "bg-emerald-500" : "bg-orange-500",
        )}
        style={{ width: `${Math.max(percentage, 2)}%` }}
      />
    </div>
  );
}

function shortWeekday(weekday: string): string {
  const clean = weekday.replace("-feira", "").trim();
  return clean.slice(0, 3);
}

function WorkSummary({ card }: { card: WorkSummaryCard }) {
  const balance = card.targetMinutes
    ? card.totalMinutes - card.targetMinutes
    : 0;
  const activeDays = card.days.filter((day) => day.minutes > 0);
  const peak = Math.max(1, ...card.days.map((day) => day.minutes));
  const nonBillableMinutes = Math.max(
    0,
    card.totalMinutes - card.billableMinutes,
  );
  const billableShare =
    card.totalMinutes > 0
      ? Math.round((card.billableMinutes / card.totalMinutes) * 100)
      : 0;

  return (
    <CardShell
      icon={<Clock className="h-3.5 w-3.5" />}
      title={card.title}
      subtitle={`${card.periodLabel} · ${card.entryCount} lançamento(s)`}
      badge={
        card.targetMinutes ? (
          <span
            className={cn(
              "shrink-0 rounded-full px-2 py-0.5 font-mono font-medium text-[10.5px] tabular-nums",
              balance >= 0
                ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
            )}
          >
            {balance >= 0 ? "+" : "−"}
            {formatDuration(Math.abs(balance))} vs meta
          </span>
        ) : null
      }
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-bold font-mono text-2xl text-foreground tracking-tight tabular-nums">
          {formatDuration(card.totalMinutes)}
        </span>
        {card.targetMinutes ? (
          <span className="font-mono text-[10.5px] text-neutral-400 tabular-nums dark:text-neutral-500">
            meta {formatDuration(card.targetMinutes)}
          </span>
        ) : null}
      </div>

      {card.targetMinutes ? (
        <ProgressBar
          value={card.totalMinutes}
          target={card.targetMinutes}
          className="mt-2"
        />
      ) : null}

      <dl className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
        <div className="rounded-xl bg-neutral-100/80 px-3 py-2 ring-1 ring-black/[0.04] dark:bg-white/[0.04] dark:ring-white/[0.06]">
          <dt className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span>Faturável</span>
            <span className="font-mono text-[10px]">{billableShare}%</span>
          </dt>
          <dd className="mt-0.5 font-mono font-semibold text-foreground tabular-nums">
            {formatDuration(card.billableMinutes)}
          </dd>
        </div>
        <div className="rounded-xl bg-neutral-100/80 px-3 py-2 ring-1 ring-black/[0.04] dark:bg-white/[0.04] dark:ring-white/[0.06]">
          <dt className="flex items-center justify-between text-neutral-500 dark:text-neutral-400">
            <span>Não faturável</span>
            <span className="font-mono text-[10px]">
              {card.totalMinutes > 0 ? 100 - billableShare : 0}%
            </span>
          </dt>
          <dd className="mt-0.5 font-mono font-semibold text-foreground tabular-nums">
            {formatDuration(nonBillableMinutes)}
          </dd>
        </div>
      </dl>

      {card.projects.length > 0 && (
        <ul className="mt-3.5 space-y-2">
          {card.projects.slice(0, 5).map((slice) => (
            <li key={slice.projectId}>
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span
                    className="h-2 w-2 shrink-0 rounded-full bg-orange-500"
                    style={
                      slice.color ? { backgroundColor: slice.color } : undefined
                    }
                    aria-hidden="true"
                  />
                  <span className="truncate font-medium text-neutral-700 dark:text-neutral-200">
                    {slice.name}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-neutral-500 tabular-nums dark:text-neutral-400">
                  {formatDuration(slice.minutes)} · {slice.percentage}%
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200/80 dark:bg-neutral-800">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all duration-500"
                  style={{
                    width: `${Math.max(slice.percentage, 2)}%`,
                    backgroundColor: slice.color || undefined,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {activeDays.length > 0 && card.days.length <= 14 && (
        <div className="mt-4 border-black/[0.06] border-t pt-3 dark:border-white/[0.08]">
          <div className="mb-2 flex items-center justify-between text-[10px] text-neutral-400 dark:text-neutral-500">
            <span>Distribuição diária</span>
            <span className="font-mono tabular-nums">
              pico {formatDuration(peak)}
            </span>
          </div>
          <div
            className="grid gap-1.5"
            style={{
              gridTemplateColumns: `repeat(${card.days.length}, minmax(0, 1fr))`,
            }}
          >
            {card.days.map((day) => {
              const ratio = day.minutes > 0 ? day.minutes / peak : 0;
              const barHeightPercent =
                day.minutes > 0 ? Math.max(14, Math.round(ratio * 100)) : 6;

              return (
                <div
                  key={day.date}
                  className="group/day flex flex-col items-center gap-1"
                  title={`${day.weekday} (${day.date}): ${formatDuration(day.minutes)}`}
                >
                  <span className="font-mono text-[9px] text-neutral-400 tabular-nums opacity-80 transition-opacity group-hover/day:text-foreground group-hover/day:opacity-100 dark:text-neutral-500">
                    {day.minutes > 0
                      ? `${Math.round((day.minutes / 60) * 10) / 10}h`
                      : "—"}
                  </span>
                  <div className="flex h-11 w-full items-end rounded-lg bg-neutral-100/90 p-0.5 dark:bg-white/[0.04]">
                    <div
                      className={cn(
                        "w-full rounded-[5px] transition-all duration-300",
                        day.minutes === 0
                          ? "bg-neutral-300/50 dark:bg-neutral-700/40"
                          : day.isWeekend
                            ? "bg-amber-500/75"
                            : "bg-gradient-to-t from-orange-600 to-orange-400",
                      )}
                      style={{ height: `${barHeightPercent}%` }}
                    />
                  </div>
                  <span
                    className={cn(
                      "font-medium text-[9.5px] capitalize",
                      day.minutes > 0
                        ? "text-neutral-600 dark:text-neutral-300"
                        : "text-neutral-400 dark:text-neutral-600",
                    )}
                  >
                    {shortWeekday(day.weekday)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </CardShell>
  );
}

function TimesheetStatus({ card }: { card: TimesheetStatusCard }) {
  const status = STATUS_STYLES[card.status] ?? STATUS_STYLES.open;

  return (
    <CardShell
      icon={<ListChecks className="h-3.5 w-3.5" />}
      title={`Timesheet ${card.period}`}
      subtitle={card.periodLabel}
      badge={
        <span
          className={cn(
            "rounded-full px-2.5 py-0.5 font-semibold text-[10px] uppercase tracking-wide",
            status.className,
          )}
        >
          {status.label}
        </span>
      }
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-bold font-mono text-xl text-foreground tabular-nums">
          {formatDuration(card.totalMinutes)}
        </span>
        <span className="font-mono text-[10.5px] text-neutral-400 tabular-nums dark:text-neutral-500">
          meta {formatDuration(card.targetMinutes)}
        </span>
      </div>

      <ProgressBar
        value={card.totalMinutes}
        target={card.targetMinutes}
        className="mt-2"
      />

      {card.rejectionReason && (
        <p className="mt-3 flex gap-1.5 rounded-xl bg-red-500/10 px-2.5 py-2 text-[11px] text-red-600 ring-1 ring-red-500/20 dark:text-red-400">
          <AlertTriangle
            className="mt-0.5 h-3.5 w-3.5 shrink-0"
            aria-hidden="true"
          />
          <span>{card.rejectionReason}</span>
        </p>
      )}

      {card.incompleteDays.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1.5 font-medium text-[10px] text-neutral-500 uppercase tracking-wide dark:text-neutral-400">
            Dias abaixo da meta
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {card.incompleteDays.map((day) => (
              <li
                key={day.date}
                className="rounded-lg bg-amber-500/10 px-2 py-0.5 font-medium text-[10px] text-amber-700 capitalize ring-1 ring-amber-500/20 dark:text-amber-300"
              >
                {day.weekday} · {formatDuration(day.minutes)}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-3 flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Todos os dias úteis estão completos.
        </p>
      )}
    </CardShell>
  );
}

function EntriesList({ card }: { card: EntriesListCard }) {
  if (card.entries.length === 0) {
    return (
      <CardShell
        icon={<CalendarDays className="h-3.5 w-3.5" />}
        title={card.title}
      >
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Nenhum lançamento encontrado neste período.
        </p>
      </CardShell>
    );
  }

  return (
    <CardShell
      icon={<CalendarDays className="h-3.5 w-3.5" />}
      title={card.title}
      subtitle={`${card.entries.length} lançamento(s)`}
    >
      <ul className="divide-y divide-black/[0.06] dark:divide-white/[0.06]">
        {card.entries.map((entry) => (
          <li
            key={entry.id}
            className="flex items-start gap-2.5 py-2 first:pt-0 last:pb-0"
          >
            <span
              className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-orange-500"
              style={
                entry.projectColor
                  ? { backgroundColor: entry.projectColor }
                  : undefined
              }
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-[11.5px] text-foreground">
                {entry.description}
              </p>
              <p className="text-[10px] text-neutral-500 dark:text-neutral-400">
                {entry.projectName} · {entry.date}
                {entry.azureWorkItemId ? ` · #${entry.azureWorkItemId}` : ""}
              </p>
            </div>
            <span className="shrink-0 rounded-md bg-neutral-100 px-1.5 py-0.5 font-mono font-semibold text-[11px] text-foreground tabular-nums dark:bg-white/[0.06]">
              {formatDuration(entry.minutes)}
            </span>
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function Approvals({ card }: { card: ApprovalsCard }) {
  return (
    <CardShell
      icon={<Inbox className="h-3.5 w-3.5" />}
      title="Aprovações pendentes"
      subtitle={`${card.items.length} timesheet(s)`}
    >
      {card.items.length === 0 ? (
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Nada pendente. Fila zerada!
        </p>
      ) : (
        <ul className="space-y-1.5">
          {card.items.map((item) => (
            <li
              key={item.id}
              className="flex items-center justify-between gap-2 rounded-lg bg-neutral-50 px-2.5 py-1.5 text-[11px] dark:bg-white/[0.03]"
            >
              <span className="min-w-0 truncate font-medium text-foreground">
                {item.userName}
              </span>
              <span className="shrink-0 text-neutral-500 dark:text-neutral-400">
                {item.period} ·{" "}
                <span className="font-mono font-semibold text-foreground tabular-nums">
                  {formatDuration(item.totalMinutes)}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

function TeamOverview({ card }: { card: TeamOverviewCard }) {
  const peak = Math.max(1, ...card.members.map((member) => member.minutes));

  return (
    <CardShell
      icon={<Users className="h-3.5 w-3.5" />}
      title="Horas da equipe"
      subtitle={card.periodLabel}
    >
      {card.members.length === 0 ? (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Nenhum colaborador no seu escopo.
        </p>
      ) : (
        <ul className="space-y-2">
          {card.members.slice(0, 12).map((member) => {
            const ratio =
              member.targetMinutes > 0
                ? member.minutes / member.targetMinutes
                : 0;

            return (
              <li key={member.userId}>
                <div className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="min-w-0 truncate font-medium text-foreground">
                    {member.name}
                  </span>
                  <span className="shrink-0 font-mono text-neutral-500 tabular-nums dark:text-neutral-400">
                    {formatDuration(member.minutes)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                  <div
                    className={cn(
                      "h-full rounded-full transition-all duration-500",
                      ratio >= 0.9
                        ? "bg-emerald-500"
                        : ratio >= 0.6
                          ? "bg-amber-500"
                          : "bg-red-500",
                    )}
                    style={{
                      width: `${Math.max(2, Math.round((member.minutes / peak) * 100))}%`,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </CardShell>
  );
}

function TimerState({ card }: { card: TimerCard }) {
  return (
    <CardShell
      icon={<Timer className="h-3.5 w-3.5" />}
      title={card.running ? "Timer em andamento" : "Nenhum timer ativo"}
    >
      {card.running ? (
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-semibold text-foreground text-xs">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-orange-500"
                style={
                  card.projectColor
                    ? { backgroundColor: card.projectColor }
                    : undefined
                }
                aria-hidden="true"
              />
              {card.projectName ?? "Projeto"}
            </p>
            {card.description && (
              <p className="truncate text-[10.5px] text-neutral-500 dark:text-neutral-400">
                {card.description}
              </p>
            )}
          </div>
          <span
            className={cn(
              "shrink-0 font-bold font-mono text-lg tabular-nums",
              card.paused
                ? "text-amber-600 dark:text-amber-400"
                : "text-orange-600 dark:text-orange-400",
            )}
          >
            {formatDuration(card.elapsedMinutes)}
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Inicie um cronômetro pela sidebar ou peça aqui: “começar timer no
          projeto X”.
        </p>
      )}
    </CardShell>
  );
}

function Projects({ card }: { card: ProjectsCard }) {
  return (
    <CardShell
      icon={<FolderKanban className="h-3.5 w-3.5" />}
      title="Seus projetos"
      subtitle={`${card.projects.length} ativo(s)`}
    >
      <ul className="space-y-1.5">
        {card.projects.slice(0, 10).map((item) => (
          <li
            key={item.id}
            className="flex items-center justify-between gap-2 text-[11px]"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-orange-500"
                style={item.color ? { backgroundColor: item.color } : undefined}
                aria-hidden="true"
              />
              <span className="truncate font-medium text-foreground">
                {item.name}
              </span>
              <span className="shrink-0 font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                {item.code}
              </span>
            </span>
            {item.minutesLast30Days > 0 && (
              <span className="shrink-0 font-mono text-[10px] text-neutral-500 tabular-nums dark:text-neutral-400">
                {formatDuration(item.minutesLast30Days)}
              </span>
            )}
          </li>
        ))}
      </ul>
    </CardShell>
  );
}

function WorkItems({ card }: { card: WorkItemsCard }) {
  return (
    <CardShell
      icon={<ExternalLink className="h-3.5 w-3.5" />}
      title="Work items"
      subtitle={`Busca: “${card.query}”`}
    >
      {card.items.length === 0 ? (
        <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
          Nenhum work item encontrado.
        </p>
      ) : (
        <ul className="space-y-1.5">
          {card.items.map((item) => (
            <li key={item.id} className="text-[11px]">
              <a
                href={item.url ?? "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-1.5 rounded-lg px-2 py-1 transition-colors hover:bg-orange-500/10"
              >
                <span className="shrink-0 font-mono text-orange-600 dark:text-orange-400">
                  #{item.id}
                </span>
                <span className="min-w-0 flex-1 truncate text-foreground">
                  {item.title}
                </span>
                <span className="shrink-0 text-[10px] text-neutral-500 dark:text-neutral-400">
                  {item.state}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </CardShell>
  );
}

export interface AssistantCardViewProps {
  card: AssistantCard;
}

export function AssistantCardView({ card }: AssistantCardViewProps) {
  switch (card.kind) {
    case "work_summary":
      return <WorkSummary card={card} />;
    case "timesheet_status":
      return <TimesheetStatus card={card} />;
    case "entries_list":
      return <EntriesList card={card} />;
    case "approvals":
      return <Approvals card={card} />;
    case "team_overview":
      return <TeamOverview card={card} />;
    case "timer":
      return <TimerState card={card} />;
    case "projects":
      return <Projects card={card} />;
    case "work_items":
      return <WorkItems card={card} />;
    default:
      return null;
  }
}
