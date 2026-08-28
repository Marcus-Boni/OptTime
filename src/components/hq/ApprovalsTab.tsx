"use client";

import { motion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCheck,
  CheckCircle2,
  Clock,
  Inbox,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ApprovalsController } from "@/hooks/use-hq";
import { cn, formatDuration } from "@/lib/utils";
import type { AnomalySeverity, ApprovalInsight } from "@/types/hq";

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
  },
};

/**
 * Entry animation for the conditional sections.
 *
 * Self-contained rather than inherited: the parent's staggered variants
 * orchestrate only on mount, so a section that appears later — when a refresh
 * turns an empty group into a populated one — would inherit `hidden` and stay
 * invisible.
 */
const ENTRY_ANIMATION = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const },
};

const SEVERITY_STYLES: Record<AnomalySeverity, string> = {
  critical: "bg-red-500/10 text-red-500 dark:text-red-400",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  info: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
};

export interface ApprovalsTabProps {
  controller: ApprovalsController;
}

interface RejectDialogState {
  timesheetId: string;
  userName: string;
}

function ProjectDots({ projects }: { projects: ApprovalInsight["projects"] }) {
  return (
    <span className="flex items-center gap-1">
      {projects.slice(0, 4).map((project) => (
        <Tooltip key={`${project.name}-${project.minutes}`}>
          <TooltipTrigger asChild>
            <span
              role="img"
              className="size-2 rounded-full"
              style={{ backgroundColor: project.color }}
              aria-label={project.name}
            />
          </TooltipTrigger>
          <TooltipContent side="top">
            <p className="text-xs">
              {project.name} · {formatDuration(project.minutes)}
            </p>
          </TooltipContent>
        </Tooltip>
      ))}
      {projects.length > 4 ? (
        <span className="text-[10px] text-muted-foreground">
          +{projects.length - 4}
        </span>
      ) : null}
    </span>
  );
}

