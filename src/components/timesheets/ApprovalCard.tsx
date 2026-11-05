"use client";

import { Check, RotateCcw, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
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
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import type { Timesheet } from "@/hooks/use-timesheets";
import {
  getTimesheetPeriodLabel,
  isPeriodOpenAfter,
  isSplitPeriod,
} from "@/lib/timesheet-periods";
import { todayInAppTimeZone } from "@/lib/timezone";
import { formatDuration, getPeriodRange } from "@/lib/utils";

interface ApprovalCardProps {
  timesheet: Timesheet;
  onApprove: (id: string, options?: { force?: boolean }) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onReopen?: (id: string, reason?: string) => Promise<void>;
}

export function ApprovalCard({
  timesheet,
  onApprove,
  onReject,
  onReopen,
}: ApprovalCardProps) {
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const isFuture = isPeriodOpenAfter(
    timesheet.period,
    timesheet.periodType,
    todayInAppTimeZone(),
  );
  const periodLabel = getTimesheetPeriodLabel(
    timesheet.period,
    timesheet.periodType,
  );
  const isSplit = isSplitPeriod(timesheet.period);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove(timesheet.id, { force: isFuture });
      setApproveOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!reason.trim()) return;
    setLoading(true);
    try {
      await onReject(timesheet.id, reason.trim());
      setRejectOpen(false);
      setReason("");
    } finally {
      setLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!onReopen) return;
    setLoading(true);
    try {
      await onReopen(timesheet.id);
      setReopenOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const user = timesheet.user;
  const canApprove =
    timesheet.status === "submitted" ||
    timesheet.status === "open" ||
    timesheet.status === "rejected";

  return (
    <>
      <Card className="border-border/30 bg-card/80 py-0 shadow-sm transition-colors hover:border-border/60">
        <CardContent className="flex flex-col gap-2.5 px-4 py-2.5 sm:flex-row sm:items-center">
          {/* User info */}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {user && (
              <UserAvatar
                image={user.image}
                name={user.name ?? "Usuário"}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate text-sm font-medium text-foreground leading-snug">
                  {user?.name ?? "Usuário"}
                </p>
                {isSplit && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-blue-500/30 bg-blue-500/10 text-blue-500 text-[10px]"
                  >
                    Semana fracionada
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">{periodLabel}</p>
            </div>
          </div>

          {/* Hours */}
          <div className="flex gap-4 text-xs">
            <div className="text-center">
              <p className="font-mono font-semibold text-sm">
                {formatDuration(timesheet.totalMinutes)}
              </p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <p className="font-mono font-semibold text-sm text-brand-500">
                {formatDuration(timesheet.billableMinutes)}
              </p>
              <p className="text-[10px] text-muted-foreground">Faturável</p>
            </div>
          </div>

          <TimesheetStatusBadge status={timesheet.status} />

          {/* Actions */}
          <div className="flex gap-1.5 shrink-0">
            <Button
              size="sm"
              variant="secondary"
              className="h-8 px-3 text-xs"
              asChild
            >
              <Link
                href={`/dashboard/timesheets/${timesheet.id}?from=/dashboard/timesheets/approvals`}
              >
                Detalhes
              </Link>
            </Button>
            {canApprove && (
              <>
                <Button
                  size="sm"
                  className="h-8 px-3 text-xs bg-green-600 text-white hover:bg-green-700"
                  onClick={() => setApproveOpen(true)}
                  disabled={loading}
                >
                  <Check className="mr-1 h-3.5 w-3.5" />
                  Aprovar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 px-3 text-xs text-destructive hover:text-destructive"
                  onClick={() => setRejectOpen(true)}
                  disabled={loading || timesheet.status !== "submitted"}
                >
                  <X className="mr-1 h-3.5 w-3.5" />
                  Rejeitar
                </Button>
              </>
            )}
            {timesheet.status === "approved" && onReopen && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 px-3 text-xs"
                onClick={() => setReopenOpen(true)}
                disabled={loading}
              >
                <RotateCcw className="mr-1 h-3.5 w-3.5" />
                Reabrir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={approveOpen} onOpenChange={setApproveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar aprovação</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                Você está prestes a aprovar o timesheet de{" "}
                <strong className="text-foreground">
                  {user?.name ?? "Usuário"}
                </strong>{" "}
                referente a {periodLabel}. Esta ação altera o status para
                aprovado.
              </p>
              {isFuture && (
                <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-xs text-amber-600 dark:text-amber-400">
                  <strong>Atenção:</strong> Este período ainda não terminou.
                  Aprovar agora bloqueará os lançamentos até o fim deste período
                  ({getPeriodRange(timesheet.period, timesheet.periodType).end}
                  ).
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleApprove();
              }}
              disabled={loading}
              className="bg-green-600 text-white hover:bg-green-700 focus:ring-green-600/20"
            >
              {loading
                ? "Aprovando..."
                : isFuture
                  ? "Aprovar antecipadamente"
                  : "Confirmar aprovação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir timesheet</AlertDialogTitle>
            <AlertDialogDescription>
              Deseja reabrir o timesheet de{" "}
              <strong className="text-foreground">
                {user?.name ?? "Usuário"}
              </strong>{" "}
              referente a {periodLabel}? Isso retornará o status para aberto e
              permitirá novos lançamentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleReopen();
              }}
              disabled={loading}
              className="bg-brand-500 text-white hover:bg-brand-600"
            >
              {loading ? "Reabrindo..." : "Confirmar reabertura"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reject dialog */}
      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rejeitar Timesheet</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Informe o motivo da rejeição. O colaborador será notificado e poderá
            corrigir as entradas.
          </p>
          <Textarea
            placeholder="Descreva o motivo da rejeição…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={handleReject}
              disabled={!reason.trim() || loading}
            >
              {loading ? "Rejeitando…" : "Confirmar Rejeição"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
