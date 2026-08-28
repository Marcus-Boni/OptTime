"use client";

import {
  eachDayOfInterval,
  endOfISOWeek,
  format,
  isWeekend,
  startOfISOWeek,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";
import type {
  TeamHourEntry,
  TeamHoursCollaborator,
  TeamHoursProjectGroup,
} from "@/types/team-hours";

type BoardView = "weekly" | "projects";

/**
 * A day column lives inside a band rather than at a fixed height.
 *
 * The floor keeps the board generous even on a short notebook screen and when
 * the week is light. Between floor and ceiling the columns take the height the
 * busiest day of the week actually needs — and follow the collaborator rail
 * when it sits beside them and is taller. The ceiling is what stops a single
 * heavy day from stretching the card down the page: past it, the day scrolls
 * inside its own column, which is the whole point of a board.
 */
export const DAY_COLUMN_MIN_HEIGHT = "clamp(320px, 52vh, 480px)";
export const DAY_COLUMN_MAX_HEIGHT = "clamp(420px, 64vh, 640px)";

/**
 * Narrowest a day column may get before the board starts scrolling instead of
 * squeezing. Below this the project name and duration stop being readable.
 */
const MIN_DAY_COLUMN_WIDTH = 132;

function EntryChip({
  entry,
  onSelect,
}: {
  entry: TeamHourEntry;
  onSelect: (entry: TeamHourEntry) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(entry)}
      className="w-full rounded-lg border border-border/50 bg-card/60 p-2 text-left transition-colors hover:border-brand-500/30 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none @[150px]/day:p-2.5"
    >
      {/* Below ~150px of column width the duration cannot share a line with the
          project name without both truncating, so it drops underneath. */}
      <div className="flex flex-col gap-0.5 @[150px]/day:flex-row @[150px]/day:items-start @[150px]/day:justify-between @[150px]/day:gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: entry.project.color }}
          />
          <p className="truncate text-xs font-medium text-foreground">
            {entry.project.name}
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs font-semibold tabular-nums text-muted-foreground">
          {formatDuration(entry.duration)}
        </span>
      </div>
      <p className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground @[150px]/day:mt-1.5 @[150px]/day:leading-relaxed @[190px]/day:line-clamp-3">
        {entry.description || "Sem descrição"}
      </p>
    </button>
  );
}

interface WeeklyBoardProps {
  weekStart: string | null;
  entries: TeamHourEntry[];
  showWeekends: boolean;
  onSelectEntry: (entry: TeamHourEntry) => void;
}