function InsightCard({
  insight,
  onApprove,
  onReject,
  busy,
}: {
  insight: ApprovalInsight;
  onApprove: (insight: ApprovalInsight) => void;
  onReject: (insight: ApprovalInsight) => void;
  busy: boolean;
}) {
  return (
    <Card className="gap-0 py-4 transition-colors duration-150 hover:border-brand-500/30">
      <CardContent className="space-y-3 px-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <UserAvatar
              name={insight.userName}
              image={insight.userImage}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{insight.userName}</p>
              <p className="text-xs text-muted-foreground">
                {insight.periodLabel}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3">
            <ProjectDots projects={insight.projects} />
            <span className="font-mono text-sm font-semibold">
              {formatDuration(insight.totalMinutes)}
            </span>
          </div>
        </div>

        {insight.anomalies.length > 0 ? (
          <ul className="space-y-1.5">
            {insight.anomalies.map((anomaly) => (
              <li
                key={`${anomaly.kind}-${anomaly.entryIds.length}`}
                className={cn(
                  "flex items-start gap-2 rounded-lg px-2.5 py-1.5 text-xs",
                  SEVERITY_STYLES[anomaly.severity],
                )}
              >
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <span className="font-semibold">{anomaly.label}:</span>{" "}
                  {anomaly.detail}
                </span>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex items-center justify-between gap-2">
          <Link
            href={`/dashboard/timesheets/${insight.timesheetId}`}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-brand-500"
          >
            Ver lançamentos
            <ArrowUpRight className="size-3" aria-hidden="true" />
          </Link>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => onReject(insight)}
              className="text-red-500 hover:text-red-500 dark:text-red-400"
            >
              <XCircle className="size-4" aria-hidden="true" />
              Rejeitar
            </Button>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => onApprove(insight)}
              className="bg-brand-500 text-white hover:bg-brand-600"
            >
              <CheckCircle2 className="size-4" aria-hidden="true" />
              Aprovar
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApprovalsTab({ controller }: ApprovalsTabProps) {
  const {
    data,
    isLoading,
    error,
    refresh,
    approveBatch,
    approveOne,
    rejectOne,
  } = controller;

  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [rejectState, setRejectState] = useState<RejectDialogState | null>(
    null,
  );
  const [rejectReason, setRejectReason] = useState("");
  const [rejectSubmitting, setRejectSubmitting] = useState(false);
  const [confirmApprove, setConfirmApprove] = useState<ApprovalInsight | null>(
    null,
  );

  const markBusy = useCallback((id: string, busy: boolean) => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleApprove = useCallback(
    async (insight: ApprovalInsight) => {
      markBusy(insight.timesheetId, true);
      try {
        await approveOne(insight.timesheetId);
        toast.success(`Timesheet de ${insight.userName} aprovado.`);
      } catch (err: unknown) {
        console.error("[ApprovalsTab] handleApprove:", err);
        toast.error(
          err instanceof Error ? err.message : "Erro ao aprovar timesheet.",
        );
      } finally {
        markBusy(insight.timesheetId, false);
      }
    },
    [approveOne, markBusy],
  );

  const handleRequestApprove = useCallback(
    (insight: ApprovalInsight) => {
      if (insight.conformant) {
        void handleApprove(insight);
      } else {
        setConfirmApprove(insight);
      }
    },
    [handleApprove],
  );

  const handleBatchApprove = useCallback(async () => {
    const conformant = data?.pending.filter((item) => item.conformant) ?? [];
    if (conformant.length === 0) return;

    setBatchRunning(true);
    try {
      const results = await approveBatch(
        conformant.map((item) => item.timesheetId),
      );
      const approved = results.filter((item) => item.status === "approved");
      const failed = results.length - approved.length;

      if (failed === 0) {
        toast.success(
          `${approved.length} timesheet${approved.length === 1 ? "" : "s"} aprovado${approved.length === 1 ? "" : "s"} em lote.`,
        );
      } else {
        toast.warning(
          `${approved.length} aprovados, ${failed} falharam — confira a lista.`,
        );
      }
    } catch (err: unknown) {
      console.error("[ApprovalsTab] handleBatchApprove:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro na aprovação em lote.",
      );
    } finally {
      setBatchRunning(false);
    }
  }, [data, approveBatch]);

  const handleRejectSubmit = useCallback(async () => {
    if (!rejectState) return;
    if (rejectReason.trim().length < 10) {
      toast.error("Descreva o motivo com pelo menos 10 caracteres.");
      return;
    }

    setRejectSubmitting(true);
    try {
      await rejectOne(rejectState.timesheetId, rejectReason.trim());
      toast.success(
        `Timesheet de ${rejectState.userName} rejeitado — a pessoa será orientada a ajustar.`,
      );
      setRejectState(null);
      setRejectReason("");
    } catch (err: unknown) {
      console.error("[ApprovalsTab] handleRejectSubmit:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro ao rejeitar timesheet.",
      );
    } finally {
      setRejectSubmitting(false);
    }
  }, [rejectState, rejectReason, rejectOne]);

  if (isLoading) {
    return (
      <output aria-label="Carregando aprovações" className="block space-y-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </output>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
          <AlertTriangle className="size-8 text-red-400" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            <RefreshCw className="size-4" aria-hidden="true" />
            Tentar novamente
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (!data || data.pending.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-16 text-center">
          <Inbox className="size-8 text-emerald-500" aria-hidden="true" />
          <p className="font-medium">Caixa de aprovações zerada 🎉</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Nenhum timesheet aguardando decisão. Novos submits aparecem aqui com
            a triagem automática de anomalias.
          </p>
        </CardContent>
      </Card>
    );
  }

  const conformant = data.pending.filter((item) => item.conformant);
  const withAnomalies = data.pending.filter((item) => !item.conformant);
  const conformantMinutes = conformant.reduce(
    (sum, item) => sum + item.totalMinutes,
    0,
  );

  return (
    <TooltipProvider delayDuration={150}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="space-y-6"
      >
        <motion.div variants={itemVariants}>
          <Card className="gap-0 py-4">
            <CardContent className="flex flex-wrap items-center justify-between gap-4 px-4">
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="flex items-center gap-2">
                  <Clock className="size-4 text-brand-500" aria-hidden="true" />
                  <span className="font-mono font-semibold">
                    {data.totals.pending}
                  </span>
                  pendente{data.totals.pending === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <ShieldCheck className="size-4" aria-hidden="true" />
                  <span className="font-mono font-semibold">
                    {data.totals.conformant}
                  </span>
                  conforme{data.totals.conformant === 1 ? "" : "s"}
                </span>
                <span className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <ShieldAlert className="size-4" aria-hidden="true" />
                  <span className="font-mono font-semibold">
                    {data.totals.withAnomalies}
                  </span>
                  com alertas
                </span>
                <span className="text-muted-foreground">
                  Total:{" "}
                  <span className="font-mono font-semibold text-foreground">
                    {formatDuration(data.totals.totalMinutes)}
                  </span>
                </span>
              </div>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={conformant.length === 0 || batchRunning}
                    className="bg-brand-500 text-white hover:bg-brand-600"
                  >
                    <CheckCheck className="size-4" aria-hidden="true" />
                    {batchRunning
                      ? "Aprovando…"
                      : `Aprovar ${conformant.length} conforme${conformant.length === 1 ? "" : "s"} em 1 clique`}
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-md">
                  <AlertDialogHeader className="shrink-0">
                    <AlertDialogTitle>Aprovar em lote</AlertDialogTitle>
                    <AlertDialogDescription>
                      {conformant.length} timesheet
                      {conformant.length === 1 ? "" : "s"} sem nenhuma anomalia
                      detectada ser{conformant.length === 1 ? "á" : "ão"}{" "}
                      aprovado{conformant.length === 1 ? "" : "s"}, totalizando{" "}
                      <span className="font-mono font-semibold text-foreground">
                        {formatDuration(conformantMinutes)}
                      </span>
                      . As horas ficam travadas e sincronizam com o Azure
                      DevOps.
                    </AlertDialogDescription>
                  </AlertDialogHeader>

                  <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2.5">
                    <div className="flex flex-wrap gap-1.5">
                      {conformant.map((item) => (
                        <span
                          key={item.timesheetId}
                          className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-xs"
                        >
                          {item.userName}
                          <span className="font-mono text-[10px] text-muted-foreground">
                            {formatDuration(item.totalMinutes)}
                          </span>
                        </span>
                      ))}
                    </div>
                  </div>

                  <AlertDialogFooter className="shrink-0">
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleBatchApprove}
                      className="bg-brand-500 text-white hover:bg-brand-600"
                    >
                      Confirmar aprovação
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </motion.div>

        {withAnomalies.length > 0 ? (
          <motion.section
            initial={ENTRY_ANIMATION.initial}
            animate={ENTRY_ANIMATION.animate}
            transition={ENTRY_ANIMATION.transition}
            className="space-y-3"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldAlert
                className="size-4 text-amber-500"
                aria-hidden="true"
              />
              Exceções para revisar ({withAnomalies.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {withAnomalies.map((insight) => (
                <InsightCard
                  key={insight.timesheetId}
                  insight={insight}
                  busy={busyIds.has(insight.timesheetId) || batchRunning}
                  onApprove={handleRequestApprove}
                  onReject={(item) =>
                    setRejectState({
                      timesheetId: item.timesheetId,
                      userName: item.userName,
                    })
                  }
                />
              ))}
            </div>
          </motion.section>
        ) : null}

        {conformant.length > 0 ? (
          <motion.section
            initial={ENTRY_ANIMATION.initial}
            animate={ENTRY_ANIMATION.animate}
            transition={ENTRY_ANIMATION.transition}
            className="space-y-3"
          >
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck
                className="size-4 text-emerald-500"
                aria-hidden="true"
              />
              Conformes — prontos para o lote ({conformant.length})
            </h2>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
              {conformant.map((insight) => (
                <InsightCard
                  key={insight.timesheetId}
                  insight={insight}
                  busy={busyIds.has(insight.timesheetId) || batchRunning}
                  onApprove={handleRequestApprove}
                  onReject={(item) =>
                    setRejectState({
                      timesheetId: item.timesheetId,
                      userName: item.userName,
                    })
                  }
                />
              ))}
            </div>
          </motion.section>
        ) : null}

        {/* Approve-despite-anomalies confirmation */}
        <AlertDialog
          open={confirmApprove !== null}
          onOpenChange={(open) => !open && setConfirmApprove(null)}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Aprovar com anomalias?</AlertDialogTitle>
              <AlertDialogDescription>
                O timesheet de {confirmApprove?.userName} tem{" "}
                {confirmApprove?.anomalies.length} alerta
                {confirmApprove?.anomalies.length === 1 ? "" : "s"} detectado
                {confirmApprove?.anomalies.length === 1 ? "" : "s"}. Você pode
                aprovar mesmo assim — a decisão fica registrada no histórico.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (confirmApprove) void handleApprove(confirmApprove);
                  setConfirmApprove(null);
                }}
                className="bg-brand-500 text-white hover:bg-brand-600"
              >
                Aprovar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Reject dialog */}
        <Dialog
          open={rejectState !== null}
          onOpenChange={(open) => {
            if (!open) {
              setRejectState(null);
              setRejectReason("");
            }
          }}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rejeitar timesheet</DialogTitle>
              <DialogDescription>
                Explique o que precisa ser ajustado — {rejectState?.userName}{" "}
                verá exatamente este motivo e poderá corrigir e reenviar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="Ex.: as 14h de sábado precisam de justificativa ou remoção…"
                rows={4}
                aria-label="Motivo da rejeição"
              />
              <p className="text-xs text-muted-foreground">
                Mínimo de 10 caracteres.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setRejectState(null);
                  setRejectReason("");
                }}
                disabled={rejectSubmitting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectSubmit}
                disabled={rejectSubmitting}
              >
                {rejectSubmitting ? "Rejeitando…" : "Rejeitar timesheet"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </TooltipProvider>
  );
}
