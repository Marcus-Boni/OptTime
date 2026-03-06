"use client";

import { endOfWeek, format, startOfWeek } from "date-fns";
import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Clock,
  Folder,
  TrendingUp,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { useCallback, useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useChartColors } from "@/hooks/use-chart-colors";
import { useTimer } from "@/hooks/use-timer";
import { useSession } from "@/lib/auth-client";
import { cn, formatDuration } from "@/lib/utils";
import { useUIStore } from "@/stores/ui.store";

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

const TODAY = format(new Date(), "yyyy-MM-dd");
const WEEK_START = format(
  startOfWeek(new Date(), { weekStartsOn: 1 }),
  "yyyy-MM-dd",
);
const WEEK_END = format(
  endOfWeek(new Date(), { weekStartsOn: 1 }),
  "yyyy-MM-dd",
);
const SEVEN_DAYS_AGO = format(
  new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
  "yyyy-MM-dd",
);

const DAY_NAMES: Record<number, string> = {
  1: "Seg",
  2: "Ter",
  3: "Qua",
  4: "Qui",
  5: "Sex",
  6: "Sáb",
  0: "Dom",
};

type Project = { id: string; name: string; code: string; color: string | null };
type Entry = {
  id: string;
  projectId: string;
  description: string | null;
  duration: number;
  project?: { id: string; name: string; code: string; color: string | null };
};