function WeeklyBoard({
  weekStart,
  entries,
  showWeekends,
  onSelectEntry,
}: WeeklyBoardProps) {
  const days = useMemo(() => {
    if (!weekStart) return [];
    const start = parseLocalDate(weekStart);

    return eachDayOfInterval({ start, end: endOfISOWeek(start) }).filter(
      (day) => showWeekends || !isWeekend(day),
    );
  }, [showWeekends, weekStart]);

  const byDay = useMemo(() => {
    const map = new Map<string, TeamHourEntry[]>();
    if (!weekStart) return map;

    for (const entry of entries) {
      const key = format(
        startOfISOWeek(parseLocalDate(entry.date)),
        "yyyy-MM-dd",
      );
      if (key !== weekStart) continue;

      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }

    return map;
  }, [entries, weekStart]);

  if (days.length === 0) {
    return <EmptyBoard message="Nenhuma semana disponível no período." />;
  }

  return (
    // `-mx-1 px-1` keeps focus rings from being clipped by the scroll container.
    <div className="-mx-1 min-h-0 flex-1 overflow-x-auto px-1 pb-1">
      <motion.div
        layout
        className="grid h-full gap-2"
        style={{
          // Columns share whatever width there is and only fall back to
          // scrolling once they would drop under MIN_DAY_COLUMN_WIDTH.
          gridTemplateColumns: `repeat(${days.length}, minmax(${MIN_DAY_COLUMN_WIDTH}px, 1fr))`,
          minWidth: days.length * MIN_DAY_COLUMN_WIDTH,
        }}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const dayEntries = byDay.get(key) ?? [];
            const dayTotal = dayEntries.reduce(
              (sum, entry) => sum + entry.duration,
              0,
            );
            const isRestDay = isWeekend(day);

            return (
              <motion.div
                key={key}
                layout
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                className={cn(
                  "@container/day flex flex-col rounded-xl border border-border/60",
                  isRestDay ? "bg-muted/25" : "bg-card/40",
                )}
                style={{
                  minHeight: DAY_COLUMN_MIN_HEIGHT,
                  maxHeight: DAY_COLUMN_MAX_HEIGHT,
                }}
              >
                <div className="flex items-baseline justify-between gap-1.5 border-b border-border/50 px-2.5 py-2 @[150px]/day:px-3 @[150px]/day:py-2.5">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {format(day, "EEE", { locale: ptBR })}
                    </p>
                    {/* The month only earns its space once the column is wide. */}
                    <p className="font-display text-base font-semibold leading-tight text-foreground">
                      <span className="@[150px]/day:hidden">
                        {format(day, "d")}
                      </span>
                      <span className="hidden @[150px]/day:inline">
                        {format(day, "d MMM", { locale: ptBR })}
                      </span>
                    </p>
                  </div>
                  <p
                    className={cn(
                      "shrink-0 font-mono text-sm font-semibold tabular-nums",
                      dayTotal > 0
                        ? "text-foreground"
                        : "text-muted-foreground/60",
                    )}
                  >
                    {dayTotal > 0 ? formatDuration(dayTotal) : "—"}
                  </p>
                </div>

                <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-1.5 @[150px]/day:space-y-2 @[150px]/day:p-2">
                  {dayEntries.length > 0 ? (
                    dayEntries.map((entry) => (
                      <EntryChip
                        key={entry.id}
                        entry={entry}
                        onSelect={onSelectEntry}
                      />
                    ))
                  ) : (
                    <p className="flex h-full items-center justify-center px-2 text-center text-xs text-muted-foreground/70">
                      Sem registros
                    </p>
                  )}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

interface ProjectBreakdownProps {
  groups: TeamHoursProjectGroup[];
  totalMinutes: number;
  onSelectEntry: (entry: TeamHourEntry) => void;
}

function ProjectBreakdown({
  groups,
  totalMinutes,
  onSelectEntry,
}: ProjectBreakdownProps) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (groups.length === 0) {
    return <EmptyBoard message="Nenhum registro por projeto no período." />;
  }

  return (
    <div className="min-h-0 flex-1 space-y-2 overflow-y-auto">
      {groups.map((group) => {
        const isExpanded = expanded[group.project.id] === true;
        const share =
          totalMinutes > 0
            ? Math.round((group.totalMinutes / totalMinutes) * 100)
            : 0;

        return (
          <div
            key={group.project.id}
            className="overflow-hidden rounded-xl border border-border/60 bg-card/40 transition-colors hover:border-brand-500/25"
          >
            <button
              type="button"
              onClick={() =>
                setExpanded((current) => ({
                  ...current,
                  [group.project.id]: !current[group.project.id],
                }))
              }
              aria-expanded={isExpanded}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: group.project.color }}
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-foreground">
                  {group.project.name}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {group.project.clientName || "Cliente interno"} ·{" "}
                  {group.entries.length} registros
                </p>
              </div>

              <div className="hidden w-24 shrink-0 sm:block">
                <div
                  className="h-1 w-full overflow-hidden rounded-full bg-muted"
                  aria-hidden="true"
                >
                  <div
                    className="h-full rounded-full bg-brand-500"
                    style={{ width: `${Math.max(2, share)}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-muted-foreground tabular-nums">
                  {share}%
                </p>
              </div>

              <span className="shrink-0 font-mono text-sm font-semibold tabular-nums text-foreground">
                {formatDuration(group.totalMinutes)}
              </span>

              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  isExpanded && "rotate-180",
                )}
              />
            </button>

            <AnimatePresence initial={false}>
              {isExpanded ? (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.22, ease: "easeInOut" }}
                  className="overflow-hidden border-t border-border/50"
                >
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="h-8 w-[110px] text-xs">
                            Data
                          </TableHead>
                          <TableHead className="h-8 text-xs">
                            Descrição
                          </TableHead>
                          <TableHead className="h-8 w-[110px] text-right text-xs">
                            Duração
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {group.entries.map((entry) => (
                          <TableRow
                            key={entry.id}
                            onClick={() => onSelectEntry(entry)}
                            className="cursor-pointer border-border/40"
                          >
                            <TableCell className="py-2 text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                              {format(parseLocalDate(entry.date), "dd/MM/yyyy")}
                            </TableCell>
                            <TableCell className="max-w-md truncate py-2 text-xs text-foreground">
                              {entry.description || "Sem descrição"}
                            </TableCell>
                            <TableCell className="py-2 text-right font-mono text-xs font-semibold tabular-nums">
                              {formatDuration(entry.duration)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

function EmptyBoard({ message }: { message: string }) {
  return (
    <div
      className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center"
      style={{ minHeight: DAY_COLUMN_MIN_HEIGHT }}
    >
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}

export interface CollaboratorBoardProps {
  collaborator: TeamHoursCollaborator | null;
  entries: TeamHourEntry[];
  weeks: string[];
  loading: boolean;
  truncated: boolean;
  showWeekends: boolean;
  onShowWeekendsChange: (show: boolean) => void;
  onSelectEntry: (entry: TeamHourEntry) => void;
}

/**
 * Detail panel for the selected collaborator: a week board for reading the
 * rhythm of the work, and a project rollup for reading where it went.
 */
export function CollaboratorBoard({
  collaborator,
  entries,
  weeks,
  loading,
  truncated,
  showWeekends,
  onShowWeekendsChange,
  onSelectEntry,
}: CollaboratorBoardProps) {
  const [view, setView] = useState<BoardView>("weekly");
  const [weekStart, setWeekStart] = useState<string | null>(null);

  // The requested week may vanish when filters change; fall back to the newest.
  const activeWeek =
    weekStart && weeks.includes(weekStart) ? weekStart : (weeks[0] ?? null);
  const weekIndex = activeWeek ? weeks.indexOf(activeWeek) : -1;

  const projectGroups = useMemo<TeamHoursProjectGroup[]>(() => {
    const groups = new Map<string, TeamHoursProjectGroup>();

    for (const entry of entries) {
      const current = groups.get(entry.project.id) ?? {
        project: entry.project,
        entries: [],
        totalMinutes: 0,
        billableMinutes: 0,
      };

      current.entries.push(entry);
      current.totalMinutes += entry.duration;
      if (entry.billable) current.billableMinutes += entry.duration;
      groups.set(entry.project.id, current);
    }

    return Array.from(groups.values()).sort(
      (a, b) => b.totalMinutes - a.totalMinutes,
    );
  }, [entries]);

  const weekSummary = useMemo(() => {
    if (!activeWeek) return { totalMinutes: 0, entryCount: 0 };

    let totalMinutes = 0;
    let entryCount = 0;

    for (const entry of entries) {
      const key = format(
        startOfISOWeek(parseLocalDate(entry.date)),
        "yyyy-MM-dd",
      );
      if (key !== activeWeek) continue;

      totalMinutes += entry.duration;
      entryCount += 1;
    }

    return { totalMinutes, entryCount };
  }, [activeWeek, entries]);

  const weekLabel = activeWeek
    ? `${format(parseLocalDate(activeWeek), "d MMM", { locale: ptBR })} – ${format(
        endOfISOWeek(parseLocalDate(activeWeek)),
        "d MMM yyyy",
        { locale: ptBR },
      )}`
    : "Sem semanas no período";

  if (!collaborator) {
    return (
      <div className="flex min-h-[320px] items-center justify-center px-6 text-center">
        <p className="text-sm text-muted-foreground">
          Selecione um colaborador para ver a semana e os projetos.
        </p>
      </div>
    );
  }

  return (
    <div className="@container/board flex h-full flex-col">
      <header className="flex flex-col gap-3 border-b border-border/60 px-4 py-3 @[820px]/board:flex-row @[820px]/board:items-center @[820px]/board:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <UserAvatar
            name={collaborator.user.name}
            image={collaborator.user.image}
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">
              {collaborator.user.name}
            </p>
            <p className="truncate text-xs text-muted-foreground">
              {formatDuration(collaborator.totalMinutes)} ·{" "}
              {collaborator.projectsCount} projetos ·{" "}
              {collaborator.billableRate}% faturável
            </p>
          </div>
        </div>

        <fieldset className="flex shrink-0 items-center gap-1 rounded-lg border border-border/60 bg-card/60 p-1">
          <legend className="sr-only">
            Modo de visualização do colaborador
          </legend>
          {(
            [
              { id: "weekly", label: "Semana" },
              { id: "projects", label: "Projetos" },
            ] as const
          ).map((option) => (
            <Button
              key={option.id}
              type="button"
              variant="ghost"
              size="sm"
              aria-pressed={view === option.id}
              onClick={() => setView(option.id)}
              className={cn(
                "h-7 rounded-md px-3 text-xs font-medium",
                view === option.id
                  ? "bg-brand-500/12 text-brand-500 hover:bg-brand-500/15 hover:text-brand-500"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </Button>
          ))}
        </fieldset>
      </header>

      {view === "weekly" ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Semana anterior"
              className="size-7 rounded-md"
              disabled={weekIndex < 0 || weekIndex >= weeks.length - 1}
              onClick={() => setWeekStart(weeks[weekIndex + 1] ?? null)}
            >
              <ChevronLeft className="size-3.5" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label="Próxima semana"
              className="size-7 rounded-md"
              disabled={weekIndex <= 0}
              onClick={() => setWeekStart(weeks[weekIndex - 1] ?? null)}
            >
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
            <p className="ml-1 text-sm font-medium text-foreground">
              {weekLabel}
            </p>
            <Badge
              variant="outline"
              className="ml-1 rounded-md border-border/60 font-mono text-xs tabular-nums"
            >
              {formatDuration(weekSummary.totalMinutes)}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {weekSummary.entryCount} registros
            </span>
          </div>

          <div className="flex items-center gap-2">
            <label
              htmlFor="team-hours-weekends"
              className="text-xs text-muted-foreground"
            >
              Fins de semana
            </label>
            <Switch
              id="team-hours-weekends"
              checked={showWeekends}
              onCheckedChange={onShowWeekendsChange}
            />
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 px-4 py-2.5">
          <p className="text-sm font-medium text-foreground">
            {projectGroups.length} projetos no período
          </p>
          <Badge
            variant="outline"
            className="rounded-md border-border/60 font-mono text-xs tabular-nums"
          >
            {formatDuration(collaborator.totalMinutes)}
          </Badge>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col p-3 @[1000px]/board:p-4">
        {truncated ? (
          <p className="mb-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600 dark:text-amber-400">
            Período muito longo: exibindo os registros mais recentes. Estreite
            as datas para ver o histórico completo.
          </p>
        ) : null}

        {loading ? (
          <output
            aria-label="Carregando registros do colaborador"
            className="flex min-h-0 flex-1"
          >
            <Skeleton
              className="w-full rounded-xl"
              style={{ minHeight: DAY_COLUMN_MIN_HEIGHT }}
            />
          </output>
        ) : view === "weekly" ? (
          <WeeklyBoard
            weekStart={activeWeek}
            entries={entries}
            showWeekends={showWeekends}
            onSelectEntry={onSelectEntry}
          />
        ) : (
          <ProjectBreakdown
            groups={projectGroups}
            totalMinutes={collaborator.totalMinutes}
            onSelectEntry={onSelectEntry}
          />
        )}
      </div>
    </div>
  );
}
