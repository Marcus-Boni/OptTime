"use client";

import { CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { UserAvatar } from "@/components/shared/user-avatar";
import { TimesheetStatusBadge } from "@/components/timesheets/TimesheetStatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Timesheet } from "@/hooks/use-timesheets";
import { formatDuration } from "@/lib/utils";

export interface HistoryCardProps {
  timesheet: Timesheet;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function HistoryCard({ timesheet }: HistoryCardProps) {
  const user = timesheet.user;
  const isApproved = timesheet.status === "approved";

  return (
    <Card className="border-border/20 bg-card/50 transition-colors hover:bg-card/70">
      <CardContent className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center">
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
            <p className="truncate text-sm font-medium text-foreground">
              {user?.name ?? "Usuário"}
            </p>
            <p className="text-xs text-muted-foreground">
              {user?.department ?? user?.email ?? "—"}
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

        {/* Status */}
        <TimesheetStatusBadge status={timesheet.status} />

        {/* Approval / rejection metadata */}
        <div className="flex flex-col gap-0.5 text-right min-w-[140px]">
          {isApproved ? (
            <>
              <div className="flex items-center justify-end gap-1 text-xs text-green-500 dark:text-green-400">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                <span className="font-medium">
                  {timesheet.approver?.name ?? "Aprovador desconhecido"}
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

        {/* Details link */}
        <Button size="sm" variant="ghost" asChild className="flex-shrink-0">
          <Link href={`/dashboard/timesheets/${timesheet.id}`}>Detalhes</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
