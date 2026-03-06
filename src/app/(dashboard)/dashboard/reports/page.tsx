"use client";

import { endOfMonth, format, startOfMonth, subMonths } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  BarChart3,
  Download,
  FileSpreadsheet,
  PieChart,
  TrendingUp,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartColors } from "@/hooks/use-chart-colors";
import { exportSummaryByProjectToExcel } from "@/lib/export/excel";
import { exportSummaryByProjectToPDF } from "@/lib/export/pdf";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};

const PIE_COLORS = [
  "#f97316",
  "#3b82f6",
  "#22c55e",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
  "#f59e0b",
  "#64748b",
];

function minutesToHours(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h${m}m`;
}

type RangeOption = "this-month" | "last-month" | "last-3-months";

interface DaySummary {
  date: string;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
}

interface ProjectSummary {
  projectId: string;
  projectName: string;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
}

function getRangeDates(range: RangeOption): {
  from: string;
  to: string;
  label: string;
} {
  const now = new Date();
  if (range === "this-month") {
    return {
      from: format(startOfMonth(now), "yyyy-MM-dd"),
      to: format(endOfMonth(now), "yyyy-MM-dd"),
      label: format(now, "MMMM yyyy", { locale: ptBR }),
    };
  }
  if (range === "last-month") {
    const prev = subMonths(now, 1);
    return {
      from: format(startOfMonth(prev), "yyyy-MM-dd"),
      to: format(endOfMonth(prev), "yyyy-MM-dd"),
      label: format(prev, "MMMM yyyy", { locale: ptBR }),
    };
  }
  // last-3-months
  const start = startOfMonth(subMonths(now, 2));
  return {
    from: format(start, "yyyy-MM-dd"),
    to: format(endOfMonth(now), "yyyy-MM-dd"),
    label: `${format(start, "MMM", { locale: ptBR })} – ${format(now, "MMM yyyy", { locale: ptBR })}`,
  };
}

export default function ReportsPage() {
  const [range, setRange] = useState<RangeOption>("this-month");
  const [daySummaries, setDaySummaries] = useState<DaySummary[]>([]);
  const [projectSummaries, setProjectSummaries] = useState<ProjectSummary[]>(
    [],
  );
  const [totalMinutes, setTotalMinutes] = useState(0);
  const [billableMinutes, setBillableMinutes] = useState(0);
  const [loading, setLoading] = useState(true);
  const chartColors = useChartColors();

  const { from, to, label } = getRangeDates(range);

  const fetchData = useCallback(
    async (signal: AbortSignal) => {
      setLoading(true);
      try {
        const [dayRes, projRes] = await Promise.all([
          fetch(`/api/time-entries/summary?groupBy=day&from=${from}&to=${to}`, {
            signal,
          }),
          fetch(
            `/api/time-entries/summary?groupBy=project&from=${from}&to=${to}`,
            { signal },
          ),
        ]);
        if (signal.aborted) return;
        const dayData = dayRes.ok
          ? await dayRes.json()
          : { data: [], totals: { totalMinutes: 0, billableMinutes: 0 } };
        const projData = projRes.ok
          ? await projRes.json()
          : { data: [], totals: { totalMinutes: 0 } };
        if (signal.aborted) return;
        setDaySummaries(dayData.data ?? []);
        setProjectSummaries(projData.data ?? []);
        setTotalMinutes(dayData.totals?.totalMinutes ?? 0);
        setBillableMinutes(dayData.totals?.billableMinutes ?? 0);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [from, to],
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  // Bar chart: minutes per day → hours
  const barData = daySummaries.map((d) => ({
    day: format(new Date(d.date + "T12:00:00"), "dd/MM"),
    hours: Math.round((d.totalMinutes / 60) * 10) / 10,
  }));

  // Pie chart: minutes per project → percentage
  const pieData = projectSummaries.map((p, i) => ({
    name: p.projectName,
    value: p.totalMinutes,
    color: PIE_COLORS[i % PIE_COLORS.length],
    projectId: p.projectId,
  }));

  const avgDailyMinutes =
    daySummaries.length > 0
      ? Math.round(
          daySummaries.reduce((sum, d) => sum + Number(d.totalMinutes), 0) /
            (daySummaries.filter((d) => Number(d.totalMinutes) > 0).length ||
              1),
        )
      : 0;

  const activeProjects = projectSummaries.filter(
    (p) => p.totalMinutes > 0,
  ).length;

  function handleExportExcel() {
    exportSummaryByProjectToExcel(
      projectSummaries.map((p) => ({
        projectName: p.projectName,
        totalMinutes: p.totalMinutes,
        billableMinutes: p.billableMinutes,
        entryCount: p.entryCount,
      })),
      {
        filename: `relatorio-${from}-${to}`,
        period: label,
        totalMinutes,
        billableMinutes,
      },
    );
  }

  function handleExportPDF() {
    exportSummaryByProjectToPDF({
      projectData: projectSummaries.map((p) => ({
        projectName: p.projectName,
        totalMinutes: p.totalMinutes,
        billableMinutes: p.billableMinutes,
        entryCount: p.entryCount,
      })),
      title: "Relatório de Horas",
      period: label,
      filename: `relatorio-${from}-${to}`,
      totalMinutes,
      billableMinutes,
    });
  }

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      <motion.div
        variants={itemVariants}
        className="flex flex-wrap items-start justify-between gap-4"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Relatórios
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Analise sua produtividade e distribuição de horas.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={range}
            onValueChange={(v) => setRange(v as RangeOption)}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="this-month">Este mês</SelectItem>
              <SelectItem value="last-month">Mês passado</SelectItem>
              <SelectItem value="last-3-months">Últimos 3 meses</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="gap-2"
          >
            <FileSpreadsheet className="h-4 w-4" />
            Excel
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportPDF}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            PDF
          </Button>
        </div>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            id: "total",
            label: label,
            value: loading ? null : minutesToHours(totalMinutes),
            icon: BarChart3,
            sub: loading ? "" : `${minutesToHours(billableMinutes)} faturáveis`,
          },
          {
            id: "daily-avg",
            label: "Média diária",
            value: loading ? null : minutesToHours(avgDailyMinutes),
            icon: TrendingUp,
            sub: "dias com registro",
          },
          {
            id: "projects",
            label: "Projetos",
            value: loading ? null : String(activeProjects),
            icon: PieChart,
            sub: "com horas lançadas",
          },
        ].map((stat) => (
          <motion.div key={stat.id} variants={itemVariants}>
            <Card className="border-border/50 bg-card/80 backdrop-blur">
              <CardContent className="flex items-center gap-4 pt-5">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-500/10">
                  <stat.icon className="h-5 w-5 text-brand-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground capitalize">
                    {stat.label}
                  </p>
                  {stat.value === null ? (
                    <Skeleton className="my-1 h-6 w-16" />
                  ) : (
                    <p className="font-mono text-xl font-bold text-foreground">
                      {stat.value}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">{stat.sub}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Daily Bar Chart */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-display text-base font-semibold">
                Horas por Dia
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full rounded-lg" />
              ) : (
                <div className="h-[250px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={barData}
                      barSize={barData.length > 20 ? 8 : 28}
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
                        tick={{ fontSize: 11, fill: chartColors.tickFill }}
                        interval={
                          barData.length > 15
                            ? Math.floor(barData.length / 10)
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
                          borderRadius: "8px",
                          color: chartColors.tooltipColor,
                        }}
                        itemStyle={{ color: chartColors.tooltipColor }}
                        labelStyle={{ color: chartColors.tooltipLabelColor }}
                        cursor={{ fill: chartColors.cursorFill }}
                        formatter={(value) => [`${value}h`, "Horas"]}
                      />
                      <Bar
                        dataKey="hours"
                        fill="#f97316"
                        radius={[6, 6, 0, 0]}
                        name="Horas"
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* Project Distribution Pie */}
        <motion.div variants={itemVariants}>
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="font-display text-base font-semibold">
                Distribuição por Projeto
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-[250px] w-full rounded-lg" />
              ) : pieData.length === 0 ? (
                <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
                  Nenhum dado no período selecionado
                </div>
              ) : (
                <>
                  <div className="h-[250px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <RechartsPie>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={4}
                          dataKey="value"
                          label={({ name, percent, x, y, cx: pcx }) => {
                            const val =
                              typeof percent === "number" ? percent : 0;
                            if (val < 0.05) return null;
                            return (
                              <text
                                x={x}
                                y={y}
                                fill={chartColors.pieLabelFill}
                                textAnchor={x > pcx ? "start" : "end"}
                                dominantBaseline="central"
                                fontSize={11}
                                fontWeight="500"
                              >
                                {`${(val * 100).toFixed(0)}%`}
                              </text>
                            );
                          }}
                          labelLine={false}
                        >
                          {pieData.map((entry) => (
                            <Cell key={entry.projectId} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            backgroundColor: chartColors.tooltipBg,
                            border: `1px solid ${chartColors.tooltipBorder}`,
                            borderRadius: "8px",
                            color: chartColors.tooltipColor,
                          }}
                          itemStyle={{ color: chartColors.tooltipColor }}
                          labelStyle={{ color: chartColors.tooltipLabelColor }}
                          formatter={(value: number | undefined) => [
                            minutesToHours(value ?? 0),
                            "Total",
                          ]}
                        />
                      </RechartsPie>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 space-y-2">
                    {pieData.map((item) => (
                      <div
                        key={item.projectId}
                        className="flex items-center gap-2 text-xs"
                      >
                        <div
                          className="h-2.5 w-2.5 flex-shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="flex-1 truncate text-muted-foreground">
                          {item.name}
                        </span>
                        <span className="font-mono font-medium text-foreground">
                          {minutesToHours(item.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
