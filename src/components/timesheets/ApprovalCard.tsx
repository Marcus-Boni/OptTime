"use client";

import { Check, X } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
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
import { formatDuration } from "@/lib/utils";

interface ApprovalCardProps {
  timesheet: Timesheet;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}

function parsePeriod(period: string): string {
  // "2025-W10" => "Semana 10 de 2025"
  // "2025-03"  => "Março de 2025"
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) return `Semana ${parseInt(weekMatch[2])} de ${weekMatch[1]}`;
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
    return `${months[parseInt(monthMatch[2]) - 1]} de ${monthMatch[1]}`;
  }
  return period;
}

export function ApprovalCard({
  timesheet,
  onApprove,
  onReject,
}: ApprovalCardProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    setLoading(true);
    try {
      await onApprove(timesheet.id);
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

  const user = timesheet.user;

  return (
    <>
      <Card className="border-border/30 bg-card/80">
        <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
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
              <p className="truncate text-sm font-medium text-foreground">
                {user?.name ?? "Usuário"}
              </p>
              <p className="text-xs text-muted-foreground">
                {parsePeriod(timesheet.period)}
              </p>
            </div>
          </div>

          {/* Hours */}
          <div className="flex gap-4 text-sm">
            <div className="text-center">
              <p className="font-mono font-semibold">
                {formatDuration(timesheet.totalMinutes)}
              </p>
              <p className="text-[10px] text-muted-foreground">Total</p>
            </div>
            <div className="text-center">
              <p className="font-mono font-semibold text-brand-500">
                {formatDuration(timesheet.billableMinutes)}
              </p>
              <p className="text-[10px] text-muted-foreground">Faturável</p>
            </div>
          </div>

          <TimesheetStatusBadge status={timesheet.status} />

          {/* Actions */}
          {timesheet.status === "submitted" && (
            <div className="flex gap-2">
              <Button
                size="sm"
                className="bg-green-600 text-white hover:bg-green-700"
                onClick={handleApprove}
                disabled={loading}
              >
                <Check className="mr-1.5 h-3.5 w-3.5" />
                Aprovar
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="text-destructive hover:text-destructive"
                onClick={() => setRejectOpen(true)}
                disabled={loading}
              >
                <X className="mr-1.5 h-3.5 w-3.5" />
                Rejeitar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
