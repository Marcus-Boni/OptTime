"use client";

import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  CalendarRange,
  Download,
  FileSpreadsheet,
  ReceiptText,
  TrendingUp,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart as RechartsPie,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartColors } from "@/hooks/use-chart-colors";
import { useSession } from "@/lib/auth-client";
import { exportSummaryByProjectToExcel } from "@/lib/export/excel";
import { exportSummaryByProjectToPDF } from "@/lib/export/pdf";
import {
  cn,
  formatDateLabel,
  formatDuration,
  parseLocalDate,
} from "@/lib/utils";

const RANGE_OPTIONS = [
  { value: "this-week", label: "Esta semana" },
  { value: "this-month", label: "Este mês" },
  { value: "last-month", label: "Mês passado" },
  { value: "last-3-months", label: "Últimos 3 meses" },
] as const;

const PIE_COLORS = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#eab308",
  "#ec4899",
  "#06b6d4",
  "#8b5cf6",
  "#64748b",
];

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as const },
  },
} as const;

type RangeOption = (typeof RANGE_OPTIONS)[number]["value"];
type ProjectOption = {
  id: string;
  name: string;
  code: string;
  color: string | null;
};
type DaySummary = {
  date: string;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
};
type ProjectSummary = {
  projectId: string;
  projectName: string;
  projectCode: string;
  projectColor: string | null;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
};
type Entry = {
  id: string;
  projectId: string;
  description: string | null;
  duration: number;
  billable: boolean;
  date: string;
  project?: { id: string; name: string; color: string | null };
};

