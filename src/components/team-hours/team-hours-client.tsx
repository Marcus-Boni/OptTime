"use client";

import { format } from "date-fns";
import { motion } from "framer-motion";
import {
  ChevronDown,
  Download,
  FilterX,
  Loader2,
  Search,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { CollaboratorBoard } from "@/components/team-hours/collaborator-board";
import { CollaboratorList } from "@/components/team-hours/collaborator-list";
import { EntryDetailSheet } from "@/components/team-hours/entry-detail-sheet";
import {
  PeriodControl,
  type TeamHoursPeriod,
} from "@/components/team-hours/period-control";
import { TeamHoursKpis } from "@/components/team-hours/team-hours-kpis";
import { TeamHoursTable } from "@/components/team-hours/team-hours-table";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { UserCombobox } from "@/components/time/UserCombobox";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  fetchAllTeamHoursEntries,
  hydrateAvatars,
  type TeamHoursFilters,
  useTeamHoursCollaborator,
  useTeamHoursEntries,
  useTeamHoursSummary,
} from "@/hooks/use-team-hours";
import { useUserTimePreferences } from "@/hooks/use-user-time-preferences";
import {
  exportCollaboratorHoursToPDF,
  exportTeamHoursGroupedToPDF,
} from "@/lib/export/pdf";
import { cn } from "@/lib/utils";
import type { TeamHourEntry, TeamHoursSortOption } from "@/types/team-hours";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 300;

const SORT_OPTIONS: Array<{ value: TeamHoursSortOption; label: string }> = [
  { value: "newest", label: "Mais recentes" },
  { value: "oldest", label: "Mais antigos" },
  { value: "longest", label: "Maior duração" },
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
};

