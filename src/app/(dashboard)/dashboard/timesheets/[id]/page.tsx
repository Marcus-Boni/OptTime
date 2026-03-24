"use client";

import { eachDayOfInterval, format, getISOWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  Clock3,
  FolderKanban,
  ReceiptText,
  Send,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { TimesheetEntriesTable } from "@/components/timesheets/TimesheetEntriesTable";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimesheetDetail } from "@/hooks/use-timesheets";
import { formatDuration, getPeriodRange, parseLocalDate } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

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
  const { timesheet, loading, error, refetch, submitTimesheet } =
    useTimesheetDetail(id);
  const [submitting, setSubmitting] = useState(false);

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
          href="/dashboard/timesheets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Timesheets
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

  const handleSubmit = async () => {
    setSubmitting(true);

    try {
      await submitTimesheet();
      toast.success("Timesheet submetido com sucesso.");
    } catch (submitError) {
      toast.error(
        submitError instanceof Error
          ? submitError.message
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
          href="/dashboard/timesheets"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Timesheets
        </Link>

        <Card className="border-border/60 bg-card/80 backdrop-blur">
          <CardHeader>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
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

              {(timesheet.status === "open" ||
                timesheet.status === "rejected") && (
                <Button
                  className="gap-2 self-start bg-brand-500 text-white hover:bg-brand-600 lg:ml-auto"
                  disabled={submitting || timesheet.entries.length === 0}
                  onClick={handleSubmit}
                >
                  <Send className="h-4 w-4" />
                  {submitting ? "Submetendo..." : "Submeter timesheet"}
                </Button>
              )}
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
        <motion.div variants={itemVariants} className="min-w-0 space-y-6">
          <Card className="border-border/60 bg-card/80">
            <CardHeader>
              <CardTitle className="font-display text-lg">
                {timesheet.periodType === "weekly"
                  ? "Dias da semana"
                  : "Dias do período"}
              </CardTitle>
              <CardDescription>
                Totais diários com separação entre horas faturáveis e não
                faturáveis.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2 2xl:grid-cols-3">
              {days.map((day) => (
                <div
                  key={day.dateKey}
                  className="rounded-xl border border-border/60 bg-background/50 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        {format(day.date, "EEEE", { locale: ptBR })}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {format(day.date, "dd 'de' MMMM", { locale: ptBR })}
                      </p>
                    </div>
                    {day.totalMinutes > 0 ? (
                      <Badge variant="outline">
                        {day.entries.length} regs.
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-muted-foreground"
                      >
                        Sem horas
                      </Badge>
                    )}
                  </div>

                  <Separator className="my-4" />

                  <div className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <span className="font-mono font-semibold text-foreground">
                        {formatDuration(day.totalMinutes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Faturável</span>
                      <span className="font-mono text-green-600 dark:text-green-400">
                        {formatDuration(day.billableMinutes)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Não faturável
                      </span>
                      <span className="font-mono text-foreground">
                        {formatDuration(day.totalMinutes - day.billableMinutes)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

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

        <motion.div variants={itemVariants} className="min-w-0 space-y-6">
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
      </div>
    </motion.div>
  );
}