function getGreeting(now: Date | null) {
  if (!now) return "Olá";

  const hour = now.getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

function getRangeDates(range: RangeOption, now: Date | null) {
  if (!now) {
    return {
      from: "",
      to: "",
      label: "Carregando período",
    };
  }

  if (range === "this-week") {
    const start = startOfWeek(now, { weekStartsOn: 1 });
    const end = endOfWeek(now, { weekStartsOn: 1 });
    return {
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
      label: `${format(start, "dd/MM", { locale: ptBR })} - ${format(end, "dd/MM", { locale: ptBR })}`,
    };
  }

  if (range === "this-month") {
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
      label: format(now, "MMMM yyyy", { locale: ptBR }),
    };
  }

  if (range === "last-month") {
    const previousMonth = subMonths(now, 1);
    return {
      from: format(startOfMonth(previousMonth), "yyyy-MM-dd"),
      to: format(endOfMonth(previousMonth), "yyyy-MM-dd"),
      label: format(previousMonth, "MMMM yyyy", { locale: ptBR }),
    };
  }

  const start = startOfMonth(subMonths(now, 2));
  return {
    from: format(start, "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
    label: `${format(start, "MMM", { locale: ptBR })} - ${format(now, "MMM yyyy", { locale: ptBR })}`,
  };
}

function getProjectColor(color: string | null, index: number) {
  return color ?? PIE_COLORS[index % PIE_COLORS.length];
}

function StatCard({
  icon: Icon,
  title,
  value,
  description,
  loading,
  progress,
}: {
  icon: typeof BarChart3;
  title: string;
  value: string;
  description: string;
  loading: boolean;
  progress?: number;
}) {
  return (
    <Card className="border-border/50 bg-card/80 backdrop-blur">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-brand-500" />
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <>
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-1.5 w-full" />
            <Skeleton className="h-4 w-32" />
          </>
        ) : (
          <>
            <div className="text-2xl font-semibold text-foreground">
              {value}
            </div>
            {typeof progress === "number" ? (
              <Progress
                value={Math.max(0, Math.min(progress, 100))}
                className="h-1.5"
              />
            ) : null}
            <p className="text-xs text-muted-foreground">{description}</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-muted/20 px-6 text-center">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function DashboardContent() {
  const { data: session, isPending: sessionPending } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const chartColors = useChartColors();
  const [range, setRange] = useState<RangeOption>("this-week");
  const [dashboardNow, setDashboardNow] = useState<Date | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(true);
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>(
    [],
  );
  const [recentEntries, setRecentEntries] = useState<Entry[]>([]);
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [billableMinutes, setBillableMinutes] = useState(0);
  const [loadingDashboard, setLoadingDashboard] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);
  const [dataError, setDataError] = useState<string | null>(null);
  const { from, to, label } = useMemo(
    () => getRangeDates(range, dashboardNow),
    [dashboardNow, range],
  );

  useEffect(() => {
    setDashboardNow(new Date());
  }, []);

  useEffect(() => {
    if (searchParams.get("error") !== "forbidden") return;
    toast.error("Acesso restrito", {
      description: "Você não tem permissão para acessar essa área.",
    });
    const url = new URL(window.location.href);
    url.searchParams.delete("error");
    router.replace(url.pathname);
  }, [router, searchParams]);

  useEffect(() => {
    const controller = new AbortController();
    async function loadProjects() {
      setProjectsLoading(true);
      try {
        const response = await fetch("/api/projects?status=active", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("projects");
        const data = await response.json();
        if (!controller.signal.aborted) setProjects(data.projects ?? []);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!controller.signal.aborted) setProjects([]);
      } finally {
        if (!controller.signal.aborted) setProjectsLoading(false);
      }
    }
    void loadProjects();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const projectQuery =
      selectedProjectId !== "all" ? `&projectId=${selectedProjectId}` : "";

    if (!from || !to) {
      return () => controller.abort();
    }

    async function loadDashboard() {
      setLoadingDashboard(true);
      setLoadingEntries(true);
      setDataError(null);

      try {
        const [dayResponse, projectResponse, entriesResponse] =
          await Promise.all([
            fetch(
              `/api/time-entries/summary?groupBy=day&from=${from}&to=${to}${projectQuery}`,
              {
                signal: controller.signal,
              },
            ),
            fetch(
              `/api/time-entries/summary?groupBy=project&from=${from}&to=${to}${projectQuery}`,
              { signal: controller.signal },
            ),
            fetch(`/api/time-entries?from=${from}&to=${to}${projectQuery}`, {
              signal: controller.signal,
            }),
          ]);
        if (!dayResponse.ok || !projectResponse.ok || !entriesResponse.ok) {
          throw new Error("dashboard");
        }

        const [dayData, projectData, entryData] = await Promise.all([
          dayResponse.json(),
          projectResponse.json(),
          entriesResponse.json(),
        ]);

        if (controller.signal.aborted) return;
        setDaySummaries(dayData.data ?? []);
        setProjectSummaries(projectData.data ?? []);
        setRecentEntries((entryData.entries ?? []).slice(0, 8));
        setTotalMinutes(dayData.totals?.totalMinutes ?? 0);
        setBillableMinutes(dayData.totals?.billableMinutes ?? 0);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        if (!controller.signal.aborted) {
          setDaySummaries([]);
          setProjectSummaries([]);
          setRecentEntries([]);
          setTotalMinutes(0);
          setBillableMinutes(0);
          setDataError("Não foi possível carregar os dados do dashboard.");
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoadingDashboard(false);
          setLoadingEntries(false);
        }
      }
    }

    void loadDashboard();
    return () => controller.abort();
  }, [from, selectedProjectId, to]);

  const firstName =
    dashboardNow && !sessionPending ? session?.user?.name?.split(" ")[0] ?? "" : "";
  const selectedProject =
    selectedProjectId === "all"
      ? null
      : (projects.find((project) => project.id === selectedProjectId) ?? null);
  const projectComboboxOptions = useMemo(
    () =>
      projects.map((project) => ({
        id: project.id,
        name: project.name,
        color: project.color ?? "#94a3b8",
      })),
    [projects],
  );
  const activeDays = daySummaries.filter((day) => day.totalMinutes > 0).length;
  const periodDays =
    from && to
      ? Math.max(
          differenceInCalendarDays(parseLocalDate(to), parseLocalDate(from)) +
            1,
          1,
        )
      : 1;
  const entryCount = daySummaries.reduce((sum, day) => sum + day.entryCount, 0);
  const billableRate =
    totalMinutes > 0 ? Math.round((billableMinutes / totalMinutes) * 100) : 0;
  const averageDailyMinutes =
    activeDays > 0 ? Math.round(totalMinutes / activeDays) : 0;
  const averageEntriesPerActiveDay =
    activeDays > 0 ? Math.round((entryCount / activeDays) * 10) / 10 : 0;
  const topProject = projectSummaries[0] ?? null;

  const summaryText =
    totalMinutes > 0
      ? `${formatDuration(totalMinutes)} registrados em ${activeDays} dias com atividade, ${billableRate}% faturáveis${topProject ? ` e maior concentração em ${topProject.projectName}` : ""}.`
      : "Use os filtros para acompanhar sua distribuição de horas, exportar os dados e entender onde seu tempo está sendo investido.";

  const barData = daySummaries.map((day) => ({
    day:
      range === "this-week"
        ? format(parseLocalDate(day.date), "EEE", { locale: ptBR })
            .replace(".", "")
            .replace(/^\w/, (value) => value.toUpperCase())
        : format(parseLocalDate(day.date), "dd/MM", { locale: ptBR }),
    hours: Math.round((day.totalMinutes / 60) * 10) / 10,
  }));

  const pieData = projectSummaries.map((project, index) => ({
    projectId: project.projectId,
    name: project.projectName,
    value: project.totalMinutes,
    color: getProjectColor(project.projectColor, index),
  }));

  const statCards = [
    {
      title: "Total registrado",
      value: formatDuration(totalMinutes),
      description: `${entryCount} lançamentos no período selecionado.`,
      icon: BarChart3,
    },
    {
      title: "Horas faturáveis",
      value: `${billableRate}%`,
      description: `${formatDuration(billableMinutes)} faturáveis e ${formatDuration(Math.max(totalMinutes - billableMinutes, 0))} não faturáveis.`,
      icon: TrendingUp,
      progress: billableRate,
    },
    {
      title: "Média por dia ativo",
      value: formatDuration(averageDailyMinutes),
      description:
        activeDays > 0
          ? `${activeDays} dias com registro no período.`
          : "Sem dias com registro no período.",
      icon: CalendarRange,
    },
    {
      title: "Ritmo de lançamentos",
      value: `${entryCount}`,
      description:
        activeDays > 0
          ? `${averageEntriesPerActiveDay.toLocaleString("pt-BR")} lançamentos por dia ativo em ${activeDays} de ${periodDays} dias.`
          : "Sem lançamentos no período.",
      icon: ReceiptText,
    },
  ] as const;

  function handleExportExcel() {
    if (projectSummaries.length === 0) {
      toast.error("Não há dados para exportar no período selecionado.");
      return;
    }

    try {
      exportSummaryByProjectToExcel(
        projectSummaries.map((project) => ({
          projectName: project.projectName,
          totalMinutes: project.totalMinutes,
          billableMinutes: project.billableMinutes,
          entryCount: project.entryCount,
        })),
        {
          filename: `dashboard-${from}-${to}${selectedProject ? `-${selectedProject.code}` : ""}`,
          period: `${label}${selectedProject ? ` - ${selectedProject.name}` : ""}`,
          totalMinutes,
          billableMinutes,
        },
      );
      toast.success("Exportação em Excel concluída.");
    } catch {
      toast.error("Não foi possível exportar em Excel.");
    }
  }

  async function handleExportPDF() {
    if (projectSummaries.length === 0) {
      toast.error("Não há dados para exportar no período selecionado.");
      return;
    }

    try {
      await exportSummaryByProjectToPDF({
        projectData: projectSummaries.map((project) => ({
          projectName: project.projectName,
          totalMinutes: project.totalMinutes,
          billableMinutes: project.billableMinutes,
          entryCount: project.entryCount,
        })),
        title: "Dashboard de horas",
        period: `${label}${selectedProject ? ` - ${selectedProject.name}` : ""}`,
        filename: `dashboard-${from}-${to}${selectedProject ? `-${selectedProject.code}` : ""}`,
        totalMinutes,
        billableMinutes,
      });
      toast.success("Exportação em PDF concluída.");
    } catch {
      toast.error("Não foi possível exportar em PDF.");
    }
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="flex flex-col gap-6 p-6">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
              <div className="space-y-4">
                <div>
                  <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
                    {getGreeting(dashboardNow)}
                    {firstName ? `, ${firstName}` : ""}! 👋
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
                    Dashboard único para acompanhar produtividade real,
                    distribuição de horas e exportações sem depender de uma
                    página separada.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge
                    variant="secondary"
                    className="bg-brand-500/10 text-brand-500"
                  >
                    Período: {label}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="bg-muted text-muted-foreground"
                  >
                    Filtro: {selectedProject?.name ?? "Todos os projetos"}
                  </Badge>
                  <Badge
                    variant="secondary"
                    className="bg-muted text-muted-foreground"
                  >
                    {entryCount} lançamentos
                  </Badge>
                </div>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {summaryText}
                </p>
              </div>

              <div className="flex w-full flex-col gap-3 xl:max-w-xl">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
                      Período
                    </p>
                    <Select
                      value={range}
                      onValueChange={(value) => setRange(value as RangeOption)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {RANGE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground/70">
                      Projeto
                    </p>
                    <ProjectCombobox
                      projects={projectComboboxOptions}
                      value={selectedProjectId}
                      onChange={setSelectedProjectId}
                      placeholder="Selecione um projeto"
                      emptyOption={{ label: "Todos os projetos", value: "all" }}
                      disabled={projectsLoading}
                    />
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleExportExcel}
                    disabled={loadingDashboard || projectSummaries.length === 0}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Excel
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2"
                    onClick={handleExportPDF}
                    disabled={loadingDashboard || projectSummaries.length === 0}
                  >
                    <Download className="h-4 w-4" />
                    PDF
                  </Button>
                </div>
              </div>
            </div>

            {dataError ? (
              <div className="flex items-start gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-4 text-sm text-muted-foreground">
                <AlertCircle className="mt-0.5 h-4 w-4 text-destructive" />
                <div>
                  <p className="font-medium text-foreground">
                    Falha ao carregar dados
                  </p>
                  <p>{dataError}</p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <motion.div key={card.title} variants={itemVariants}>
            <StatCard {...card} loading={loadingDashboard} />
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(340px,1fr)]">
        <motion.div variants={itemVariants}>
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-base font-semibold">
                  Horas por dia
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Evolução diária das horas registradas dentro do filtro atual.
                </p>
              </div>
              <BarChart3 className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <Skeleton className="h-[280px] w-full rounded-xl" />
              ) : barData.length === 0 ? (
                <EmptyState
                  title="Nenhuma hora registrada"
                  description="Não houve lançamentos no período selecionado. Registre novas horas para acompanhar sua evolução."
                />
              ) : (
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barData}
                      barSize={barData.length > 20 ? 10 : 28}
                      margin={{ top: 12, right: 12, left: -20, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke={chartColors.gridStroke}
                      />
                      <XAxis
                        dataKey="day"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: chartColors.tickFill }}
                        interval={
                          barData.length > 16
                            ? Math.floor(barData.length / 8)
                            : 0
                        }
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: chartColors.tickFill }}
                        unit="h"
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: chartColors.tooltipBg,
                          border: `1px solid ${chartColors.tooltipBorder}`,
                          borderRadius: "12px",
                          color: chartColors.tooltipColor,
                        }}
                        itemStyle={{ color: chartColors.tooltipColor }}
                        labelStyle={{ color: chartColors.tooltipLabelColor }}
                        cursor={{ fill: chartColors.cursorFill }}
                        formatter={(value: number | string | undefined) => [
                          `${value ?? 0}h`,
                          "Horas",
                        ]}
                      />
                      <Bar
                        dataKey="hours"
                        fill="#f97316"
                        radius={[8, 8, 0, 0]}
                        name="Horas"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={itemVariants}>
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-base font-semibold">
                  Distribuição por projeto
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Participação de cada projeto no total de horas do período.
                </p>
              </div>
              <TrendingUp className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              {loadingDashboard ? (
                <Skeleton className="h-[340px] w-full rounded-xl" />
              ) : pieData.length === 0 ? (
                <EmptyState
                  title="Sem distribuição para exibir"
                  description="Quando houver horas registradas, a distribuição por projeto aparecerá aqui."
                />
              ) : (
                <>
                  <div className="h-[240px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={92}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ percent, x, y, cx }) => {
                            const value =
                              typeof percent === "number" ? percent : 0;
                            if (value < 0.05) return null;
                            return (
                              <text
                                x={x}
                                y={y}
                                fill={chartColors.pieLabelFill}
                                textAnchor={x > cx ? "start" : "end"}
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight="500"
                              >
                                {`${(value * 100).toFixed(0)}%`}
                              </text>
                            );
                          }}
                          labelLine={false}
                        >
                          {pieData.map((item) => (
                            <Cell key={item.projectId} fill={item.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: chartColors.tooltipBg,
                            border: `1px solid ${chartColors.tooltipBorder}`,
                            borderRadius: "12px",
                            color: chartColors.tooltipColor,
                          }}
                          itemStyle={{ color: chartColors.tooltipColor }}
                          labelStyle={{ color: chartColors.tooltipLabelColor }}
                          formatter={(value: number | undefined) => [
                            formatDuration(value ?? 0),
                            "Total",
                          ]}
                        />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>

                  <div className="space-y-3">
                    {pieData.slice(0, 6).map((item) => {
                      const share =
                        totalMinutes > 0
                          ? Math.round((item.value / totalMinutes) * 100)
                          : 0;
                      return (
                        <div key={item.projectId} className="space-y-1.5">
                          <div className="flex items-center gap-2 text-xs">
                            <div
                              className="h-2.5 w-2.5 shrink-0 rounded-full"
                              style={{ backgroundColor: item.color }}
                            />
                            <span className="flex-1 truncate text-muted-foreground">
                              {item.name}
                            </span>
                            <span className="font-medium text-foreground">
                              {formatDuration(item.value)}
                            </span>
                          </div>
                          <Progress value={share} className="h-1.5" />
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-base font-semibold">
                Atividade recente
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Últimos registros dentro do filtro atual, para cruzar análise
                com operação real.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/time">
                Ver detalhes
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingEntries ? (
              <div className="grid gap-3 lg:grid-cols-2">
                {[
                  "entry-a",
                  "entry-b",
                  "entry-c",
                  "entry-d",
                  "entry-e",
                  "entry-f",
                ].map((key) => (
                  <Skeleton key={key} className="h-24 w-full rounded-xl" />
                ))}
              </div>
            ) : recentEntries.length === 0 ? (
              <EmptyState
                title="Sem atividade recente"
                description="Não há lançamentos recentes no filtro atual. Ajuste o período ou registre novas horas."
              />
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="rounded-xl border border-border/60 p-4 transition-colors hover:bg-accent/40"
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="mt-1 h-3 w-3 shrink-0 rounded-full"
                        style={{
                          backgroundColor: entry.project?.color ?? "#f97316",
                        }}
                      />
                      <div className="min-w-0 flex-1 space-y-3">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium text-foreground">
                              {entry.description || "Sem descrição"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {entry.project?.name ?? "Projeto removido"} -{" "}
                              {formatDateLabel(entry.date)}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-semibold text-foreground">
                              {formatDuration(entry.duration)}
                            </p>
                            <Badge
                              variant="secondary"
                              className={cn(
                                "mt-1",
                                entry.billable
                                  ? "bg-green-500/10 text-green-500"
                                  : "bg-muted text-muted-foreground",
                              )}
                            >
                              {entry.billable ? "Faturável" : "Não faturável"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <ReceiptText className="h-4 w-4 text-brand-500" />
                Próxima ação recomendada
              </div>
              <p className="max-w-3xl text-sm text-muted-foreground">
                Use este dashboard como centro de acompanhamento: ajuste filtros
                para analisar um período específico, exporte o consolidado
                quando precisar compartilhar e aprofunde nos registros
                detalhados pela página de tempo.
              </p>
            </div>
            <Button
              asChild
              className="bg-brand-500 text-white hover:bg-brand-600"
            >
              <Link href="/dashboard/time">Registrar ou revisar horas</Link>
            </Button>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense>
      <DashboardContent />
    </Suspense>
  );
}
