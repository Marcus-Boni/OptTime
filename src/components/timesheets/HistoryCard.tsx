"use client";

import { CheckCircle2, RotateCcw, XCircle } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
import { Badge } from "@/components/ui/badge";
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
import type { Timesheet } from "@/hooks/use-timesheets";
import {
  getTimesheetPeriodLabel,
  isSplitPeriod,
} from "@/lib/timesheet-periods";
import { formatDuration } from "@/lib/utils";

export interface HistoryCardProps {
  timesheet: Timesheet;
  onReopen?: (id: string, reason?: string) => Promise<void>;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function HistoryCard({ timesheet, onReopen }: HistoryCardProps) {
  const [reopenOpen, setReopenOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const user = timesheet.user;
  const isApproved = timesheet.status === "approved";

  async function handleConfirmReopen(): Promise<void> {
    if (!onReopen) return;
    setLoading(true);
    try {
      await onReopen(timesheet.id);
      setReopenOpen(false);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Card className="border-border/20 bg-card/50 py-0 shadow-sm transition-colors hover:bg-card/70">
        <CardContent className="flex flex-col gap-2.5 px-4 py-2.5 sm:flex-row sm:items-center">
          {/* User info */}
          <div className="flex flex-1 min-w-0 items-center gap-3">
            {user && (
              <UserAvatar
                image={user.image}
                name={user.name ?? "Usuário"}
                size="sm"
              />
            )}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-medium text-foreground leading-snug">
                  {user?.name ?? "Usuário"}
                </p>
                {isSplitPeriod(timesheet.period) && (
                  <Badge
                    variant="outline"
                    className="rounded-full border-blue-500/30 bg-blue-500/10 text-blue-500 text-[10px] py-0 px-2"
                  >
                    Semana fracionada
                  </Badge>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {getTimesheetPeriodLabel(
                  timesheet.period,
                  timesheet.periodType,
                )}
                {user?.department ? ` · ${user.department}` : ""}
              </p>
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

          {/* Status */}
          <TimesheetStatusBadge status={timesheet.status} />

          {/* Approval / rejection metadata */}
          <div className="flex flex-col gap-0.5 text-right min-w-[140px]">
            {isApproved ? (
              <>
                <div className="flex items-center justify-end gap-1 text-xs text-green-500 dark:text-green-400">
                  <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  <span className="font-medium">
                    {timesheet.approver?.name ?? "Aprovador"}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {formatDate(timesheet.approvedAt)}
                </p>
              </>
            ) : (
              <>
                <div className="flex items-center justify-end gap-1 text-xs text-destructive">
                  <XCircle className="h-3 w-3" aria-hidden="true" />
                  <span className="font-medium">Rejeitado</span>
                </div>
                {timesheet.rejectionReason && (
                  <p
                    className="text-[11px] text-muted-foreground max-w-[180px] truncate"
                    title={timesheet.rejectionReason}
                  >
                    {timesheet.rejectionReason}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <Button
              size="sm"
              variant="ghost"
              asChild
              className="h-8 px-2.5 text-xs"
            >
              <Link
                href={`/dashboard/timesheets/${timesheet.id}?from=/dashboard/timesheets/approvals`}
              >
                Detalhes
              </Link>
            </Button>

            {isApproved && onReopen && (
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1 px-2.5 text-xs"
                onClick={() => setReopenOpen(true)}
                disabled={loading}
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reabrir
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={reopenOpen} onOpenChange={setReopenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reabrir Timesheet Aprovado</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <p>
                  Tem certeza que deseja reabrir o timesheet de{" "}
                  <strong>{user?.name ?? "Colaborador"}</strong> referente a{" "}
                  <strong>
                    {getTimesheetPeriodLabel(
                      timesheet.period,
                      timesheet.periodType,
                    )}
                  </strong>
                  ?
                </p>
                <p className="text-xs">
                  O período voltará para o status <strong>Em aberto</strong> e
                  permitirá novas edições e lançamentos.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setReopenOpen(false)}
              disabled={loading}
            >
              Cancelar
            </Button>
            <Button onClick={handleConfirmReopen} disabled={loading}>
              {loading ? "Reabrindo..." : "Confirmar Reabertura"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
