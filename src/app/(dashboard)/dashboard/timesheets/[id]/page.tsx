"use client";

import { eachDayOfInterval, format, getISOWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Check,
  Clock3,
  FolderKanban,
  ReceiptText,
  Send,
  X,
} from "lucide-react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TimesheetEntriesTable } from "@/components/timesheets/TimesheetEntriesTable";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useTimesheetDetail } from "@/hooks/use-timesheets";
import { useSession } from "@/lib/auth-client";
import { isTimesheetSubmittableStatus } from "@/lib/timesheet-status";
import { formatDuration, getPeriodRange, parseLocalDate } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Chart helpers ────────────────────────────────────────────────────────────

interface DayChartEntry {
  label: string;
  dateKey: string;
  billable: number;
  nonBillable: number;
  total: number;
  isToday: boolean;
}

interface ChartTooltipEntry {
  name: string;
  value: number;
  color: string;
  dataKey: string;
}

interface ChartTooltipContentProps {
  active?: boolean;
  payload?: ChartTooltipEntry[];
  label?: string;
}

function DailyHoursTooltip({
  active,
  payload,
  label,
}: ChartTooltipContentProps) {
  if (!active || !payload?.length) return null;

  const billable = payload.find((p) => p.dataKey === "billable")?.value ?? 0;
  const nonBillable =
    payload.find((p) => p.dataKey === "nonBillable")?.value ?? 0;
  const total = billable + nonBillable;

  return (
    <div className="min-w-[160px] rounded-xl border border-white/10 bg-neutral-900 p-3 shadow-xl">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-400">
        {label}
      </p>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-green-500" />
            <span className="text-xs text-neutral-400">Faturável</span>
          </div>
          <span className="font-mono text-xs font-semibold text-white">
            {formatDuration(hoursToMinutes(billable))}
          </span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-orange-500" />
            <span className="text-xs text-neutral-400">Não faturável</span>
          </div>
          <span className="font-mono text-xs font-semibold text-white">
            {formatDuration(hoursToMinutes(nonBillable))}
          </span>
        </div>
        {total > 0 && (
          <div className="mt-2 flex items-center justify-between gap-4 border-t border-white/10 pt-2">
            <span className="text-xs font-medium text-neutral-300">Total</span>
            <span className="font-mono text-xs font-bold text-white">
              {formatDuration(hoursToMinutes(total))}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

function minutesToHours(minutes: number): number {
  return Math.round((minutes / 60) * 100) / 100;
}

function hoursToMinutes(hours: number): number {
  return Math.round(hours * 60);
}

function hoursTickFormatter(value: number): string {
  if (value === 0) return "0";
  return `${value}h`;
}

function parsePeriodLabel(period: string, periodType: string): string {
  if (periodType === "weekly") {
    const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
    if (weekMatch) {
      return `Semana ${Number.parseInt(weekMatch[2], 10)} de ${weekMatch[1]}`;
    }
  }

  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const date = new Date(
      Number.parseInt(monthMatch[1], 10),
      Number.parseInt(monthMatch[2], 10) - 1,
      1,
    );
    return format(date, "MMMM 'de' yyyy", { locale: ptBR });
  }

  return period;
}

function formatRangeLabel(start: string, end: string): string {
  return `${format(parseLocalDate(start), "dd MMM", { locale: ptBR })} - ${format(parseLocalDate(end), "dd MMM yyyy", { locale: ptBR })}`;
}

function formatTimestamp(value: string | null): string {
  if (!value) return "-";

  return format(new Date(value), "dd MMM yyyy 'às' HH:mm", {
    locale: ptBR,
  });
}

export default function TimesheetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const fromParam = searchParams.get("from");

  const backHref = fromParam || "/dashboard/timesheets";
  const backLabel = fromParam?.includes("approvals")
    ? "Aprovação de Timesheets"
    : "Timesheets";

  const { data: session } = useSession();
  const {
    timesheet,
    loading,
    error,
    refetch,
    submitTimesheet,
    approveTimesheet,
    rejectTimesheet,
  } = useTimesheetDetail(id);
  const [submitting, setSubmitting] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [actionLoading, setActionLoading] = useState(false);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-6 w-28" />
        <Skeleton className="h-40 rounded-xl" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            "summary-total",
            "summary-billable",
            "summary-non-billable",
            "summary-target",
          ].map((key) => (
            <Skeleton key={key} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
          <Skeleton className="h-130 rounded-xl" />
          <Skeleton className="h-130 rounded-xl" />
        </div>
      </div>
    );
  }

  if (error || !timesheet) {
    return (
      <div className="space-y-6">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              Não foi possível carregar o timesheet
            </CardTitle>
            <CardDescription>
              {error ?? "O timesheet solicitado não foi encontrado."}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href="/dashboard/timesheets">Voltar</Link>
            </Button>
            <Button
              className="bg-brand-500 text-white hover:bg-brand-600"
              onClick={() => refetch()}
            >
              Tentar novamente
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const { start, end } = getPeriodRange(timesheet.period, timesheet.periodType);
  const rangeStart = parseLocalDate(start);
  const rangeEnd = parseLocalDate(end);
  const days = eachDayOfInterval({ start: rangeStart, end: rangeEnd }).map(
    (date) => {
      const dateKey = format(date, "yyyy-MM-dd");
      const entries = timesheet.entries.filter(
        (entry) => entry.date === dateKey,
      );
      const totalMinutes = entries.reduce(
        (sum, entry) => sum + entry.duration,
        0,
      );
      const billableMinutes = entries.reduce(
        (sum, entry) => sum + (entry.billable ? entry.duration : 0),
        0,
      );

      return {
        date,
        dateKey,
        entries,
        totalMinutes,
        billableMinutes,
      };
    },
  );

  const projectBreakdown = Object.values(
    timesheet.entries.reduce<
      Record<
        string,
        {
          id: string;
          name: string;
          code: string;
          color: string;
          totalMinutes: number;
          billableMinutes: number;
          entriesCount: number;
        }
      >
    >((accumulator, entry) => {
      const existing = accumulator[entry.projectId];
      if (existing) {
        existing.totalMinutes += entry.duration;
        existing.billableMinutes += entry.billable ? entry.duration : 0;
        existing.entriesCount += 1;
        return accumulator;
      }

      accumulator[entry.projectId] = {
        id: entry.project.id,
        name: entry.project.name,
        code: entry.project.code,
        color: entry.project.color,
        totalMinutes: entry.duration,
        billableMinutes: entry.billable ? entry.duration : 0,
        entriesCount: 1,
      };

      return accumulator;
    }, {}),
  ).sort((left, right) => right.totalMinutes - left.totalMinutes);

  const nonBillableMinutes = Math.max(
    timesheet.totalMinutes - timesheet.billableMinutes,
    0,
  );
  const workedDays = days.filter((day) => day.totalMinutes > 0).length;
  const weeklyTargetMinutes =
    timesheet.periodType === "weekly" ? 40 * 60 : null;
  const utilization = weeklyTargetMinutes
    ? Math.min((timesheet.totalMinutes / weeklyTargetMinutes) * 100, 100)
    : null;
  const remainingMinutes = weeklyTargetMinutes
    ? Math.max(weeklyTargetMinutes - timesheet.totalMinutes, 0)
    : null;
  const currentWeek = `${format(new Date(), "yyyy")}-W${getISOWeek(new Date()).toString().padStart(2, "0")}`;
  const isCurrentWeek = timesheet.period === currentWeek;
  const canSubmit = isTimesheetSubmittableStatus(timesheet.status);
  const isResubmission = timesheet.status === "rejected";

  const user = session?.user as { role?: string } | undefined;

  const isManagerOrAdmin = user?.role === "admin" || user?.role === "manager";
  const isOtherUserTimesheet =
    !!timesheet?.userId && timesheet.userId !== session?.user?.id;
  const isFromApprovals = fromParam?.includes("approvals");

  const canApproveOrReject =
    timesheet && (isManagerOrAdmin || isOtherUserTimesheet || isFromApprovals);

  const canApprove =
    canApproveOrReject &&
    (timesheet.status === "submitted" ||
      timesheet.status === "open" ||
      timesheet.status === "rejected");

  const canReject = canApproveOrReject && timesheet.status === "submitted";

  const handleApprove = async () => {
    setActionLoading(true);
    try {
      await approveTimesheet();
      toast.success("Timesheet aprovado com sucesso!");
      setApproveOpen(false);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao aprovar timesheet",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast.error("Por favor, informe o motivo da rejeição.");
      return;
    }

    setActionLoading(true);
    try {
      await rejectTimesheet(rejectionReason.trim());
      toast.success("Timesheet rejeitado com sucesso.");
      setRejectOpen(false);
      setRejectionReason("");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Erro ao rejeitar timesheet",
      );
    } finally {
      setActionLoading(false);
    }
  };

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      await submitTimesheet();
      toast.success(
        isResubmission
          ? "Timesheet submetido novamente com sucesso."
          : "Timesheet submetido com sucesso.",
      );
    } catch (submitError) {
      toast.error(
        submitError instanceof Error
          ? submitError.message
          : isResubmission
            ? "Não foi possível submeter o timesheet novamente."
            : "Não foi possível submeter o timesheet.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="min-w-0 space-y-6"
    >
      <motion.div variants={itemVariants} className="space-y-4">
        <Link
          href={backHref}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {backLabel}
        </Link>

        <Card className="border-border/60 bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3 min-w-0 flex-1">
                {timesheet.user && (
                  <div className="inline-flex items-center gap-3 rounded-xl border border-border/40 bg-muted/40 px-3.5 py-2">
                    <UserAvatar
                      image={timesheet.user.image}
                      name={timesheet.user.name ?? "Usuário"}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                        Colaborador
                      </p>
                      <p className="text-sm font-semibold text-foreground truncate">
                        {timesheet.user.name}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-2xl font-bold text-foreground">
                    {parsePeriodLabel(timesheet.period, timesheet.periodType)}
                  </h1>
                  <TimesheetStatusBadge status={timesheet.status} />
                  {isCurrentWeek && (
                    <Badge className="bg-brand-500 text-white">
                      Semana atual
                    </Badge>
                  )}
                </div>

                <p className="max-w-2xl text-sm text-muted-foreground">
                  Visualização completa das horas registradas no período, com
                  totais, distribuição por dia e detalhamento de cada entrada.
                </p>

                <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <CalendarDays className="h-4 w-4" />
                    {formatRangeLabel(start, end)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <ReceiptText className="h-4 w-4" />
                    {timesheet.entries.length}{" "}
                    {timesheet.entries.length === 1 ? "entrada" : "entradas"}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 self-start lg:ml-auto">
                {canApprove && (
                  <Button
                    className="gap-1.5 bg-green-600 text-white hover:bg-green-700 font-medium"
                    onClick={() => setApproveOpen(true)}
                    disabled={actionLoading}
                  >
                    <Check className="h-4 w-4" />
                    Aprovar
                  </Button>
                )}

                {canReject && (
                  <Button
                    variant="outline"
                    className="gap-1.5 border-red-500/30 text-red-600 dark:text-red-400 hover:bg-red-500/10 font-medium"
                    onClick={() => setRejectOpen(true)}
                    disabled={actionLoading}
                  >
                    <X className="h-4 w-4" />
                    Rejeitar
                  </Button>
                )}

                {canSubmit && (
                  <Button
                    className="gap-2 bg-brand-500 text-white hover:bg-brand-600 font-medium"
                    disabled={submitting || timesheet.entries.length === 0}
                    onClick={handleSubmit}
                  >
                    <Send className="h-4 w-4" />
                    {submitting
                      ? isResubmission
                        ? "Submetendo novamente..."
                        : "Submetendo..."
                      : isResubmission
                        ? "Submeter timesheet novamente"
                        : "Submeter timesheet"}
                  </Button>
                )}
              </div>
            </div>
          </CardHeader>

          {timesheet.status === "rejected" && timesheet.rejectionReason && (
            <CardContent className="pt-0">
              <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-4 w-4 text-destructive" />
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Timesheet rejeitado
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {timesheet.rejectionReason}
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      </motion.div>

      <motion.div
        variants={itemVariants}
        className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <Card className="border-border/50 bg-card/70">
          <CardHeader className="gap-1">
            <CardDescription>Total registrado</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatDuration(timesheet.totalMinutes)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Horas consolidadas no período atual.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/70">
          <CardHeader className="gap-1">
            <CardDescription>Horas faturáveis</CardDescription>
            <CardTitle className="font-mono text-2xl text-green-600 dark:text-green-400">
              {formatDuration(timesheet.billableMinutes)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {timesheet.totalMinutes > 0
                ? `${Math.round((timesheet.billableMinutes / timesheet.totalMinutes) * 100)}% do total da semana.`
                : "Nenhuma hora faturável registrada."}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/70">
          <CardHeader className="gap-1">
            <CardDescription>Não faturáveis</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {formatDuration(nonBillableMinutes)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {workedDays}{" "}
              {workedDays === 1
                ? "dia com apontamento"
                : "dias com apontamento"}{" "}
              no período.
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50 bg-card/70">
          <CardHeader className="gap-1">
            <CardDescription>Meta semanal</CardDescription>
            <CardTitle className="font-mono text-2xl">
              {weeklyTargetMinutes ? formatDuration(weeklyTargetMinutes) : "-"}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {utilization !== null ? (
              <>
                <Progress value={utilization} className="h-2" />
                <p className="text-sm text-muted-foreground">
                  {remainingMinutes === 0
                    ? "Meta atingida para a semana."
                    : `${formatDuration(remainingMinutes ?? 0)} restantes para 40h.`}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                Meta não aplicável para este tipo de período.
              </p>
            )}
          </CardContent>
        </Card>
      </motion.div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <motion.div
          variants={itemVariants}
          className="order-1 min-w-0 space-y-6"
        >
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <CardTitle className="font-display text-lg">
                    {timesheet.periodType === "weekly"
                      ? "Dias da semana"
                      : "Dias do período"}
                  </CardTitle>
                  <CardDescription className="mt-1">
                    Horas faturáveis e não faturáveis por dia do período.
                  </CardDescription>
                </div>
                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-green-500" />
                    Faturável
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm bg-orange-500" />
                    Não faturável
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pb-2 pt-0">
              {(() => {
                const chartData: DayChartEntry[] = days.map((day) => ({
                  label: format(day.date, "EEE", { locale: ptBR }),
                  dateKey: day.dateKey,
                  billable: minutesToHours(day.billableMinutes),
                  nonBillable: minutesToHours(
                    day.totalMinutes - day.billableMinutes,
                  ),
                  total: minutesToHours(day.totalMinutes),
                  isToday: day.dateKey === format(new Date(), "yyyy-MM-dd"),
                }));

                const maxHours = Math.max(
                  ...chartData.map((d) => d.billable + d.nonBillable),
                  1,
                );
                const yMax = Math.ceil(maxHours / 2) * 2 + 2;

                return (
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                      barCategoryGap="28%"
                      barGap={0}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(255,255,255,0.05)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="label"
                        tick={{
                          fontSize: 11,
                          fill: "currentColor",
                          className: "text-muted-foreground",
                        }}
                        axisLine={false}
                        tickLine={false}
                        dy={6}
                      />
                      <YAxis
                        tickFormatter={hoursTickFormatter}
                        tick={{
                          fontSize: 11,
                          fill: "currentColor",
                          className: "text-muted-foreground",
                        }}
                        axisLine={false}
                        tickLine={false}
                        domain={[0, yMax]}
                        allowDecimals={false}
                      />
                      <Tooltip
                        content={<DailyHoursTooltip />}
                        cursor={{
                          fill: "rgba(255,255,255,0.04)",
                          radius: 8,
                        }}
                      />
                      <Bar
                        dataKey="billable"
                        name="Faturável"
                        stackId="hours"
                        radius={[0, 0, 0, 0]}
                        maxBarSize={52}
                        isAnimationActive
                        animationDuration={600}
                        animationEasing="ease-out"
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={`billable-${entry.dateKey}`}
                            fill={
                              entry.isToday ? "#16a34a" : "rgba(34,197,94,0.72)"
                            }
                          />
                        ))}
                      </Bar>
                      <Bar
                        dataKey="nonBillable"
                        name="Não faturável"
                        stackId="hours"
                        radius={[6, 6, 0, 0]}
                        maxBarSize={52}
                        isAnimationActive
                        animationDuration={700}
                        animationEasing="ease-out"
                      >
                        {chartData.map((entry) => (
                          <Cell
                            key={`nonbillable-${entry.dateKey}`}
                            fill={
                              entry.isToday
                                ? "#f97316"
                                : "rgba(249,115,22,0.55)"
                            }
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                );
              })()}

              {/* Daily summary row */}
              <div
                className={`mt-1 grid gap-1`}
                style={{
                  gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))`,
                }}
              >
                {days.map((day) => {
                  const hasHours = day.totalMinutes > 0;
                  const isToday =
                    day.dateKey === format(new Date(), "yyyy-MM-dd");
                  return (
                    <div
                      key={day.dateKey}
                      className="flex flex-col items-center gap-0.5 py-1"
                    >
                      <span
                        className={`font-mono text-[10px] font-semibold tabular-nums ${
                          isToday
                            ? "text-brand-500"
                            : hasHours
                              ? "text-foreground"
                              : "text-muted-foreground/50"
                        }`}
                      >
                        {hasHours ? formatDuration(day.totalMinutes) : "—"}
                      </span>
                      <Badge
                        variant="outline"
                        className={`h-4 rounded-sm px-1 text-[9px] font-medium ${
                          hasHours
                            ? "border-border/60 text-muted-foreground"
                            : "border-transparent text-transparent"
                        }`}
                      >
                        {hasHours
                          ? `${day.entries.length} registros`
                          : "0 registros"}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="order-3 min-w-0 space-y-6 xl:order-2"
        >
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <FolderKanban className="h-4 w-4" />
                Distribuição por projeto
              </CardTitle>
              <CardDescription>
                Como as horas desta semana foram distribuídas entre os projetos.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {projectBreakdown.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma entrada vinculada a projeto neste período.
                </p>
              ) : (
                projectBreakdown.map((project) => {
                  const share = timesheet.totalMinutes
                    ? (project.totalMinutes / timesheet.totalMinutes) * 100
                    : 0;

                  return (
                    <div key={project.id} className="space-y-2">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: project.color }}
                            />
                            <p className="truncate text-sm font-medium text-foreground">
                              {project.name}
                            </p>
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {project.entriesCount}{" "}
                            {project.entriesCount === 1
                              ? "registro"
                              : "registros"}
                          </p>
                        </div>
                        <div className="shrink-0 text-left sm:text-right">
                          <p className="font-mono text-sm font-semibold text-foreground">
                            {formatDuration(project.totalMinutes)}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {Math.round(share)}% do período
                          </p>
                        </div>
                      </div>
                      <Progress value={share} className="h-2" />
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-display text-lg">
                <Clock3 className="h-4 w-4" />
                Informações do timesheet
              </CardTitle>
              <CardDescription>
                Metadados do período e histórico de submissão e aprovação.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              {timesheet.user && (
                <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3 border-b border-border/40 pb-3">
                  <span className="text-muted-foreground">Colaborador</span>
                  <div className="flex items-center gap-2 sm:justify-end">
                    <UserAvatar
                      image={timesheet.user.image}
                      name={timesheet.user.name ?? "Usuário"}
                      size="sm"
                    />
                    <span className="font-medium text-foreground">
                      {timesheet.user.name}
                    </span>
                  </div>
                </div>
              )}
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-muted-foreground">Período</span>
                <span className="text-left font-medium text-foreground sm:max-w-[65%] sm:text-right">
                  {parsePeriodLabel(timesheet.period, timesheet.periodType)}
                </span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-muted-foreground">Intervalo</span>
                <span className="text-left font-medium text-foreground sm:max-w-[65%] sm:text-right">
                  {formatRangeLabel(start, end)}
                </span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-muted-foreground">Criado em</span>
                <span className="text-left font-medium text-foreground sm:max-w-[65%] sm:text-right">
                  {formatTimestamp(timesheet.createdAt)}
                </span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-muted-foreground">
                  Última atualização
                </span>
                <span className="text-left font-medium text-foreground sm:max-w-[65%] sm:text-right">
                  {formatTimestamp(timesheet.updatedAt)}
                </span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-muted-foreground">Submetido em</span>
                <span className="text-left font-medium text-foreground sm:max-w-[65%] sm:text-right">
                  {timesheet.submittedAt
                    ? formatTimestamp(timesheet.submittedAt)
                    : "Ainda não submetido"}
                </span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-muted-foreground">Aprovado em</span>
                <span className="text-left font-medium text-foreground sm:max-w-[65%] sm:text-right">
                  {timesheet.approvedAt
                    ? formatTimestamp(timesheet.approvedAt)
                    : "Pendente"}
                </span>
              </div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                <span className="text-muted-foreground">Aprovador</span>
                <span className="text-left font-medium text-foreground sm:max-w-[65%] sm:text-right">
                  {timesheet.approver?.name ?? "Não definido"}
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          variants={itemVariants}
          className="order-2 min-w-0 xl:order-3 xl:col-span-2"
        >
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                Detalhamento das entradas
              </CardTitle>
              <CardDescription>
                Consulta completa dos registros lançados no período.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <TimesheetEntriesTable entries={timesheet.entries} />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Approval Modal */}
      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Aprovar Timesheet</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja aprovar o timesheet de{" "}
              <strong>{timesheet.user?.name ?? "Colaborador"}</strong> referente
              a{" "}
              <strong>
                {parsePeriodLabel(timesheet.period, timesheet.periodType)}
              </strong>{" "}
              ({formatDuration(timesheet.totalMinutes)})?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionLoading}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handleApprove}
              disabled={actionLoading}
              className="bg-green-600 text-white hover:bg-green-700"
            >
              {actionLoading ? "Aprovando..." : "Confirmar Aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Rejection Modal */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar Timesheet</DialogTitle>
            <DialogDescription>
              Informe o motivo da rejeição do timesheet de{" "}
              <strong>{timesheet.user?.name ?? "Colaborador"}</strong>. O
              colaborador receberá esse motivo para realizar os ajustes.
            </DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Descreva detalhadamente o motivo da rejeição (ex: Horas lançadas no projeto incorreto)..."
              rows={4}
              className="resize-none"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRejectOpen(false)}
              disabled={actionLoading}
            >
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={actionLoading || !rejectionReason.trim()}
            >
              {actionLoading ? "Rejeitando..." : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
