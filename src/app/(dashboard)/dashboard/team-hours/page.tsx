"use client";

import {
  eachDayOfInterval,
  endOfISOWeek,
  format,
  isWeekend,
  startOfISOWeek,
  subDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion } from "framer-motion";
import {
  BriefcaseBusiness,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  FilterX,
  Search,
  Users,
} from "lucide-react";
import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type {
  TeamHourEntry,
  TeamHourProject,
  TeamHourUser,
} from "@/hooks/use-team-hours";
import { useTeamHours } from "@/hooks/use-team-hours";
import { useUserTimePreferences } from "@/hooks/use-user-time-preferences";
import { cn, formatDuration, parseLocalDate } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const ITEMS_PER_PAGE = 15;
const QUICK_RANGES = [
  { label: "Todo período", days: null },
  { label: "7 dias", days: 7 },
  { label: "30 dias", days: 30 },
  { label: "90 dias", days: 90 },
] as const;

type SortOption = "newest" | "oldest" | "longest";

interface UserInsight {
  user: TeamHourUser;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
  projectsCount: number;
  latestDate: string | null;
  latestProjectName: string | null;
}

function SummaryCard({
  icon,
  title,
  value,
  detail,
  iconColor,
}: {
  icon: React.ReactNode;
  title: string;
  value: string;
  detail: string;
  iconColor: string;
}) {
  return (
    <Card className="border-border/50 bg-card/50 shadow-sm transition-colors hover:bg-card/80">
      <CardContent className="p-6">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "flex h-12 w-12 items-center justify-center rounded-xl",
              iconColor,
            )}
          >
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {title}
            </p>
            <p className="font-display text-2xl font-bold text-foreground">
              {value}
            </p>
            <p className="truncate text-xs text-muted-foreground">{detail}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function UserCard({
  insight,
  isActive,
  onSelect,
}: {
  insight: UserInsight;
  isActive: boolean;
  onSelect: () => void;
}) {
  const billableRate =
    insight.totalMinutes > 0
      ? Math.round((insight.billableMinutes / insight.totalMinutes) * 100)
      : 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isActive}
      className={cn(
        "w-full rounded-2xl border px-4 py-3 text-left transition-all",
        isActive
          ? "border-brand-500/40 bg-brand-500/5 shadow-sm ring-1 ring-brand-500/20"
          : "border-border/60 bg-background/70 hover:border-brand-500/25 hover:bg-muted/30",
      )}
    >
      <div className="flex items-start gap-3">
        <UserAvatar
          name={insight.user.name}
          image={insight.user.image}
          size="sm"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {insight.user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {insight.user.email}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <Badge
                variant="outline"
                className="rounded-full border-border/60 bg-background/70 text-[10px]"
              >
                {insight.entryCount} registros
              </Badge>
              <Badge
                variant="outline"
                className="rounded-full border-border/60 bg-background/70 text-[10px]"
              >
                {insight.projectsCount} projetos
              </Badge>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] text-brand-500">
              {formatDuration(insight.totalMinutes)}
            </Badge>
            <Badge
              variant="outline"
              className="rounded-full border-border/60 px-2.5 py-1 text-[10px]"
            >
              {billableRate}% faturável
            </Badge>
            {insight.latestDate ? (
              <span className="text-[11px] text-muted-foreground">
                Último registro em{" "}
                <span className="font-medium text-foreground">
                  {format(parseLocalDate(insight.latestDate), "dd/MM/yyyy")}
                </span>
              </span>
            ) : null}
          </div>

          {insight.latestProjectName ? (
            <p className="mt-2 truncate text-[11px] text-muted-foreground">
              Projeto recente: {insight.latestProjectName}
            </p>
          ) : null}
        </div>
      </div>
    </button>
  );
}

function WeekEntryCard({
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
      className="w-full rounded-xl border border-border/50 bg-background/85 p-3 text-left transition-all hover:border-brand-500/30 hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.project.color }}
            />
            <p className="truncate text-[11px] font-semibold text-foreground">
              {entry.project.name}
            </p>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {entry.project.clientName || "Interno"}
          </p>
        </div>

        <Badge
          variant="outline"
          className={cn(
            "rounded-full border-border/60 bg-background/70 text-[10px]",
            entry.billable && "border-emerald-500/30 text-emerald-600",
          )}
        >
          {formatDuration(entry.duration)}
        </Badge>
      </div>

      <p className="mt-3 line-clamp-3 text-sm leading-5 text-muted-foreground">
        {entry.description || "Sem descrição"}
      </p>
    </button>
  );
}

