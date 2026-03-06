"use client";

import { format, getISOWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { motion } from "framer-motion";
import { ArrowRight, Send } from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useTimesheets } from "@/hooks/use-timesheets";
import { formatDuration } from "@/lib/utils";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};
const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function TimesheetsPage() {
  const { timesheets, loading, getOrCreateTimesheet, submitTimesheet } =
    useTimesheets();
  const [submitting, setSubmitting] = useState<string | null>(null);

  // Now the current week's timesheet is automatically created and returned by the API
  const currentPeriod = `${format(new Date(), "yyyy")}-W${getISOWeek(new Date()).toString().padStart(2, "0")}`;

  const parsePeriodLabel = useCallback(
    (period: string): string => {
      const isCurrent = period === currentPeriod;
      const suffix = isCurrent ? " (Semana Atual)" : "";

      const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
      if (weekMatch)
        return `Semana ${parseInt(weekMatch[2])} de ${weekMatch[1]}${suffix}`;
      const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
      if (monthMatch) {
        const months = [
          "Janeiro",
          "Fevereiro",
          "Março",
          "Abril",
          "Maio",
          "Junho",
          "Julho",
          "Agosto",
          "Setembro",
          "Outubro",
          "Novembro",
          "Dezembro",
        ];
        return `${months[parseInt(monthMatch[2]) - 1]} de ${monthMatch[1]}${suffix}`;
      }
      return period + suffix;
    },
    [currentPeriod],
  );

  // Get-or-create the current week's timesheet and navigate to it
  const handleOpenCurrentWeek = useCallback(async () => {
    const period = currentPeriod;
    await getOrCreateTimesheet(period, "weekly");
  }, [getOrCreateTimesheet, currentPeriod]);

  const handleSubmit = useCallback(
    async (id: string) => {
      setSubmitting(id);
      try {
        await submitTimesheet(id);
      } finally {
        setSubmitting(null);
      }
    },
    [submitTimesheet],
  );

  return (
    <motion.div
      variants={containerVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
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
          onClick={handleOpenCurrentWeek}
        >
          Semana Atual
        </Button>
      </motion.div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : timesheets.length === 0 ? (
        <motion.div
          variants={itemVariants}
          className="rounded-lg border border-dashed border-border py-16 text-center"
        >
          <p className="text-sm text-muted-foreground">
            Nenhum timesheet encontrado.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {timesheets.map((ts) => (
            <motion.div key={ts.id} variants={itemVariants}>
              <Card className="border-border/30 bg-card/80 backdrop-blur transition-colors hover:border-border/50">
                <CardContent className="flex items-center gap-4 py-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">
                      {parsePeriodLabel(ts.period)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatDuration(ts.totalMinutes)} total ·{" "}
                      {formatDuration(ts.billableMinutes)} faturável
                    </p>
                    {ts.rejectionReason && (
                      <p className="mt-1 text-xs text-destructive">
                        Rejeitado: {ts.rejectionReason}
                      </p>
                    )}
                  </div>

                  <TimesheetStatusBadge status={ts.status} />

                  {ts.status === "open" && (
                    <Button
                      size="sm"
                      className="gap-1 bg-brand-500 text-white hover:bg-brand-600"
                      disabled={submitting === ts.id}
                      onClick={() => handleSubmit(ts.id)}
                    >
                      <Send className="h-3.5 w-3.5" />
                      {submitting === ts.id ? "Enviando…" : "Submeter"}
                    </Button>
                  )}

                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    asChild
                  >
                    <Link href={`/dashboard/timesheets/${ts.id}`}>
                      <ArrowRight className="h-4 w-4" />
                    </Link>
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
