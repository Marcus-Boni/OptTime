"use client";

import { format, getISOWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { AlertTriangle, ArrowRight, Send } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
import { WeekProgressBar } from "@/components/timesheets/WeekProgressBar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { type Timesheet, useTimesheets } from "@/hooks/use-timesheets";
import { formatDuration, parseLocalDate } from "@/lib/utils";

// ─── Animation variants ───────────────────────────────────────────────────────

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

// ─── Helper functions ─────────────────────────────────────────────────────────

function formatPeriodLabel(period: string): string {
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch)
    return `Semana ${parseInt(weekMatch[2], 10)} de ${weekMatch[1]}`;
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const months = [
      "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
      "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
    ];
    return `${months[parseInt(monthMatch[2], 10) - 1]} de ${monthMatch[1]}`;
  }
  return period;
}

function formatDateRange(start: string, end: string): string {
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  return `${format(startDate, "d MMM", { locale: ptBR })} – ${format(endDate, "d MMM yyyy", { locale: ptBR })}`;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SubmitButton({
  ts,
  submitting,
  onSubmit,
}: {
  ts: Timesheet;
  submitting: string | null;
  onSubmit: (id: string) => Promise<void>;
}) {
  const isEmpty = ts.totalMinutes === 0;
  const isSubmitting = submitting === ts.id;

  if (isEmpty) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button
              size="sm"
              className="gap-1 bg-brand-500 text-white hover:bg-brand-600"
              disabled
            >
              <Send className="h-3.5 w-3.5" />
              Submeter
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Registre horas antes de submeter</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Button
      size="sm"
      className="gap-1 bg-brand-500 text-white hover:bg-brand-600"
      disabled={isSubmitting}
      onClick={() => onSubmit(ts.id)}
    >
      <Send className="h-3.5 w-3.5" />
      {isSubmitting ? "Enviando…" : "Submeter"}
    </Button>
  );
}

interface TimesheetCardProps {
  ts: Timesheet;
  submitting: string | null;
  onSubmit: (id: string) => Promise<void>;
}

