"use client";

import { motion } from "framer-motion";
import {
  AlertCircle,
  ArrowRight,
  BarChart3,
  Clock,
  Folder,
  Play,
  TrendingUp,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useSession } from "@/lib/auth-client";
import {
  getMockTodayHours,
  getMockWeeklyHours,
  MOCK_CURRENT_USER,
  MOCK_PROJECTS,
  MOCK_TIME_ENTRIES,
} from "@/lib/mock-data";
import {
  cn,
  formatDecimalHours,
  formatDuration,
  getStatusColor,
} from "@/lib/utils";
import { useTimerStore } from "@/stores/timer.store";

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

export default function DashboardPage() {
  const todayMinutes = getMockTodayHours();
  const weeklyData = getMockWeeklyHours();
  const weekTotalHours = weeklyData.reduce((acc, d) => acc + d.hours, 0);
  const todayTarget = 8 * 60; // 8 hours in minutes
  const todayPercentage = Math.min(
    Math.round((todayMinutes / todayTarget) * 100),
    100,
  );
  const timerStore = useTimerStore();
  const { data: session } = useSession();
  const user = session?.user || MOCK_CURRENT_USER;

  const recentEntries = MOCK_TIME_ENTRIES.filter(
    (e) => e.userId === "user-1",
  ).slice(0, 5);
  const recentProjects = MOCK_PROJECTS.filter(
    (p) => p.status === "active",
  ).slice(0, 4);

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
          {new Date().getHours() < 12
            ? "Bom dia"
            : new Date().getHours() < 18
              ? "Boa tarde"
              : "Boa noite"}
          , {user.name?.split(" ")[0]}! 👋
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
              <div className="font-mono text-2xl font-bold text-foreground">
                {formatDuration(todayMinutes)}
              </div>
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
              <div className="font-mono text-2xl font-bold text-foreground">
                {weekTotalHours.toFixed(1)}h
              </div>
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
              <div className="font-mono text-2xl font-bold text-foreground">
                {recentProjects.length}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                <span className="text-green-500">+2</span> desde o mês passado
              </p>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick Timer */}
        <motion.div variants={itemVariants}>
          <Card className="relative overflow-hidden border-brand-500/20 bg-brand-500/5 backdrop-blur">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-brand-400">
                Timer Rápido
              </CardTitle>
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500/10">
                <Image
                  src="/logo-white.svg"
                  alt="Logo"
                  width={11}
                  height={16}
                />
              </div>
            </CardHeader>
            <CardContent>
              {timerStore.isRunning ? (
                <div>
                  <p className="font-mono text-lg font-bold text-foreground">
                    Ativo
                  </p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {timerStore.projectName}
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm text-muted-foreground">
                    Nenhum timer ativo
                  </p>
                  <Button
                    size="sm"
                    className="mt-2 gap-1.5 bg-brand-500 text-white hover:bg-brand-600"
                    onClick={() =>
                      timerStore.start({
                        projectId: "proj-1",
                        projectName: "OptSolv Time Tracker",
                        description: "Desenvolvimento",
                      })
                    }
                  >
                    <Play className="h-3.5 w-3.5" />
                    Iniciar Timer
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Charts and Activity Row */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Weekly Chart */}
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
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weeklyData} barSize={32}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      vertical={false}
                      stroke="rgba(255,255,255,0.05)"
                    />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#a3a3a3" }}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 12, fill: "#a3a3a3" }}
                      domain={[0, 10]}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "#171717",
                        border: "1px solid rgba(255,255,255,0.1)",
                        borderRadius: "8px",
                        fontSize: "12px",
                      }}
                      cursor={{ fill: "rgba(255,255,255,0.03)" }}
                    />
                    <Bar
                      dataKey="hours"
                      fill="#f97316"
                      radius={[6, 6, 0, 0]}
                      name="Horas"
                    />
                    <Bar
                      dataKey="target"
                      fill="rgba(255,255,255,0.05)"
                      radius={[6, 6, 0, 0]}
                      name="Meta"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Pending Timesheets Alert + Recent Projects */}
        <motion.div variants={itemVariants} className="space-y-4">
          {/* Alert */}
          <Card className="border-yellow-500/20 bg-yellow-500/5">
            <CardContent className="flex items-start gap-3 pt-5">
              <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-yellow-500" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Timesheet Pendente
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Sua semana anterior ainda não foi submetida.
                </p>
                <Button
                  variant="link"
                  size="sm"
                  className="mt-1 h-auto p-0 text-xs text-yellow-500"
                  asChild
                >
                  <Link href="/dashboard/timesheets">
                    Submeter agora
                    <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Recent Projects */}
          <Card className="border-border/50 bg-card/80 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="font-display text-base font-semibold">
                Projetos Recentes
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {recentProjects.map((project) => (
                <Link
                  key={project.id}
                  href={`/dashboard/projects/${project.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent"
                >
                  <div
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: project.color }}
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
              ))}
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
            <div className="space-y-3">
              {recentEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 rounded-lg border border-border/30 p-3 transition-colors hover:bg-accent/50"
                >
                  {/* Project dot */}
                  <div
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        MOCK_PROJECTS.find((p) => p.id === entry.projectId)
                          ?.color ?? "#666",
                    }}
                  />

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {entry.description}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {entry.projectName}
                    </p>
                  </div>

                  {/* Duration */}
                  <div className="text-right">
                    <p className="font-mono text-sm font-semibold text-foreground">
                      {formatDecimalHours(entry.duration)}
                    </p>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "mt-0.5 text-[10px] font-medium",
                        getStatusColor(entry.status),
                      )}
                    >
                      {entry.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