function DashboardContent() {
  const { data: session } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const theme = useUIStore((s) => s.theme);
  const chartColors = useChartColors();
  const { hasTimer, isRunning, displayTime } = useTimer();

  const [todayMinutes, setTodayMinutes] = useState(0);
  const [weekBarData, setWeekBarData] = useState<
    { day: string; hours: number }[]
  >([]);
  const [weekTotalHours, setWeekTotalHours] = useState(0);
  const [activeProjects, setActiveProjects] = useState<Project[]>([]);
  const [recentEntries, setRecentEntries] = useState<Entry[]>([]);
  const [projectColorMap, setProjectColorMap] = useState<
    Record<string, string>
  >({});
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingEntries, setLoadingEntries] = useState(true);

  // Handle forbidden redirect error
  useEffect(() => {
    if (searchParams.get("error") === "forbidden") {
      toast.error("Acesso restrito", {
        description: "Você não tem permissão para acessar essa área.",
      });
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      router.replace(url.pathname);
    }
  }, [searchParams, router]);

  const fetchStats = useCallback(async () => {
    setLoadingStats(true);
    try {
      const [todayRes, weekRes, projectsRes] = await Promise.all([
        fetch(
          `/api/time-entries/summary?groupBy=day&from=${TODAY}&to=${TODAY}`,
        ),
        fetch(
          `/api/time-entries/summary?groupBy=day&from=${WEEK_START}&to=${WEEK_END}`,
        ),
        fetch("/api/projects?status=active&limit=10"),
      ]);

      const todayData = todayRes.ok
        ? await todayRes.json()
        : { data: [], totals: { totalMinutes: 0 } };
      const weekData = weekRes.ok
        ? await weekRes.json()
        : { data: [], totals: { totalMinutes: 0 } };
      const projData = projectsRes.ok
        ? await projectsRes.json()
        : { projects: [] };

      setTodayMinutes(todayData.totals?.totalMinutes ?? 0);

      const dayArr = (weekData.data ?? []).map(
        (d: { date: string; totalMinutes: number }) => ({
          day:
            DAY_NAMES[new Date(`${d.date}T12:00:00`).getDay()] ??
            d.date.slice(5),
          hours: Math.round((d.totalMinutes / 60) * 10) / 10,
        }),
      );
      setWeekBarData(dayArr);
      setWeekTotalHours(
        Math.round(((weekData.totals?.totalMinutes ?? 0) / 60) * 10) / 10,
      );

      const projects: Project[] = projData.projects ?? [];
      setActiveProjects(projects.slice(0, 4));
      const colorMap: Record<string, string> = {};
      for (const p of projects) colorMap[p.id] = p.color ?? "#888";
      setProjectColorMap(colorMap);
    } catch {
      /* noop */
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const fetchRecentEntries = useCallback(async () => {
    setLoadingEntries(true);
    try {
      const res = await fetch(
        `/api/time-entries?from=${SEVEN_DAYS_AGO}&to=${TODAY}`,
      );
      if (res.ok) {
        const data = await res.json();
        const entries: Entry[] = (data.entries ?? data ?? []).slice(0, 5);
        setRecentEntries(entries);
      }
    } catch {
      /* noop */
    } finally {
      setLoadingEntries(false);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchRecentEntries();
  }, [fetchStats, fetchRecentEntries]);

  const todayTarget = 8 * 60;
  const todayPercentage = Math.min(
    Math.round((todayMinutes / todayTarget) * 100),
    100,
  );
  const user = session?.user;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite";

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Page Header */}
      <motion.div variants={itemVariants}>
        <h1 className="font-display text-2xl font-bold text-foreground md:text-3xl">
          {greeting}, {user?.name?.split(" ")[0]}! 👋
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Aqui está o resumo do seu dia de trabalho.
        </p>
      </motion.div>

      {/* Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Today's Hours */}
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-brand-500/5" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Horas Hoje
              </CardTitle>
              <Clock className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="font-mono text-2xl font-bold text-foreground">
                  {formatDuration(todayMinutes)}
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Progress value={todayPercentage} className="h-1.5 flex-1" />
                <span className="text-xs text-muted-foreground">
                  {todayPercentage}%
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Meta: {formatDuration(todayTarget)}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Week Total */}
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-blue-500/5" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Semana
              </CardTitle>
              <BarChart3 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="font-mono text-2xl font-bold text-foreground">
                  {weekTotalHours.toFixed(1)}h
                </div>
              )}
              <div className="mt-2 flex items-center gap-2">
                <Progress
                  value={Math.min((weekTotalHours / 40) * 100, 100)}
                  className="h-1.5 flex-1"
                />
                <span className="text-xs text-muted-foreground">
                  {Math.round((weekTotalHours / 40) * 100)}%
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Capacidade: 40h
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Active Projects */}
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden border-border/50 bg-card/80 backdrop-blur">
            <div className="absolute right-0 top-0 h-32 w-32 rounded-bl-full bg-green-500/5" />
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Projetos Ativos
              </CardTitle>
              <Folder className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-8 w-12" />
              ) : (
                <div className="font-mono text-2xl font-bold text-foreground">
                  {activeProjects.length}
                </div>
              )}
              <p className="mt-3 text-xs text-muted-foreground">
                Projetos em andamento
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Timer Card */}
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden border-brand-500/20 bg-brand-500/5 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-brand-400">
                Timer
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10">
                <Image
                  src={theme === "dark" ? "/logo-white.svg" : "/logo-black.svg"}
                  alt="Logo"
                  width={11}
                  height={16}
                />
              </div>
            </CardHeader>
            <CardContent>
              {hasTimer ? (
                <div>
                  <p
                    className={cn(
                      "font-mono text-2xl font-bold",
                      isRunning ? "text-brand-500" : "text-muted-foreground",
                    )}
                  >
                    {displayTime}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {isRunning ? "Em andamento" : "Pausado"}
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 text-xs"
                    asChild
                  >
                    <Link href="/dashboard/time">Gerenciar</Link>
                  </Button>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Nenhum timer ativo
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
                    asChild
                  >
                    <Link href="/dashboard/time">Iniciar Timer</Link>
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts and Projects Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Bar Chart */}
        <motion.div variants={itemVariants} className="lg:col-span-2">
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="font-display text-base font-semibold">
                  Horas da Semana
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  {weekTotalHours.toFixed(1)}h de 40h registradas
                </p>
              </div>
              <TrendingUp className="h-4 w-4 text-brand-500" />
            </CardHeader>
            <CardContent>
              {loadingStats ? (
                <Skeleton className="h-[200px] w-full rounded-lg" />
              ) : weekBarData.length === 0 ? (
                <div className="flex h-[200px] items-center justify-center text-sm text-muted-foreground">
                  Nenhum registro esta semana
                </div>
              ) : (
                <div className="h-[200px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={weekBarData} barSize={32}>
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
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 12, fill: chartColors.tickFill }}
                        domain={[0, 10]}
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

        {/* Timesheets Alert + Active Projects */}
        <motion.div variants={itemVariants} className="space-y-4">
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-semibold">
                Projetos Ativos
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {loadingStats ? (
                Array.from({ length: 3 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  <Skeleton key={i} className="h-10 w-full rounded-lg" />
                ))
              ) : activeProjects.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum projeto ativo
                </p>
              ) : (
                activeProjects.map((project) => (
                  <Link
                    key={project.id}
                    href={`/dashboard/projects/${project.id}`}
                    className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                  >
                    <div
                      className="h-3 w-3 shrink-0 rounded-full"
                      style={{ backgroundColor: project.color ?? "#888" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {project.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {project.code}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Recent Time Entries */}
      <motion.div variants={itemVariants}>
        <Card className="border-border/50 bg-card/80 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="font-display text-base font-semibold">
                Atividade Recente
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Últimos registros de tempo
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard/time">
                Ver todos
                <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {loadingEntries ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : recentEntries.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">
                Nenhum registro recente.
              </p>
            ) : (
              <div className="space-y-3">
                {recentEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center gap-4 rounded-lg border border-border/30 p-3 transition-colors hover:bg-accent/50"
                  >
                    <div
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{
                        backgroundColor:
                          projectColorMap[entry.projectId] ?? "#666",
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">
                        {entry.description || "—"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {entry.project?.name ?? "—"}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-sm font-semibold text-foreground">
                        {formatDuration(entry.duration)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
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