function CurrentWeekCard({ ts, submitting, onSubmit }: TimesheetCardProps) {
  return (
    <Card className="border-brand-500/40 bg-brand-500/5 backdrop-blur">
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-foreground">
                {formatPeriodLabel(ts.period)}
              </p>
              <TimesheetStatusBadge status={ts.status} />
              <Badge className="bg-brand-500 text-white text-xs">
                Semana atual
              </Badge>
            </div>

            <p className="text-xs text-muted-foreground">
              {formatDateRange(ts.periodStart, ts.periodEnd)}
            </p>

            {(ts.status === "open" || ts.status === "rejected") && (
              <WeekProgressBar
                totalMinutes={ts.totalMinutes}
                weeklyCapacity={ts.weeklyCapacity}
              />
            )}

            {ts.rejectionReason && (
              <div className="flex items-start gap-1.5 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{ts.rejectionReason}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {formatDuration(ts.totalMinutes)} total ·{" "}
              {formatDuration(ts.billableMinutes)} faturável
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {(ts.status === "open" || ts.status === "rejected") && (
              <SubmitButton ts={ts} submitting={submitting} onSubmit={onSubmit} />
            )}
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/dashboard/timesheets/${ts.id}`} aria-label="Ver detalhes do timesheet">
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function PendingTimesheetCard({ ts, submitting, onSubmit }: TimesheetCardProps) {
  return (
    <Card className="border-border/40 bg-card/80 backdrop-blur transition-colors hover:border-border/60">
      <CardContent className="py-4">
        <div className="flex items-start gap-4">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-medium text-foreground">
                {formatPeriodLabel(ts.period)}
              </p>
              <TimesheetStatusBadge status={ts.status} />
            </div>

            <p className="text-xs text-muted-foreground">
              {formatDateRange(ts.periodStart, ts.periodEnd)}
            </p>

            <WeekProgressBar
              totalMinutes={ts.totalMinutes}
              weeklyCapacity={ts.weeklyCapacity}
            />

            {ts.rejectionReason && (
              <div className="flex items-start gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 p-2 text-xs text-destructive">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                <span>{ts.rejectionReason}</span>
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              {formatDuration(ts.totalMinutes)} total ·{" "}
              {formatDuration(ts.billableMinutes)} faturável
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <SubmitButton ts={ts} submitting={submitting} onSubmit={onSubmit} />
            <Button variant="ghost" size="icon" asChild>
              <Link href={`/dashboard/timesheets/${ts.id}`} aria-label="Ver detalhes do timesheet">
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HistoryTimesheetCard({ ts }: { ts: Timesheet }) {
  return (
    <Card className="border-border/30 bg-card/70 backdrop-blur transition-colors hover:border-border/50">
      <CardContent className="flex items-center gap-4 py-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium text-foreground">
              {formatPeriodLabel(ts.period)}
            </p>
            <TimesheetStatusBadge status={ts.status} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {formatDateRange(ts.periodStart, ts.periodEnd)} ·{" "}
            {formatDuration(ts.totalMinutes)} total
          </p>
        </div>

        <Button variant="ghost" size="icon" className="shrink-0" asChild>
          <Link href={`/dashboard/timesheets/${ts.id}`} aria-label="Ver detalhes do timesheet">
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function TimesheetsPage() {
  const router = useRouter();
  const { timesheets, loading, getOrCreateTimesheet, submitTimesheet } =
    useTimesheets();
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [openingCurrentWeek, setOpeningCurrentWeek] = useState(false);
  const [visibleHistoryCount, setVisibleHistoryCount] = useState(10);

  const currentPeriod = useMemo(() => {
    const now = new Date();
    return `${format(now, "yyyy")}-W${getISOWeek(now).toString().padStart(2, "0")}`;
  }, []);

  const currentWeekTs = timesheets.find((ts) => ts.period === currentPeriod);
  const pendingTimesheets = timesheets.filter(
    (ts) =>
      ts.period !== currentPeriod &&
      (ts.status === "open" || ts.status === "rejected"),
  );
  const historyTimesheets = timesheets.filter(
    (ts) => ts.status === "submitted" || ts.status === "approved",
  );
  const visibleHistory = historyTimesheets.slice(0, visibleHistoryCount);
  const remainingHistory = historyTimesheets.length - visibleHistoryCount;

  const handleOpenCurrentWeek = useCallback(async () => {
    setOpeningCurrentWeek(true);
    try {
      const timesheet = await getOrCreateTimesheet(currentPeriod, "weekly");
      router.push(`/dashboard/timesheets/${timesheet.id}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Não foi possível abrir a semana atual.",
      );
    } finally {
      setOpeningCurrentWeek(false);
    }
  }, [getOrCreateTimesheet, currentPeriod, router]);

  const handleSubmit = useCallback(
    async (id: string) => {
      setSubmitting(id);
      try {
        await submitTimesheet(id);
      } catch (err) {
        toast.error(
          err instanceof Error ? err.message : "Não foi possível submeter o timesheet.",
        );
      } finally {
        setSubmitting(null);
      }
    },
    [submitTimesheet],
  );

  return (
    <TooltipProvider>
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* Header */}
      <motion.div
        variants={itemVariants}
        className="flex items-center justify-between"
      >
        <div>
          <h1 className="font-display text-2xl font-bold text-foreground">
            Timesheets
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Submeta suas horas semanais para aprovação.
          </p>
        </div>
        <Button
          className="bg-brand-500 text-white hover:bg-brand-600"
          disabled={openingCurrentWeek}
          onClick={handleOpenCurrentWeek}
        >
          {openingCurrentWeek ? "Abrindo…" : "Semana Atual"}
        </Button>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      ) : timesheets.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-dashed border-border py-16 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Nenhum timesheet encontrado. Use o botão "Semana Atual" para começar.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-8"
        >
          {/* Zona 1: Semana Atual */}
          {currentWeekTs && (
            <motion.div variants={itemVariants}>
              <CurrentWeekCard
                ts={currentWeekTs}
                submitting={submitting}
                onSubmit={handleSubmit}
              />
            </motion.div>
          )}

          {/* Zona 2: Ações Pendentes */}
          {pendingTimesheets.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Ações pendentes
                </h2>
                <Badge variant="outline" className="text-xs">
                  {pendingTimesheets.length}
                </Badge>
              </div>
              <div className="space-y-3">
                {pendingTimesheets.map((ts) => (
                  <PendingTimesheetCard
                    key={ts.id}
                    ts={ts}
                    submitting={submitting}
                    onSubmit={handleSubmit}
                  />
                ))}
              </div>
            </motion.div>
          )}

          {/* Zona 3: Histórico */}
          {historyTimesheets.length > 0 && (
            <motion.div variants={itemVariants} className="space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-foreground">
                  Histórico
                </h2>
                <Badge variant="outline" className="text-xs">
                  {historyTimesheets.length}
                </Badge>
              </div>
              <div className="space-y-2">
                {visibleHistory.map((ts) => (
                  <HistoryTimesheetCard
                    key={ts.id}
                    ts={ts}
                  />
                ))}
              </div>
              {remainingHistory > 0 && (
                <div className="flex justify-center pt-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVisibleHistoryCount((c) => c + 10)}
                  >
                    Ver mais ({remainingHistory})
                  </Button>
                </div>
              )}
            </motion.div>
          )}
        </motion.div>
      )}
    </motion.div>
    </TooltipProvider>
  );
}
