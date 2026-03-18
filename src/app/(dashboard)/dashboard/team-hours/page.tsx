"use client";

import { format, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
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
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { TeamHourProject, TeamHourUser } from "@/hooks/use-team-hours";
import { useTeamHours } from "@/hooks/use-team-hours";
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

function getQuickRangeDates(days: number) {
  const end = new Date();
  const start = subDays(end, days - 1);
  return { start, end };
}

export default function TeamHoursPage() {
  const [fromDate, setFromDate] = useState<Date | undefined>(undefined);
  const [toDate, setToDate] = useState<Date | undefined>(undefined);
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [page, setPage] = useState(0);

  const deferredSearch = useDeferredValue(search);
  const fromStr = fromDate ? format(fromDate, "yyyy-MM-dd") : undefined;
  const toStr = toDate ? format(toDate, "yyyy-MM-dd") : undefined;

  const { entries, loading, error } = useTeamHours({
    from: fromStr,
    to: toStr,
    userId: "all",
    projectId: "all",
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
      // Filter by user
      if (userFilter !== "all" && entry.user.id !== userFilter) return false;

      // Filter by project
      if (projectFilter !== "all" && entry.project.id !== projectFilter)
        return false;

      // Search filter
      if (normalizedSearch) {
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

        if (!searchText.includes(normalizedSearch)) return false;
      }

      return true;
    });

    // Sorting
    result = [...result].sort((a, b) => {
      const dateA = parseLocalDate(a.date).getTime();
      const dateB = parseLocalDate(b.date).getTime();

      if (sortBy === "oldest") return dateA - dateB;
      if (sortBy === "longest") {
        if (b.duration !== a.duration) return b.duration - a.duration;
      }
      // Default: newest (date then createdAt)
      if (dateB !== dateA) return dateB - dateA;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    return result;
  }, [entries, deferredSearch, projectFilter, sortBy, userFilter]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: <Reset para primeira página quando qualquer filtro mudar>
  useEffect(() => {
    setPage(0);
  }, [deferredSearch, projectFilter, sortBy, userFilter]);

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
      : "Todo o periodo";

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8 pb-12"
    >
      {/* Page Header */}
      <motion.div
        variants={itemVariants}
        className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Horas da Equipe
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Acompanhe os registros de tempo de todos os colaboradores.
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
              className="rounded-full h-8"
              onClick={() => {
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

      {/* Date Filters Card */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/50">
          <CardContent className="p-4 flex flex-col gap-4 sm:flex-row sm:items-center">
            <div className="flex flex-1 flex-col gap-4 sm:flex-row sm:items-center">
              <div className="flex flex-col gap-1.5 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 ml-1">
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

              <div className="flex flex-col gap-1.5 flex-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground/80 ml-1">
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

            <div className="flex items-end justify-between sm:justify-end gap-4 min-w-[150px]">
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

      {/* KPI Section */}
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
          icon={<BriefcaseBusiness className="h-5 w-5" />} // Usando ícone similar se Clock3 for removido
          iconColor="bg-amber-500/10 text-amber-500"
        />
      </motion.section>

      {/* Main Content Area */}
      <motion.section variants={itemVariants} className="space-y-4">
        <Card className="border-border/50 bg-card/50">
          <CardHeader className="p-6">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <CardTitle className="text-xl font-bold">
                  Explorar Registros
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Use os filtros abaixo para encontrar apontamentos específicos.
                </p>
              </div>

              <div className="flex flex-1 flex-col gap-4 w-full lg:max-w-4xl">
                <div className="group flex h-12 w-full items-center gap-3 border border-input bg-transparent dark:bg-input/30 rounded-xl px-4 transition-[color,box-shadow] shadow-xs focus-within:ring-[3px] focus-within:ring-ring/50 focus-within:border-ring">
                  <Search className="h-5 w-5 shrink-0 text-muted-foreground/60" />
                  <input
                    placeholder="Buscar colaborador, projeto ou descrição..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="h-full w-full bg-transparent p-0 text-base placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground outline-none border-none focus:ring-0 focus:outline-none font-sans"
                  />
                </div>

                <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                  <Select
                    value={projectFilter}
                    onValueChange={setProjectFilter}
                  >
                    <SelectTrigger className="w-full sm:w-[180px] h-10 border-border/50 bg-background/50 rounded-xl hover:border-orange-500/30 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none">
                      <SelectValue placeholder="Projeto" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos Projetos</SelectItem>
                      {uniqueProjects.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select value={userFilter} onValueChange={setUserFilter}>
                    <SelectTrigger className="w-full sm:w-[180px] h-10 border-border/50 bg-background/50 rounded-xl hover:border-orange-500/30 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none">
                      <SelectValue placeholder="Colaborador" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Toda Equipe</SelectItem>
                      {uniqueUsers.map((u) => (
                        <SelectItem key={u.id} value={u.id}>
                          {u.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Select
                    value={sortBy}
                    onValueChange={(v) => setSortBy(v as SortOption)}
                  >
                    <SelectTrigger className="w-full sm:w-[150px] h-10 border-border/50 bg-background/50 rounded-xl hover:border-orange-500/30 focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all outline-none">
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
              <div className="p-6 space-y-3">
                {["ske-1", "ske-2", "ske-3", "ske-4", "ske-5"].map((key) => (
                  <Skeleton key={key} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="p-20 text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Search className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="mt-4 text-sm font-medium">
                  Nenhum registro encontrado
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Tente ajustar seus filtros para ver mais resultados.
                </p>
                <Button
                  variant="link"
                  className="mt-2 text-orange-500 h-auto p-0"
                  onClick={() => {
                    setSearch("");
                    setUserFilter("all");
                    setProjectFilter("all");
                  }}
                >
                  Limpar todos os filtros
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/30 hover:bg-muted/30 border-y border-border/50">
                      <TableHead className="w-[120px] font-bold">
                        Data
                      </TableHead>
                      <TableHead className="w-[200px] font-bold">
                        Colaborador
                      </TableHead>
                      <TableHead className="w-[200px] font-bold">
                        Projeto
                      </TableHead>
                      <TableHead className="font-bold">Descrição</TableHead>
                      <TableHead className="text-right font-bold w-[120px]">
                        Duração
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginatedEntries.map((entry) => (
                      <TableRow
                        key={entry.id}
                        className="group border-b border-border/40 hover:bg-muted/20 transition-colors"
                      >
                        <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                          {format(parseLocalDate(entry.date), "dd/MM/yyyy")}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-3">
                            <UserAvatar
                              name={entry.user.name}
                              image={entry.user.image}
                              size="sm"
                            />
                            <div className="flex flex-col min-w-0">
                              <span className="truncate text-sm font-medium text-foreground">
                                {entry.user.name}
                              </span>
                              <span className="truncate text-[10px] text-muted-foreground">
                                {entry.user.email}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: entry.project.color }}
                              />
                              <span className="truncate text-sm font-medium">
                                {entry.project.name}
                              </span>
                            </div>
                            <span className="truncate text-[10px] text-muted-foreground ml-4">
                              {entry.project.clientName || "Interno"}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-md">
                          <p className="text-sm text-muted-foreground line-clamp-1 group-hover:line-clamp-none transition-all duration-200">
                            {entry.description}
                          </p>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex flex-col items-end gap-1">
                            <span className="font-mono text-sm font-bold text-foreground">
                              {formatDuration(entry.duration)}
                            </span>
                            <Badge
                              variant="outline"
                              className={cn(
                                "text-[9px] uppercase tracking-tighter h-4 px-1 rounded",
                                entry.billable
                                  ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
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
            )}
          </CardContent>

          {/* Table Footer / Pagination */}
          {!loading && filteredEntries.length > 0 && (
            <div className="flex items-center justify-between border-t border-border/50 p-4">
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
                  onClick={() => setPage((p) => p - 1)}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-1 mx-2">
                  <span className="text-xs font-medium">{safePage + 1}</span>
                  <span className="text-xs text-muted-foreground">/</span>
                  <span className="text-xs text-muted-foreground">
                    {totalPages}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg border-border/50 hover:bg-muted"
                  disabled={safePage >= totalPages - 1}
                  onClick={() => setPage((p) => p + 1)}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </motion.section>
    </motion.div>
  );
}