export function TeamHoursClient() {
  const { preferences, updatePreferences } = useUserTimePreferences();

  const [period, setPeriod] = useState<TeamHoursPeriod>({
    from: undefined,
    to: undefined,
  });
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [sort, setSort] = useState<TeamHoursSortOption>("newest");
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState("people");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<TeamHourEntry | null>(
    null,
  );
  const [showWeekends, setShowWeekends] = useState(preferences.showWeekends);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    setShowWeekends(preferences.showWeekends);
  }, [preferences.showWeekends]);

  // The debounce is what keeps typing from firing a query per keystroke now
  // that search runs in Postgres instead of over an in-memory array.
  const debouncedSearch = useDebouncedValue(search, SEARCH_DEBOUNCE_MS);

  const filters = useMemo<TeamHoursFilters>(
    () => ({
      from: period.from ? format(period.from, "yyyy-MM-dd") : undefined,
      to: period.to ? format(period.to, "yyyy-MM-dd") : undefined,
      userId: userFilter,
      projectId: projectFilter,
      search: debouncedSearch,
    }),
    [debouncedSearch, period.from, period.to, projectFilter, userFilter],
  );

  const summary = useTeamHoursSummary(filters);

  // Avatars are stored inline (tens of kilobytes each), so the API sends every
  // one exactly once — here — instead of repeating them per row. Everything
  // downstream joins back to this map by user id.
  const avatars = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const person of summary.data?.filterOptions.users ?? []) {
      map.set(person.id, person.image);
    }
    return map;
  }, [summary.data?.filterOptions.users]);

  const collaborators = useMemo(
    () =>
      (summary.data?.collaborators ?? []).map((item) => ({
        ...item,
        user: { ...item.user, image: avatars.get(item.user.id) ?? null },
      })),
    [avatars, summary.data?.collaborators],
  );

  // Only the records tab pays for the paginated query.
  const entries = useTeamHoursEntries(
    filters,
    { page, pageSize: PAGE_SIZE, sort },
    tab === "records",
  );

  // Keep the selection valid as filters narrow the visible team.
  const activeUserId = useMemo(() => {
    if (userFilter !== "all") return userFilter;
    if (
      selectedUserId &&
      collaborators.some((item) => item.user.id === selectedUserId)
    ) {
      return selectedUserId;
    }
    return collaborators[0]?.user.id ?? null;
  }, [collaborators, selectedUserId, userFilter]);

  const collaboratorDetail = useTeamHoursCollaborator(
    filters,
    tab === "people" ? activeUserId : null,
  );

  const selectedCollaborator =
    collaborators.find((item) => item.user.id === activeUserId) ?? null;

  const collaboratorEntries = useMemo(
    () => hydrateAvatars(collaboratorDetail.data?.entries ?? [], avatars),
    [avatars, collaboratorDetail.data?.entries],
  );

  const tableEntries = useMemo(
    () => hydrateAvatars(entries.data?.entries ?? [], avatars),
    [avatars, entries.data?.entries],
  );

  /** A refresh over data already on screen, as opposed to the first load. */
  const isRefreshing = summary.loading && summary.data !== null;

  const hasActiveFilters =
    search !== "" ||
    userFilter !== "all" ||
    projectFilter !== "all" ||
    period.from !== undefined ||
    period.to !== undefined;

  const periodLabel =
    period.from && period.to
      ? `${format(period.from, "dd/MM/yyyy")} - ${format(period.to, "dd/MM/yyyy")}`
      : "Todo o período";

  function handleFilterChange(apply: () => void) {
    setPage(0);
    apply();
  }

  function handleClearFilters() {
    setPage(0);
    setSearch("");
    setUserFilter("all");
    setProjectFilter("all");
    setPeriod({ from: undefined, to: undefined });
  }

  async function handleWeekendsChange(show: boolean) {
    const previous = showWeekends;
    setShowWeekends(show);

    const success = await updatePreferences(
      { timeShowWeekends: show },
      { errorMessage: "Não foi possível salvar a exibição de fins de semana." },
    );

    if (!success) {
      setShowWeekends(previous);
    }
  }

  async function handleExportTeamPDF() {
    setExporting(true);
    try {
      const allEntries = hydrateAvatars(
        await fetchAllTeamHoursEntries(filters, sort),
        avatars,
      );

      if (allEntries.length === 0) {
        toast.error("Nenhum registro no período para exportar.");
        return;
      }

      await exportTeamHoursGroupedToPDF({
        entries: allEntries,
        period: periodLabel,
        filename: "relatorio-horas-equipe",
      });
      toast.success("PDF consolidado da equipe gerado com sucesso.");
    } catch (error: unknown) {
      console.error("[TeamHoursClient] handleExportTeamPDF:", error);
      toast.error("Erro ao gerar PDF da equipe.");
    } finally {
      setExporting(false);
    }
  }

  async function handleExportCollaboratorPDF() {
    if (!selectedCollaborator) {
      toast.error("Nenhum colaborador selecionado para exportar.");
      return;
    }

    setExporting(true);
    try {
      const allEntries = hydrateAvatars(
        await fetchAllTeamHoursEntries({
          ...filters,
          userId: selectedCollaborator.user.id,
        }),
        avatars,
      );

      if (allEntries.length === 0) {
        toast.error("Nenhum registro no período para exportar.");
        return;
      }

      const slug = selectedCollaborator.user.name
        .toLowerCase()
        .replace(/\s+/g, "-");

      await exportCollaboratorHoursToPDF({
        userName: selectedCollaborator.user.name,
        userEmail: selectedCollaborator.user.email,
        entries: allEntries,
        period: periodLabel,
        filename: `relatorio-horas-${slug}`,
      });
      toast.success("PDF do colaborador gerado com sucesso.");
    } catch (error: unknown) {
      console.error("[TeamHoursClient] handleExportCollaboratorPDF:", error);
      toast.error("Erro ao gerar PDF do colaborador.");
    } finally {
      setExporting(false);
    }
  }

  if (summary.error) {
    return (
      <Card className="border-destructive/40 bg-destructive/5 p-8 text-center">
        <p className="text-sm font-medium text-destructive">{summary.error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mx-auto mt-4 w-fit"
          onClick={summary.refetch}
        >
          Tentar novamente
        </Button>
      </Card>
    );
  }

  return (
    <TooltipProvider>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-5 pb-10"
      >
        {/* ─── Header + período + export ─────────────────────────────── */}
        <motion.header
          variants={itemVariants}
          className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        >
          <div>
            <h1 className="font-display text-xl font-bold text-foreground">
              Horas da Equipe
            </h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              Carga de trabalho por colaborador, projeto e semana.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <PeriodControl
              value={period}
              onChange={(next) => handleFilterChange(() => setPeriod(next))}
            />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={exporting}
                  className="h-9 gap-1.5 border-brand-500/25 text-brand-500 hover:bg-brand-500/8 hover:text-brand-600"
                  data-tour="team-hours-export"
                >
                  {exporting ? (
                    <Loader2
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <Download className="size-4" aria-hidden="true" />
                  )}
                  Exportar PDF
                  <ChevronDown
                    className="size-3.5 opacity-60"
                    aria-hidden="true"
                  />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem
                  onClick={handleExportTeamPDF}
                  className="gap-2 focus:bg-brand-500/10 focus:text-brand-500"
                >
                  <Users className="size-4 text-brand-500" aria-hidden="true" />
                  PDF da equipe (consolidado)
                </DropdownMenuItem>
                {selectedCollaborator ? (
                  <DropdownMenuItem
                    onClick={handleExportCollaboratorPDF}
                    className="gap-2 focus:bg-brand-500/10 focus:text-brand-500"
                  >
                    <UserAvatar
                      name={selectedCollaborator.user.name}
                      image={selectedCollaborator.user.image}
                      size="sm"
                    />
                    PDF de {selectedCollaborator.user.name.split(" ")[0]}
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </motion.header>

        {/* ─── KPIs ───────────────────────────────────────────────────── */}
        <motion.section
          variants={itemVariants}
          aria-label="Indicadores do período"
          aria-busy={summary.loading}
          className={cn(
            "transition-opacity duration-200",
            // Stale numbers stay readable while the next ones load, just dimmed.
            isRefreshing && "opacity-60",
          )}
        >
          <TeamHoursKpis
            totals={summary.data?.totals ?? null}
            loading={summary.loading && !summary.data}
          />
        </motion.section>

        {/* ─── Filtros ────────────────────────────────────────────────── */}
        <motion.section variants={itemVariants} aria-label="Filtros">
          <Card
            className="gap-0 rounded-xl border-border/60 p-2 shadow-none"
            data-tour="team-hours-filters"
          >
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
              <div className="relative flex-1 lg:min-w-[240px]">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                />
                <label htmlFor="team-hours-search" className="sr-only">
                  Buscar registros
                </label>
                <Input
                  id="team-hours-search"
                  value={search}
                  onChange={(event) =>
                    handleFilterChange(() => setSearch(event.target.value))
                  }
                  placeholder="Buscar colaborador, projeto ou descrição..."
                  className="h-9 border-transparent bg-transparent pl-9 shadow-none dark:bg-transparent"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:w-auto lg:grid-cols-none lg:flex lg:items-center">
                <ProjectCombobox
                  projects={summary.data?.filterOptions.projects ?? []}
                  value={projectFilter}
                  onChange={(value) =>
                    handleFilterChange(() => setProjectFilter(value))
                  }
                  placeholder="Todos os projetos"
                  emptyOption={{ label: "Todos os projetos", value: "all" }}
                  byPassMemberFilter
                  className="h-9 w-full lg:w-[190px]"
                />

                <UserCombobox
                  users={summary.data?.filterOptions.users ?? []}
                  value={userFilter}
                  onChange={(value) =>
                    handleFilterChange(() => setUserFilter(value))
                  }
                  placeholder="Toda a equipe"
                  emptyOption={{ label: "Toda a equipe", value: "all" }}
                  className="h-9 w-full lg:w-[190px]"
                />

                <Select
                  value={sort}
                  onValueChange={(value) =>
                    handleFilterChange(() =>
                      setSort(value as TeamHoursSortOption),
                    )
                  }
                >
                  <SelectTrigger
                    aria-label="Ordenar registros"
                    className="h-9 w-full data-[size=default]:h-9 lg:w-[170px]"
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {hasActiveFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearFilters}
                  className="h-9 shrink-0 gap-1.5 text-muted-foreground hover:text-foreground"
                >
                  <FilterX className="size-4" aria-hidden="true" />
                  Limpar
                </Button>
              ) : null}
            </div>
          </Card>
        </motion.section>

        {/* ─── Conteúdo ───────────────────────────────────────────────── */}
        <motion.section variants={itemVariants}>
          <Tabs
            value={tab}
            onValueChange={(value) => {
              setTab(value);
              setPage(0);
            }}
          >
            <TabsList className="mb-3" data-tour="team-hours-views">
              <TabsTrigger value="people">Por colaborador</TabsTrigger>
              <TabsTrigger value="records">Registros detalhados</TabsTrigger>
            </TabsList>

            <TabsContent value="people" className="mt-0">
              {/*
                A container query, not a viewport one: the side-by-side layout
                depends on the width this page actually has, which changes when
                the app sidebar is collapsed. A notebook that would be too
                narrow with the sidebar open gets the rail back once it is
                collapsed — and below the threshold the board takes the full
                width instead of being squeezed next to the list.
              */}
              <div className="@container/people">
                <div className="grid gap-4 @[1450px]/people:grid-cols-[300px_minmax(0,1fr)]">
                  {/*
                    In the rail layout `h-0 min-h-full` takes the list out of
                    the grid's row sizing — 22 people would otherwise make the
                    row 1400px tall — and then stretches it to exactly the
                    height the board settled on. That is what keeps both scroll
                    areas ending on the same line instead of the list stopping
                    short of its own card.
                  */}
                  <Card
                    aria-busy={summary.loading}
                    data-tour="team-hours-collaborators"
                    className={cn(
                      "gap-0 overflow-hidden rounded-xl border-border/60 py-0 shadow-none transition-opacity duration-200",
                      "@[1450px]/people:h-0 @[1450px]/people:min-h-full",
                      isRefreshing && "opacity-60",
                    )}
                  >
                    <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-4 py-2.5">
                      <h2 className="text-sm font-semibold text-foreground">
                        Colaboradores
                      </h2>
                      <span className="font-mono text-xs text-muted-foreground tabular-nums">
                        {collaborators.length}
                      </span>
                    </div>

                    {/* Horizontal strip when space is tight, tall rail when not.
                        Both are rendered and toggled in CSS so switching costs
                        no layout shift and no hydration guesswork. */}
                    <div className="@[1450px]/people:hidden">
                      <CollaboratorList
                        layout="strip"
                        collaborators={collaborators}
                        selectedUserId={activeUserId}
                        onSelect={setSelectedUserId}
                        loading={summary.loading && !summary.data}
                      />
                    </div>
                    {/* Fills the rest of the card, so the list scrolls to the
                        card's own bottom edge — no cap of its own. `pb-3` makes
                        the last row stop on the same line as the bottom of the
                        kanban columns next to it. */}
                    <div className="hidden overflow-y-auto @[1450px]/people:block @[1450px]/people:min-h-0 @[1450px]/people:flex-1 @[1450px]/people:pb-3">
                      <CollaboratorList
                        layout="rail"
                        collaborators={collaborators}
                        selectedUserId={activeUserId}
                        onSelect={setSelectedUserId}
                        loading={summary.loading && !summary.data}
                      />
                    </div>
                  </Card>

                  <Card className="gap-0 overflow-hidden rounded-xl border-border/60 py-0 shadow-none">
                    <CollaboratorBoard
                      collaborator={selectedCollaborator}
                      entries={collaboratorEntries}
                      weeks={collaboratorDetail.data?.weeks ?? []}
                      loading={collaboratorDetail.loading}
                      truncated={collaboratorDetail.data?.truncated ?? false}
                      showWeekends={showWeekends}
                      onShowWeekendsChange={handleWeekendsChange}
                      onSelectEntry={setSelectedEntry}
                    />
                  </Card>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="records" className="mt-0">
              {entries.error ? (
                <Card className="border-destructive/40 bg-destructive/5 p-8 text-center">
                  <p className="text-sm text-destructive">{entries.error}</p>
                </Card>
              ) : !entries.loading && (entries.data?.total ?? 0) === 0 ? (
                <Card className="rounded-xl border-border/60 p-12 text-center shadow-none">
                  <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
                    <Search
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <p className="mt-3 text-sm font-medium text-foreground">
                    Nenhum registro encontrado
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Ajuste os filtros para ver mais resultados.
                  </p>
                  {hasActiveFilters ? (
                    <Button
                      variant="link"
                      className="mx-auto mt-2 h-auto p-0 text-brand-500"
                      onClick={handleClearFilters}
                    >
                      Limpar todos os filtros
                    </Button>
                  ) : null}
                </Card>
              ) : (
                <TeamHoursTable
                  entries={tableEntries}
                  total={entries.data?.total ?? 0}
                  page={page}
                  pageSize={PAGE_SIZE}
                  loading={entries.loading}
                  onPageChange={setPage}
                  onSelectEntry={setSelectedEntry}
                />
              )}
            </TabsContent>
          </Tabs>
        </motion.section>
      </motion.div>

      <EntryDetailSheet
        entry={selectedEntry}
        onOpenChange={(open) => {
          if (!open) setSelectedEntry(null);
        }}
      />
    </TooltipProvider>
  );
}