function DescriptionCell({ description }: { description: string }) {
  const content = description.trim() || "Sem descrição";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="w-full rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <p className="line-clamp-2 text-sm leading-5 text-muted-foreground">
            {content}
          </p>
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm whitespace-pre-wrap break-words text-sm leading-5">
        {content}
      </TooltipContent>
    </Tooltip>
  );
}

function getQuickRangeDates(days: number) {
  const end = new Date();
  const start = subDays(end, days - 1);
  return { start, end };
}

export default function TeamHoursPage() {
  const { preferences, updatePreferences } = useUserTimePreferences();
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [page, setPage] = useState(0);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedWeekStart, setSelectedWeekStart] = useState<string | null>(
    null,
  );
  const [selectedEntry, setSelectedEntry] = useState<TeamHourEntry | null>(
    null,
  );
  const [showWeekends, setShowWeekends] = useState(preferences.showWeekends);
  const resetPagination = () => setPage(0);

  useEffect(() => {
    setShowWeekends(preferences.showWeekends);
  }, [preferences.showWeekends]);

  const deferredSearch = useDeferredValue(search);
  const fromStr = fromDate ? format(fromDate, "yyyy-MM-dd") : undefined;
  const toStr = toDate ? format(toDate, "yyyy-MM-dd") : undefined;

  const { entries, loading, error } = useTeamHours({
    from: fromStr,
    to: toStr,
    userId: userFilter,
    projectId: projectFilter,
  });

  const uniqueUsers = useMemo<TeamHourUser[]>(() => {
    const usersMap = new Map<string, TeamHourUser>();
    for (const entry of entries) {
      if (!usersMap.has(entry.user.id)) {
        usersMap.set(entry.user.id, entry.user);
      }
    }
    return Array.from(usersMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [entries]);

  const uniqueProjects = useMemo<TeamHourProject[]>(() => {
    const projectsMap = new Map<string, TeamHourProject>();
    for (const entry of entries) {
      if (!projectsMap.has(entry.project.id)) {
        projectsMap.set(entry.project.id, entry.project);
      }
    }
    return Array.from(projectsMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  }, [entries]);

  const filteredEntries = useMemo(() => {
    const normalizedSearch = deferredSearch.trim().toLowerCase();

    let result = entries.filter((entry) => {
      if (!normalizedSearch) {
        return true;
      }

      const searchText = [
        entry.description,
        entry.user.name,
        entry.user.email,
        entry.project.name,
        entry.project.clientName,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchText.includes(normalizedSearch);
    });

    result = [...result].sort((a, b) => {
      const dateA = parseLocalDate(a.date).getTime();
      const dateB = parseLocalDate(b.date).getTime();

      if (sortBy === "oldest") return dateA - dateB;
      if (sortBy === "longest" && b.duration !== a.duration) {
        return b.duration - a.duration;
      }
      if (dateB !== dateA) return dateB - dateA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [deferredSearch, entries, sortBy]);

  const { userInsights, userEntriesMap } = useMemo(() => {
    const aggregates = new Map<
      string,
      {
        user: TeamHourUser;
        totalMinutes: number;
        billableMinutes: number;
        entryCount: number;
        latestDate: string | null;
        latestProjectName: string | null;
        projects: Set<string>;
      }
    >();
    const entriesMap = new Map<string, TeamHourEntry[]>();

    for (const entry of filteredEntries) {
      const current = aggregates.get(entry.user.id) ?? {
        user: entry.user,
        totalMinutes: 0,
        billableMinutes: 0,
        entryCount: 0,
        latestDate: null,
        latestProjectName: null,
        projects: new Set<string>(),
      };

      current.totalMinutes += entry.duration;
      current.entryCount += 1;
      current.projects.add(entry.project.id);
      if (entry.billable) {
        current.billableMinutes += entry.duration;
      }
      if (
        !current.latestDate ||
        parseLocalDate(entry.date).getTime() >
          parseLocalDate(current.latestDate).getTime()
      ) {
        current.latestDate = entry.date;
        current.latestProjectName = entry.project.name;
      }

      aggregates.set(entry.user.id, current);

      const bucket = entriesMap.get(entry.user.id) ?? [];
      bucket.push(entry);
      entriesMap.set(entry.user.id, bucket);
    }

    const insights = Array.from(aggregates.values())
      .map<UserInsight>((item) => ({
        user: item.user,
        totalMinutes: item.totalMinutes,
        billableMinutes: item.billableMinutes,
        entryCount: item.entryCount,
        projectsCount: item.projects.size,
        latestDate: item.latestDate,
        latestProjectName: item.latestProjectName,
      }))
      .sort((a, b) => {
        if (b.totalMinutes !== a.totalMinutes) {
          return b.totalMinutes - a.totalMinutes;
        }

        const latestA = a.latestDate
          ? parseLocalDate(a.latestDate).getTime()
          : 0;
        const latestB = b.latestDate
          ? parseLocalDate(b.latestDate).getTime()
          : 0;

        if (latestB !== latestA) {
          return latestB - latestA;
        }

        return a.user.name.localeCompare(b.user.name);
      });

    return { userInsights: insights, userEntriesMap: entriesMap };
  }, [filteredEntries]);

  useEffect(() => {
    if (userInsights.length === 0) {
      setSelectedUserId(null);
      return;
    }

    if (userFilter !== "all") {
      setSelectedUserId(userFilter);
      return;
    }

    if (
      !selectedUserId ||
      !userInsights.some((insight) => insight.user.id === selectedUserId)
    ) {
      setSelectedUserId(userInsights[0]?.user.id ?? null);
    }
  }, [selectedUserId, userFilter, userInsights]);

  const selectedUserEntries = useMemo(
    () => (selectedUserId ? (userEntriesMap.get(selectedUserId) ?? []) : []),
    [selectedUserId, userEntriesMap],
  );

  const selectedUserInsight = useMemo(
    () =>
      userInsights.find((insight) => insight.user.id === selectedUserId) ??
      null,
    [selectedUserId, userInsights],
  );

  const availableWeeks = useMemo(() => {
    const weeks = new Set<string>();

    for (const entry of selectedUserEntries) {
      weeks.add(
        format(startOfISOWeek(parseLocalDate(entry.date)), "yyyy-MM-dd"),
      );
    }

    return Array.from(weeks).sort((a, b) => b.localeCompare(a));
  }, [selectedUserEntries]);

  useEffect(() => {
    if (availableWeeks.length === 0) {
      setSelectedWeekStart(null);
      return;
    }

    if (!selectedWeekStart || !availableWeeks.includes(selectedWeekStart)) {
      setSelectedWeekStart(availableWeeks[0]);
    }
  }, [availableWeeks, selectedWeekStart]);

  useEffect(() => {
    if (!selectedEntry) {
      return;
    }

    const entryStillVisible = filteredEntries.some(
      (entry) => entry.id === selectedEntry.id,
    );

    if (!entryStillVisible) {
      setSelectedEntry(null);
    }
  }, [filteredEntries, selectedEntry]);

  const selectedWeekStartDate = selectedWeekStart
    ? parseLocalDate(selectedWeekStart)
    : null;
  const selectedWeekEndDate = selectedWeekStartDate
    ? endOfISOWeek(selectedWeekStartDate)
    : null;

  const weekDays = useMemo(
    () =>
      selectedWeekStartDate && selectedWeekEndDate
        ? eachDayOfInterval({
            start: selectedWeekStartDate,
            end: selectedWeekEndDate,
          }).filter((d) => showWeekends || !isWeekend(d))
        : [],
    [selectedWeekEndDate, selectedWeekStartDate, showWeekends],
  );

  const weekEntriesMap = useMemo(() => {
    const map = new Map<string, TeamHourEntry[]>();

    if (!selectedWeekStartDate) {
      return map;
    }

    for (const entry of selectedUserEntries) {
      const weekKey = format(
        startOfISOWeek(parseLocalDate(entry.date)),
        "yyyy-MM-dd",
      );

      if (weekKey !== selectedWeekStart) {
        continue;
      }

      const bucket = map.get(entry.date) ?? [];
      bucket.push(entry);
      map.set(entry.date, bucket);
    }

    return map;
  }, [selectedUserEntries, selectedWeekStart, selectedWeekStartDate]);

  const selectedWeekSummary = useMemo(() => {
    let totalMinutes = 0;
    let billableMinutes = 0;
    let entryCount = 0;
    const projects = new Set<string>();

    for (const dayEntries of weekEntriesMap.values()) {
      for (const entry of dayEntries) {
        totalMinutes += entry.duration;
        entryCount += 1;
        projects.add(entry.project.id);
        if (entry.billable) {
          billableMinutes += entry.duration;
        }
      }
    }

    return {
      totalMinutes,
      billableMinutes,
      entryCount,
      projectsCount: projects.size,
    };
  }, [weekEntriesMap]);

  const summary = useMemo(() => {
    const people = new Set<string>();
    const projects = new Set<string>();
    const byUser = new Map<string, { name: string; minutes: number }>();
    let totalMinutes = 0;
    let billableMinutes = 0;

    for (const entry of filteredEntries) {
      totalMinutes += entry.duration;
      if (entry.billable) billableMinutes += entry.duration;
      people.add(entry.user.id);
      projects.add(entry.project.id);

      const current = byUser.get(entry.user.id);
      if (current) {
        current.minutes += entry.duration;
      } else {
        byUser.set(entry.user.id, {
          name: entry.user.name,
          minutes: entry.duration,
        });
      }
    }

    const topContributor = Array.from(byUser.values()).sort(
      (a, b) => b.minutes - a.minutes,
    )[0];

    return {
      totalMinutes,
      billableMinutes,
      activePeople: people.size,
      activeProjects: projects.size,
      billableRate:
        totalMinutes > 0
          ? Math.round((billableMinutes / totalMinutes) * 100)
          : 0,
      topContributor,
    };
  }, [filteredEntries]);

  const totalPages = Math.max(
    1,
    Math.ceil(filteredEntries.length / ITEMS_PER_PAGE),
  );
  const safePage = Math.min(page, totalPages - 1);
  const paginatedEntries = useMemo(() => {
    const start = safePage * ITEMS_PER_PAGE;
    return filteredEntries.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredEntries, safePage]);

  const activeQuickRange = useMemo(() => {
    if (!fromDate && !toDate) return "all";
    if (!fromDate || !toDate) return null;

    return (
      QUICK_RANGES.find(({ days }) => {
        if (days === null) return false;
        const range = getQuickRangeDates(days);
        return (
          format(range.start, "yyyy-MM-dd") ===
            format(fromDate, "yyyy-MM-dd") &&
          format(range.end, "yyyy-MM-dd") === format(toDate, "yyyy-MM-dd")
        );
      })?.days ?? null
    );
  }, [fromDate, toDate]);

  const periodLabel =
    fromDate && toDate
      ? `${format(fromDate, "dd/MM/yyyy")} - ${format(toDate, "dd/MM/yyyy")}`
      : "Todo o período";

  const selectedWeekIndex = selectedWeekStart
    ? availableWeeks.indexOf(selectedWeekStart)
    : -1;
  const weekLabel =
    selectedWeekStartDate && selectedWeekEndDate
      ? `${format(selectedWeekStartDate, "d MMM", { locale: ptBR })} - ${format(selectedWeekEndDate, "d MMM yyyy", { locale: ptBR })}`
      : "Nenhuma semana disponível";

  return (
    <TooltipProvider>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-8 pb-12"
      >
        <motion.div
          variants={itemVariants}
          className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="font-display text-2xl font-bold text-foreground">
              Horas da Equipe
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Explore a carga de trabalho da equipe com foco por colaborador e
              semana completa.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {QUICK_RANGES.map(({ label, days }) => (
              <Button
                key={label}
                variant={
                  (days === null && activeQuickRange === "all") ||
                  activeQuickRange === days
                    ? "default"
                    : "outline"
                }
                size="sm"
                className="h-8 rounded-full"
                onClick={() => {
                  resetPagination();
                  if (days === null) {
                    setFromDate(undefined);
                    setToDate(undefined);
                  } else {
                    const range = getQuickRangeDates(days);
                    setFromDate(range.start);
                    setToDate(range.end);
                  }
                }}
              >
                {label}
              </Button>
            ))}
          </div>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-border/50 bg-card/50">
            <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
              <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    De
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-10 justify-start border-border/50 bg-background/50 font-normal",
                          !fromDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-brand-500" />
                        {fromDate ? format(fromDate, "dd/MM/yyyy") : "Início"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={fromDate}
                        onSelect={setFromDate}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>

                <div className="flex flex-1 flex-col gap-1.5">
                  <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Até
                  </span>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "h-10 justify-start border-border/50 bg-background/50 font-normal",
                          !toDate && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4 text-brand-500" />
                        {toDate ? format(toDate, "dd/MM/yyyy") : "Fim"}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start">
                      <Calendar
                        mode="single"
                        selected={toDate}
                        onSelect={setToDate}
                        initialFocus
                        locale={ptBR}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>

              <div className="flex min-w-[150px] items-end justify-between gap-4 sm:justify-end">
                <div className="text-right">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80">
                    Período
                  </p>
                  <p className="text-sm font-medium text-foreground">
                    {periodLabel}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-foreground"
                  onClick={() => {
                    resetPagination();
                    setFromDate(undefined);
                    setToDate(undefined);
                  }}
                >
                  <FilterX className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.section
          variants={itemVariants}
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
        >
          <SummaryCard
            title="Tempo Total"
            value={formatDuration(summary.totalMinutes)}
            detail={`${summary.activePeople} pessoas ativas`}
            icon={<Clock className="h-5 w-5" />}
            iconColor="bg-orange-500/10 text-orange-500"
          />
          <SummaryCard
            title="Faturável"
            value={formatDuration(summary.billableMinutes)}
            detail={`${summary.billableRate}% do total`}
            icon={<BriefcaseBusiness className="h-5 w-5" />}
            iconColor="bg-sky-500/10 text-sky-500"
          />
          <SummaryCard
            title="Pessoas"
            value={String(summary.activePeople)}
            detail={
              summary.topContributor
                ? `Top: ${summary.topContributor.name}`
                : "Nenhum no filtro"
            }
            icon={<Users className="h-5 w-5" />}
            iconColor="bg-indigo-500/10 text-indigo-500"
          />
          <SummaryCard
            title="Projetos"
            value={String(summary.activeProjects)}
            detail="Distribuídos no período"
            icon={<BriefcaseBusiness className="h-5 w-5" />}
            iconColor="bg-amber-500/10 text-amber-500"
          />
        </motion.section>

        <motion.section variants={itemVariants}>
          <Card className="border-border/50 bg-card/50">
            <CardHeader className="p-6">
              <div className="space-y-5">
                <div>
                  <CardTitle className="text-xl font-bold">
                    Explorar Registros
                  </CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Priorize a leitura por colaborador e use a tabela apenas
                    quando precisar do detalhe linha a linha.
                  </p>
                </div>

                <div className="space-y-4">
                  <div className="group flex h-14 w-full items-center gap-3 rounded-2xl border border-input bg-transparent px-4 shadow-xs transition-[color,box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50 dark:bg-input/30">
                    <Search className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                    <input
                      placeholder="Buscar colaborador, projeto ou descrição..."
                      value={search}
                      onChange={(event) => {
                        resetPagination();
                        setSearch(event.target.value);
                      }}
                      className="h-full w-full border-none bg-transparent p-0 font-sans text-base outline-none placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground focus:outline-none focus:ring-0"
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-3">
                    <Select
                      value={projectFilter}
                      onValueChange={(value) => {
                        resetPagination();
                        setProjectFilter(value);
                      }}
                    >
                      <SelectTrigger className="h-12 w-full rounded-2xl border-border/50 bg-background/50 px-4 transition-all hover:border-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none">
                        <SelectValue placeholder="Projeto" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos Projetos</SelectItem>
                        {uniqueProjects.map((project) => (
                          <SelectItem key={project.id} value={project.id}>
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={userFilter}
                      onValueChange={(value) => {
                        resetPagination();
                        setUserFilter(value);
                      }}
                    >
                      <SelectTrigger className="h-12 w-full rounded-2xl border-border/50 bg-background/50 px-4 transition-all hover:border-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none">
                        <SelectValue placeholder="Colaborador" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toda Equipe</SelectItem>
                        {uniqueUsers.map((user) => (
                          <SelectItem key={user.id} value={user.id}>
                            {user.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={sortBy}
                      onValueChange={(value) => {
                        resetPagination();
                        setSortBy(value as SortOption);
                      }}
                    >
                      <SelectTrigger className="h-12 w-full rounded-2xl border-border/50 bg-background/50 px-4 transition-all hover:border-orange-500/30 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 focus:outline-none">
                        <SelectValue placeholder="Ordenar" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="newest">Mais Recentes</SelectItem>
                        <SelectItem value="oldest">Mais Antigos</SelectItem>
                        <SelectItem value="longest">Maior Duração</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            </CardHeader>

            <CardContent className="p-0">
              {error ? (
                <div className="p-12 text-center text-sm text-destructive">
                  {error}
                </div>
              ) : loading ? (
                <div className="space-y-6 p-6">
                  <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                    <div className="space-y-3">
                      {[
                        "user-skeleton-1",
                        "user-skeleton-2",
                        "user-skeleton-3",
                      ].map((key) => (
                        <Skeleton
                          key={key}
                          className="h-36 w-full rounded-2xl"
                        />
                      ))}
                    </div>
                    <Skeleton className="h-[420px] w-full rounded-3xl" />
                  </div>
                  <Skeleton className="h-72 w-full rounded-2xl" />
                </div>
              ) : filteredEntries.length === 0 ? (
                <div className="p-20 text-center">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                    <Search className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="mt-4 text-sm font-medium">
                    Nenhum registro encontrado
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Tente ajustar seus filtros para ver mais resultados.
                  </p>
                  <Button
                    variant="link"
                    className="mt-2 h-auto p-0 text-orange-500"
                    onClick={() => {
                      resetPagination();
                      setSearch("");
                      setUserFilter("all");
                      setProjectFilter("all");
                    }}
                  >
                    Limpar todos os filtros
                  </Button>
                </div>
              ) : (
                <Tabs defaultValue="people" className="w-full">
                  <div className="border-t border-border/50 px-6 pt-5">
                    <TabsList className="inline-flex h-auto w-full flex-wrap gap-1 overflow-hidden rounded-2xl border border-border/60 bg-muted/30 p-1 sm:w-auto">
                      <TabsTrigger
                        value="people"
                        className="h-full min-w-[180px] flex-none rounded-xl border-0 px-4 py-2.5 shadow-none after:hidden data-[state=active]:border-0 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
                      >
                        Visão por colaborador
                      </TabsTrigger>
                      <TabsTrigger
                        value="records"
                        className="h-full min-w-[180px] flex-none rounded-xl border-0 px-4 py-2.5 shadow-none after:hidden data-[state=active]:border-0 data-[state=active]:bg-background data-[state=active]:text-foreground data-[state=active]:shadow-none"
                      >
                        Registros detalhados
                      </TabsTrigger>
                    </TabsList>
                  </div>

                  <TabsContent
                    value="people"
                    className="mt-0 space-y-6 p-6 pt-5"
                  >
                    <Card className="border-border/50 bg-background/50">
                      <CardHeader className="pb-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                          <div>
                            <CardTitle className="text-base font-semibold">
                              Colaboradores visíveis
                            </CardTitle>
                            <p className="text-sm text-muted-foreground">
                              Selecione um colaborador para atualizar a semana
                              abaixo.
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className="w-fit rounded-full border-border/60 px-3 py-1.5"
                          >
                            {userInsights.length} colaboradores no filtro
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="max-h-[320px] overflow-y-auto pr-1">
                          <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                            {userInsights.map((insight) => (
                              <UserCard
                                key={insight.user.id}
                                insight={insight}
                                isActive={insight.user.id === selectedUserId}
                                onSelect={() =>
                                  setSelectedUserId(insight.user.id)
                                }
                              />
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-border/50 bg-background/50">
                      <CardHeader className="gap-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                              Semana completa
                            </p>
                            {selectedUserInsight ? (
                              <div className="mt-3 flex items-center gap-3">
                                <UserAvatar
                                  name={selectedUserInsight.user.name}
                                  image={selectedUserInsight.user.image}
                                  size="sm"
                                />
                                <div className="min-w-0">
                                  <CardTitle className="truncate text-xl">
                                    {selectedUserInsight.user.name}
                                  </CardTitle>
                                  <p className="truncate text-sm text-muted-foreground">
                                    {selectedUserInsight.user.email}
                                  </p>
                                </div>
                              </div>
                            ) : (
                              <CardTitle className="mt-3 text-xl">
                                Nenhum colaborador selecionado
                              </CardTitle>
                            )}
                          </div>

                          <div className="flex items-center gap-2 self-start">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full"
                              disabled={
                                selectedWeekIndex === -1 ||
                                selectedWeekIndex >= availableWeeks.length - 1
                              }
                              onClick={() => {
                                if (
                                  selectedWeekIndex >= 0 &&
                                  selectedWeekIndex < availableWeeks.length - 1
                                ) {
                                  setSelectedWeekStart(
                                    availableWeeks[selectedWeekIndex + 1] ??
                                      null,
                                  );
                                }
                              }}
                            >
                              <ChevronLeft className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-9 w-9 rounded-full"
                              disabled={selectedWeekIndex <= 0}
                              onClick={() => {
                                if (selectedWeekIndex > 0) {
                                  setSelectedWeekStart(
                                    availableWeeks[selectedWeekIndex - 1] ??
                                      null,
                                  );
                                }
                              }}
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                          <p className="text-sm text-muted-foreground">
                            {weekLabel}
                          </p>
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2">
                              <span
                                id="team-hours-weekend-toggle-label"
                                className="text-xs text-muted-foreground"
                              >
                                Exibir fins de semana
                              </span>
                              <Switch
                                checked={showWeekends}
                                onCheckedChange={(show) => {
                                  setShowWeekends(show);
                                  void (async () => {
                                    const previousValue = showWeekends;
                                    const success = await updatePreferences(
                                      { timeShowWeekends: show },
                                      {
                                        errorMessage:
                                          "Nao foi possivel salvar a exibicao de fins de semana.",
                                      },
                                    );

                                    if (!success) {
                                      setShowWeekends(previousValue);
                                    }
                                  })();
                                }}
                                aria-label="Exibir fins de semana na visão de semana"
                                aria-labelledby="team-hours-weekend-toggle-label"
                              />
                            </div>
                            <Badge className="rounded-full bg-brand-500/10 px-3 py-1.5 text-brand-500">
                              {formatDuration(selectedWeekSummary.totalMinutes)}
                            </Badge>
                            <Badge
                              variant="outline"
                              className="rounded-full border-border/60 px-3 py-1.5"
                            >
                              {selectedWeekSummary.entryCount} registros
                            </Badge>
                            <Badge
                              variant="outline"
                              className="rounded-full border-border/60 px-3 py-1.5"
                            >
                              {selectedWeekSummary.projectsCount} projetos
                            </Badge>
                          </div>
                        </div>
                      </CardHeader>

                      <CardContent>
                        {!selectedUserInsight || weekDays.length === 0 ? (
                          <div className="flex min-h-[360px] items-center justify-center rounded-3xl border border-dashed border-border/60 bg-muted/20 p-8 text-center">
                            <div>
                              <p className="text-sm font-medium text-foreground">
                                Nenhuma semana disponível
                              </p>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Ajuste os filtros ou selecione outro
                                colaborador.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <motion.div
                              layout
                              className={cn(
                                "grid gap-3",
                                showWeekends
                                  ? "min-w-[980px] grid-cols-7"
                                  : "min-w-[700px] grid-cols-5",
                              )}
                            >
                              <AnimatePresence initial={false} mode="popLayout">
                                {weekDays.map((day) => {
                                  const dayKey = format(day, "yyyy-MM-dd");
                                  const dayEntries =
                                    weekEntriesMap.get(dayKey) ?? [];
                                  const dayTotal = dayEntries.reduce(
                                    (sum, entry) => sum + entry.duration,
                                    0,
                                  );

                                  return (
                                    <motion.div
                                      key={dayKey}
                                      layout
                                      initial={{ opacity: 0, scale: 0.9 }}
                                      animate={{ opacity: 1, scale: 1 }}
                                      exit={{ opacity: 0, scale: 0.9 }}
                                      transition={{
                                        duration: 0.22,
                                        ease: [0.25, 0.46, 0.45, 0.94],
                                        layout: {
                                          type: "spring",
                                          stiffness: 400,
                                          damping: 30,
                                        },
                                      }}
                                      className="flex min-h-[360px] flex-col rounded-2xl border border-border/60 bg-background/70"
                                    >
                                      <div className="border-b border-border/50 px-4 py-4">
                                        <div className="flex items-center justify-between gap-2">
                                          <div>
                                            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                                              {format(day, "EEE", {
                                                locale: ptBR,
                                              })}
                                            </p>
                                            <p className="mt-1 font-display text-xl font-semibold text-foreground">
                                              {format(day, "d")}
                                            </p>
                                          </div>
                                          <div className="text-right">
                                            <p className="font-mono text-sm font-semibold text-foreground">
                                              {formatDuration(dayTotal)}
                                            </p>
                                            <p className="text-[11px] text-muted-foreground">
                                              {dayEntries.length} itens
                                            </p>
                                          </div>
                                        </div>
                                      </div>

                                      <div className="flex-1 space-y-3 overflow-y-auto p-3">
                                        {dayEntries.length > 0 ? (
                                          dayEntries.map((entry) => (
                                            <WeekEntryCard
                                              key={entry.id}
                                              entry={entry}
                                              onSelect={setSelectedEntry}
                                            />
                                          ))
                                        ) : (
                                          <div className="flex h-full min-h-28 items-center justify-center rounded-2xl border border-dashed border-border/50 bg-muted/20 px-4 text-center text-sm text-muted-foreground">
                                            Sem registros neste dia
                                          </div>
                                        )}
                                      </div>
                                    </motion.div>
                                  );
                                })}
                              </AnimatePresence>
                            </motion.div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="records" className="mt-0 p-6 pt-5">
                    <div className="overflow-x-auto rounded-2xl border border-border/50">
                      <Table>
                        <TableHeader>
                          <TableRow className="border-y border-border/50 bg-muted/30 hover:bg-muted/30">
                            <TableHead className="w-[120px] font-bold">
                              Data
                            </TableHead>
                            <TableHead className="w-[220px] font-bold">
                              Colaborador
                            </TableHead>
                            <TableHead className="w-[220px] font-bold">
                              Projeto
                            </TableHead>
                            <TableHead className="min-w-[280px] font-bold">
                              Descrição
                            </TableHead>
                            <TableHead className="w-[120px] text-right font-bold">
                              Duração
                            </TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {paginatedEntries.map((entry) => (
                            <TableRow
                              key={entry.id}
                              className="border-b border-border/40 transition-colors hover:bg-muted/20"
                            >
                              <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                                {format(
                                  parseLocalDate(entry.date),
                                  "dd/MM/yyyy",
                                )}
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center gap-3">
                                  <UserAvatar
                                    name={entry.user.name}
                                    image={entry.user.image}
                                    size="sm"
                                  />
                                  <div className="min-w-0">
                                    <span className="block truncate text-sm font-medium text-foreground">
                                      {entry.user.name}
                                    </span>
                                    <span className="block truncate text-[10px] text-muted-foreground">
                                      {entry.user.email}
                                    </span>
                                  </div>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span
                                      className="h-2 w-2 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor: entry.project.color,
                                      }}
                                    />
                                    <span className="truncate text-sm font-medium">
                                      {entry.project.name}
                                    </span>
                                  </div>
                                  <span className="ml-4 block truncate text-[10px] text-muted-foreground">
                                    {entry.project.clientName || "Interno"}
                                  </span>
                                </div>
                              </TableCell>
                              <TableCell className="max-w-xl">
                                <DescriptionCell
                                  description={entry.description}
                                />
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex flex-col items-end gap-1">
                                  <span className="font-mono text-sm font-bold text-foreground">
                                    {formatDuration(entry.duration)}
                                  </span>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      "h-4 rounded px-1 text-[9px] uppercase tracking-tighter",
                                      entry.billable
                                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-500"
                                        : "bg-muted text-muted-foreground",
                                    )}
                                  >
                                    {entry.billable ? "Faturável" : "Interno"}
                                  </Badge>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 border-t border-border/50 pt-4 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-muted-foreground">
                        Mostrando{" "}
                        <span className="font-medium text-foreground">
                          {safePage * ITEMS_PER_PAGE + 1}
                        </span>{" "}
                        até{" "}
                        <span className="font-medium text-foreground">
                          {Math.min(
                            (safePage + 1) * ITEMS_PER_PAGE,
                            filteredEntries.length,
                          )}
                        </span>{" "}
                        de{" "}
                        <span className="font-medium text-foreground">
                          {filteredEntries.length}
                        </span>{" "}
                        resultados
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg border-border/50 hover:bg-muted"
                          disabled={safePage === 0}
                          onClick={() => setPage((current) => current - 1)}
                        >
                          <ChevronLeft className="h-4 w-4" />
                        </Button>
                        <div className="mx-2 flex items-center gap-1">
                          <span className="text-xs font-medium">
                            {safePage + 1}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            /
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {totalPages}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 rounded-lg border-border/50 hover:bg-muted"
                          disabled={safePage >= totalPages - 1}
                          onClick={() => setPage((current) => current + 1)}
                        >
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                </Tabs>
              )}
            </CardContent>
          </Card>
        </motion.section>
      </motion.div>

      <Sheet
        open={selectedEntry !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedEntry(null);
          }
        }}
      >
        <SheetContent side="right" className="w-full sm:max-w-lg">
          {selectedEntry ? (
            <>
              <SheetHeader className="space-y-3 border-b border-border/50 pb-5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "rounded-full border-border/60 bg-background/70 text-[10px]",
                      selectedEntry.billable &&
                        "border-emerald-500/30 text-emerald-600",
                    )}
                  >
                    {selectedEntry.billable ? "Faturável" : "Interno"}
                  </Badge>
                  <Badge className="rounded-full bg-brand-500/10 px-2.5 py-1 text-[10px] text-brand-500">
                    {formatDuration(selectedEntry.duration)}
                  </Badge>
                </div>

                <div className="space-y-2">
                  <SheetTitle className="text-xl">
                    {selectedEntry.project.name}
                  </SheetTitle>
                  <SheetDescription className="text-sm">
                    {selectedEntry.project.clientName || "Projeto interno"}
                  </SheetDescription>
                </div>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-6">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Colaborador
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <UserAvatar
                        name={selectedEntry.user.name}
                        image={selectedEntry.user.image}
                        size="sm"
                      />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-foreground">
                          {selectedEntry.user.name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {selectedEntry.user.email}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-border/50 bg-muted/20 p-4">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Registro
                    </p>
                    <div className="mt-3 space-y-2 text-sm">
                      <p className="text-foreground">
                        {format(
                          parseLocalDate(selectedEntry.date),
                          "dd/MM/yyyy",
                        )}
                      </p>
                      <p className="text-muted-foreground">
                        Criado em{" "}
                        {format(
                          new Date(selectedEntry.createdAt),
                          "dd/MM/yyyy HH:mm",
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-border/50 bg-background/60 p-4">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Tarefa registrada
                  </p>
                  <p className="mt-3 whitespace-pre-wrap break-words text-sm leading-6 text-foreground">
                    {selectedEntry.description || "Sem descrição informada."}
                  </p>
                </div>
              </div>
            </>
          ) : null}
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  );
}
