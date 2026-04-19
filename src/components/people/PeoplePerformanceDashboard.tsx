"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Filter,
  FolderKanban,
  KanbanSquare,
  MoreHorizontal,
  RefreshCw,
  Search,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  UserCog,
  UserX,
} from "lucide-react";
import { useDeferredValue, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import ManageProjectsDialog from "@/components/people/ManageProjectsDialog";
import ReminderSingleModal from "@/components/people/ReminderSingleModal";
import ScoreExplanationDialog from "@/components/people/ScoreExplanationDialog";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatDate, formatDuration, getRelativeTime } from "@/lib/utils";
import type {
  PeoplePerformanceHealth,
  PeoplePerformanceResponse,
  PeoplePerformanceUserRow,
} from "@/types/people-performance";

// ─── Constants ───────────────────────────────────────────────────────────────

const HEALTH_LABELS: Record<PeoplePerformanceHealth, string> = {
  excellent: "Excelente",
  stable: "Estável",
  attention: "Atenção",
  critical: "Crítico",
  offline: "Offline",
};

const HEALTH_STYLES: Record<PeoplePerformanceHealth, string> = {
  excellent:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  stable: "border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  attention:
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  critical:
    "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  offline:
    "border-slate-500/20 bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

const INTEGRATION_LABELS = {
  connected: "Azure Conectado",
  missing: "Sem integração",
  invalid: "PAT inválido",
} as const;

const INTEGRATION_STYLES = {
  connected:
    "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  missing:
    "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  invalid: "border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300",
} as const;

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  manager: "Gerente",
  member: "Membro",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") return <ArrowUp className="h-3.5 w-3.5" />;
  if (sorted === "desc") return <ArrowDown className="h-3.5 w-3.5" />;
  return <ArrowUpDown className="h-3.5 w-3.5" />;
}

function formatHours(hours: number) {
  return `${Number(hours.toFixed(1))}h`;
}

function getWorkItemTypeColor(type: string): string {
  const lower = type.toLowerCase();
  if (lower.includes("bug"))
    return "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400";
  if (lower.includes("user story") || lower.includes("story"))
    return "border-sky-500/30 bg-sky-500/10 text-sky-600 dark:text-sky-400";
  if (lower.includes("task"))
    return "border-violet-500/30 bg-violet-500/10 text-violet-600 dark:text-violet-400";
  if (lower.includes("feature"))
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400";
  if (lower.includes("epic"))
    return "border-orange-500/30 bg-orange-500/10 text-orange-600 dark:text-orange-400";
  return "border-border/50 bg-muted/50 text-muted-foreground";
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SummaryCard({
  title,
  value,
  detail,
  icon,
  accent,
  actionNode,
}: {
  title: string;
  value: string;
  detail: string;
  icon: React.ReactNode;
  accent: string;
  actionNode?: React.ReactNode;
}) {
  return (
    <Card className="overflow-hidden border-border/50 bg-card/80 shadow-sm">
      <CardContent className="relative p-5">
        <div
          className={cn("absolute inset-x-0 top-0 h-1 rounded-t-xl", accent)}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                {title}
              </p>
              {actionNode}
            </div>
            <p className="mt-2 font-display text-3xl font-bold text-foreground">
              {value}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
          <div
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm",
              accent,
            )}
          >
            {icon}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function HealthBadge({ health }: { health: PeoplePerformanceHealth }) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full", HEALTH_STYLES[health])}
    >
      {HEALTH_LABELS[health]}
    </Badge>
  );
}

function PerformanceSkeleton() {
  const summaryKeys = [
    "summary-a",
    "summary-b",
    "summary-c",
    "summary-d",
    "summary-e",
  ];
  const rowKeys = ["row-a", "row-b", "row-c", "row-d", "row-e", "row-f"];

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {summaryKeys.map((key) => (
          <Card key={key} className="border-border/50 bg-card/70">
            <CardContent className="space-y-3 p-5">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/50 bg-card/70">
        <CardContent className="space-y-4 p-5">
          <div className="flex flex-col gap-3 lg:flex-row">
            <Skeleton className="h-10 flex-1" />
            <Skeleton className="h-10 w-full lg:w-44" />
            <Skeleton className="h-10 w-full lg:w-36" />
          </div>
          <div className="space-y-2">
            {rowKeys.map((key) => (
              <Skeleton key={key} className="h-16 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DetailMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/60 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

// ─── User Actions (restored from PersonCard) ──────────────────────────────────

type PendingAction =
  | { type: "role"; role: string }
  | { type: "active"; nextIsActive: boolean }
  | null;

interface UserActionsMenuProps {
  userId: string;
  userName: string;
  userRole: string;
  isActive: boolean;
  sessionRole: string;
  sessionUserId: string | undefined;
  onSuccess: () => void;
}

function UserActionsMenu({
  userId,
  userName,
  userRole,
  isActive,
  sessionRole,
  sessionUserId,
  onSuccess,
}: UserActionsMenuProps) {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isManageProjectsOpen, setIsManageProjectsOpen] = useState(false);
  const [isReminderOpen, setIsReminderOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);

  const isSelf = userId === sessionUserId;
  const managerCannotManageAdmin =
    sessionRole === "manager" && userRole === "admin";
  const canAct =
    (sessionRole === "admin" || sessionRole === "manager") &&
    !isSelf &&
    !managerCannotManageAdmin;

  if (!canAct) return null;

  async function handleToggleActive(): Promise<void> {
    setIsUpdating(true);
    try {
      const res = await fetch(`/api/people/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !isActive }),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorData.error ?? "Erro ao alterar status");
      }

      toast.success(
        isActive
          ? "Acesso desativado com sucesso."
          : "Acesso reativado com sucesso.",
      );
      onSuccess();
    } catch (err: unknown) {
      console.error("[UserActionsMenu] handleToggleActive:", err);
      toast.error(
        err instanceof Error
          ? err.message
          : "Erro ao alterar status do usuário.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleUpdateRole(newRole: string): Promise<void> {
    if (userRole === newRole) return;

    setIsUpdating(true);
    try {
      const res = await fetch(`/api/people/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) {
        const errorData = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(errorData.error ?? "Erro ao alterar cargo");
      }

      toast.success(`Cargo alterado para ${ROLE_LABELS[newRole] ?? newRole}.`);
      onSuccess();
    } catch (err: unknown) {
      console.error("[UserActionsMenu] handleUpdateRole:", err);
      toast.error(
        err instanceof Error ? err.message : "Erro ao alterar cargo.",
      );
    } finally {
      setIsUpdating(false);
    }
  }

  async function handleConfirmPendingAction(): Promise<void> {
    if (!pendingAction) return;

    if (pendingAction.type === "role") {
      await handleUpdateRole(pendingAction.role);
    } else {
      await handleToggleActive();
    }

    setPendingAction(null);
  }

  function getPendingActionCopy(action: PendingAction) {
    if (!action) {
      return {
        title: "Confirmar alteração",
        description: "Confirme para continuar.",
        confirmLabel: "Confirmar",
      };
    }

    if (action.type === "role") {
      const roleLabel = ROLE_LABELS[action.role] ?? action.role;
      return {
        title: "Confirmar mudança de cargo",
        description: (
          <>
            Você está prestes a alterar o cargo de{" "}
            <strong className="text-foreground">{userName}</strong> para{" "}
            <strong className="text-foreground">{roleLabel}</strong>.
          </>
        ),
        confirmLabel: "Confirmar mudança",
      };
    }

    return {
      title: action.nextIsActive
        ? "Confirmar reativação de acesso"
        : "Confirmar desativação de acesso",
      description: (
        <>
          {action.nextIsActive
            ? "Você está prestes a reativar o acesso de "
            : "Você está prestes a desativar o acesso de "}
          <strong className="text-foreground">{userName}</strong>.
        </>
      ),
      confirmLabel: action.nextIsActive
        ? "Reativar acesso"
        : "Desativar acesso",
    };
  }

  const pendingActionCopy = getPendingActionCopy(pendingAction);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={isUpdating}
            aria-label="Ações do colaborador"
          >
            <MoreHorizontal className="h-4 w-4" />
            Ações
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="text-xs">Ações</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setIsManageProjectsOpen(true)}
            className="text-xs"
          >
            <FolderKanban className="mr-2 h-3.5 w-3.5" />
            Gerenciar projetos
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setIsReminderOpen(true)}
            className="text-xs"
          >
            <Bell className="mr-2 h-3.5 w-3.5" />
            Enviar lembrete de horas
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Cargo</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {sessionRole === "admin" && (
            <DropdownMenuItem
              onClick={() => setPendingAction({ type: "role", role: "admin" })}
              disabled={isUpdating || userRole === "admin"}
              className="justify-between text-xs"
            >
              <span>Admin</span>
              {userRole === "admin" && (
                <span className="h-2 w-2 rounded-full bg-brand-500" />
              )}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onClick={() => setPendingAction({ type: "role", role: "manager" })}
            disabled={isUpdating || userRole === "manager"}
            className="justify-between text-xs"
          >
            <span>Gerente</span>
            {userRole === "manager" && (
              <span className="h-2 w-2 rounded-full bg-brand-500" />
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => setPendingAction({ type: "role", role: "member" })}
            disabled={isUpdating || userRole === "member"}
            className="justify-between text-xs"
          >
            <span>Membro</span>
            {userRole === "member" && (
              <span className="h-2 w-2 rounded-full bg-brand-500" />
            )}
          </DropdownMenuItem>

          <DropdownMenuSeparator />
          <DropdownMenuLabel className="text-xs">Gerenciar</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() =>
              setPendingAction({ type: "active", nextIsActive: !isActive })
            }
            disabled={isUpdating}
            className="text-xs"
          >
            {isActive ? (
              <>
                <UserX className="mr-2 h-3.5 w-3.5 text-muted-foreground" />
                Desativar acesso
              </>
            ) : (
              <>
                <UserCheck className="mr-2 h-3.5 w-3.5 text-brand-500" />
                Reativar acesso
              </>
            )}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog
        open={pendingAction !== null}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{pendingActionCopy.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingActionCopy.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isUpdating}>
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmPendingAction();
              }}
              disabled={isUpdating}
            >
              {isUpdating ? "Processando..." : pendingActionCopy.confirmLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ManageProjectsDialog
        open={isManageProjectsOpen}
        onOpenChange={setIsManageProjectsOpen}
        userId={userId}
        userName={userName}
      />

      <ReminderSingleModal
        open={isReminderOpen}
        onOpenChange={setIsReminderOpen}
        userId={userId}
        userName={userName}
      />
    </>
  );
}

// ─── Detail Sheet ─────────────────────────────────────────────────────────────

function UserPerformanceSheet({
  row,
  open,
  onOpenChange,
  sessionRole,
  sessionUserId,
  onActionSuccess,
}: {
  row: PeoplePerformanceUserRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sessionRole: string;
  sessionUserId: string | undefined;
  onActionSuccess: () => void;
}) {
  const availableHours = row
    ? Math.max(
        0,
        row.user.weeklyCapacity - row.metrics.loggedThisWeekMinutes / 60,
      )
    : 0;
  const availabilityPercent =
    row && row.user.weeklyCapacity > 0
      ? Math.round((availableHours / row.user.weeklyCapacity) * 100)
      : 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full overflow-y-auto border-l border-border/60 bg-background/98 sm:max-w-3xl"
      >
        {!row ? null : (
          <>
            {/* Header — avatar + name/badges, then action button below */}
            <SheetHeader className="border-b border-border/60 px-6 py-5">
              {/* Row 1: avatar + identity info */}
              <div className="flex items-start gap-4">
                <UserAvatar
                  name={row.user.name}
                  image={row.user.image}
                  size="lg"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 pr-8">
                    <SheetTitle className="text-2xl font-semibold">
                      {row.user.name}
                    </SheetTitle>
                    <HealthBadge health={row.metrics.health} />
                    <Badge
                      variant="outline"
                      className={cn(
                        "rounded-full",
                        INTEGRATION_STYLES[row.integration.status],
                      )}
                    >
                      {INTEGRATION_LABELS[row.integration.status]}
                    </Badge>
                  </div>
                  <SheetDescription className="mt-1">
                    {row.user.email}
                  </SheetDescription>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">
                      {ROLE_LABELS[row.user.role] ?? row.user.role}
                    </Badge>
                    {row.user.department ? (
                      <Badge variant="outline">{row.user.department}</Badge>
                    ) : null}
                    {!row.user.isActive ? (
                      <Badge
                        variant="outline"
                        className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      >
                        Usuário inativo
                      </Badge>
                    ) : null}
                  </div>
                </div>
              </div>
              {/* Row 2: action menu below, left-aligned, clear of the X button */}
              <div className="pt-3">
                <UserActionsMenu
                  userId={row.user.id}
                  userName={row.user.name}
                  userRole={row.user.role}
                  isActive={row.user.isActive}
                  sessionRole={sessionRole}
                  sessionUserId={sessionUserId}
                  onSuccess={onActionSuccess}
                />
              </div>
            </SheetHeader>

            <div className="space-y-6 px-6 py-6">
              {/* KPIs */}
              <div className="grid gap-4 sm:grid-cols-1 xl:grid-cols-3">
                <DetailMetric
                  label="Tarefas ativas"
                  value={String(row.metrics.activeItems)}
                  detail={`${row.metrics.blockedItems} bloqueada(s) · ${row.metrics.staleItems} sem atualização`}
                />
                <DetailMetric
                  label="Horas restantes (WIs)"
                  value={formatHours(row.metrics.remainingHours)}
                  detail={`${row.metrics.itemsWithoutEstimate} item(ns) sem estimativa`}
                />
                <DetailMetric
                  label="Horas registradas (semana)"
                  value={formatDuration(row.metrics.loggedThisWeekMinutes)}
                  detail={`${row.metrics.utilizationPercent}% da capacidade de ${row.user.weeklyCapacity}h`}
                />
              </div>

              {/* Capacity bar */}
              <Card className="border-border/50 bg-card/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Capacidade e disponibilidade semanal
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Horas utilizadas esta semana
                      </span>
                      <span className="font-medium text-foreground">
                        {formatDuration(row.metrics.loggedThisWeekMinutes)} /{" "}
                        {row.user.weeklyCapacity}h
                      </span>
                    </div>
                    <Progress
                      value={Math.min(row.metrics.utilizationPercent, 100)}
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">
                        Cobertura de estimativas nos WIs
                      </span>
                      <span className="font-medium text-foreground">
                        {row.metrics.activeItems > 0
                          ? Math.round(
                              ((row.metrics.activeItems -
                                row.metrics.itemsWithoutEstimate) /
                                row.metrics.activeItems) *
                                100,
                            )
                          : 100}
                        %
                      </span>
                    </div>
                    <Progress
                      value={
                        row.metrics.activeItems > 0
                          ? ((row.metrics.activeItems -
                              row.metrics.itemsWithoutEstimate) /
                              row.metrics.activeItems) *
                            100
                          : 100
                      }
                    />
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                      <p className="text-[11px] text-muted-foreground">
                        Horas disponíveis (semana)
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">
                        {formatHours(availableHours)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                      <p className="text-[11px] text-muted-foreground">
                        Horas concluídas (WIs)
                      </p>
                      <p className="mt-2 text-xl font-semibold text-foreground">
                        {formatHours(row.metrics.completedHours)}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-border/60 bg-background/70 p-4">
                      <p className="text-[11px] text-muted-foreground">
                        Última atividade
                      </p>
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {row.metrics.lastActivityAt
                          ? getRelativeTime(row.metrics.lastActivityAt)
                          : "Sem sinal recente"}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Alerts */}
              <Card className="border-border/50 bg-card/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Alertas prioritários
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {row.alerts.length === 0 ? (
                    <div className="flex items-center gap-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-sm text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      Nenhum alerta crítico ou operacional no momento.
                    </div>
                  ) : (
                    row.alerts.map((alert) => (
                      <div
                        key={alert.id}
                        className={cn(
                          "rounded-2xl border p-4",
                          alert.level === "critical" &&
                            "border-rose-500/20 bg-rose-500/5",
                          alert.level === "warning" &&
                            "border-amber-500/20 bg-amber-500/5",
                          alert.level === "info" &&
                            "border-sky-500/20 bg-sky-500/5",
                          alert.level === "success" &&
                            "border-emerald-500/20 bg-emerald-500/5",
                        )}
                      >
                        <p className="text-sm font-medium text-foreground">
                          {alert.label}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {alert.detail}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Projects */}
              <Card className="border-border/50 bg-card/70">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">
                    Projetos vinculados
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {row.projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Sem projetos suficientes para análise detalhada.
                    </p>
                  ) : (
                    row.projects.map((proj) => (
                      <div
                        key={proj.id}
                        className="rounded-2xl border border-border/60 bg-background/70 p-4"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span
                                className="h-2.5 w-2.5 shrink-0 rounded-full"
                                style={{ backgroundColor: proj.color }}
                              />
                              <p className="truncate font-medium text-foreground">
                                {proj.name}
                              </p>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {proj.activeItems} tarefa(s) ativa(s) ·{" "}
                              {formatDuration(proj.loggedMinutes30d)} lançados
                              em 30d
                            </p>
                          </div>
                          <Badge variant="outline">{proj.source}</Badge>
                        </div>
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          <div className="rounded-xl bg-card/80 p-3">
                            <p className="text-[11px] text-muted-foreground">
                              Horas restantes
                            </p>
                            <p className="mt-1 font-semibold text-foreground">
                              {formatHours(proj.remainingHours)}
                            </p>
                          </div>
                          <div className="rounded-xl bg-card/80 p-3">
                            <p className="text-[11px] text-muted-foreground">
                              Sem estimativa
                            </p>
                            <p className="mt-1 font-semibold text-foreground">
                              {proj.itemsWithoutEstimate}
                            </p>
                          </div>
                          <div className="rounded-xl bg-card/80 p-3">
                            <p className="text-[11px] text-muted-foreground">
                              Sem atualização
                            </p>
                            <p className="mt-1 font-semibold text-foreground">
                              {proj.staleItems}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>

              {/* Work Items – manager-focused, no commits */}
              <Card className="border-border/50 bg-card/70">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-base">
                      Tarefas e PBIs ativos (Azure DevOps)
                    </CardTitle>
                    <Badge variant="outline" className="rounded-full text-xs">
                      {row.topWorkItems.length} item(ns)
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Somente itens em andamento — concluídos, cancelados e
                    removidos são excluídos.
                  </p>
                </CardHeader>
                <CardContent className="space-y-3">
                  {row.topWorkItems.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhuma tarefa ou PBI ativo encontrado no Azure DevOps.
                    </p>
                  ) : (
                    row.topWorkItems.map((wi) => (
                      <a
                        key={wi.id}
                        href={wi.url}
                        target="_blank"
                        rel="noreferrer"
                        className="block rounded-2xl border border-border/60 bg-background/70 p-4 transition-colors hover:border-brand-500/30"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge
                                variant="outline"
                                className={cn(
                                  "rounded-full text-[10px]",
                                  getWorkItemTypeColor(wi.type),
                                )}
                              >
                                {wi.type}
                              </Badge>
                              <span className="text-xs text-muted-foreground">
                                #{wi.id}
                              </span>
                            </div>
                            <p className="mt-1.5 text-sm font-medium text-foreground line-clamp-2">
                              {wi.title}
                            </p>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {wi.projectName} · {wi.state}
                            </p>
                            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              {wi.remainingWork != null && (
                                <span className="flex items-center gap-1">
                                  <Clock3 className="h-3 w-3" />
                                  {wi.remainingWork}h restantes
                                </span>
                              )}
                              {wi.changedAt && (
                                <span>
                                  Atualizado em {formatDate(wi.changedAt)}
                                </span>
                              )}
                              {wi.createdAt && !wi.changedAt && (
                                <span>
                                  Criado em {formatDate(wi.createdAt)}
                                </span>
                              )}
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                        </div>
                        {(wi.stale || wi.blocked || wi.unestimated) && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {wi.stale && (
                              <Badge
                                variant="outline"
                                className="border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                              >
                                Sem atualização recente
                              </Badge>
                            )}
                            {wi.blocked && (
                              <Badge
                                variant="outline"
                                className="border-rose-500/20 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                              >
                                Bloqueado
                              </Badge>
                            )}
                            {wi.unestimated && (
                              <Badge
                                variant="outline"
                                className="border-sky-500/20 bg-sky-500/10 text-sky-700 dark:text-sky-300"
                              >
                                Sem estimativa
                              </Badge>
                            )}
                          </div>
                        )}
                      </a>
                    ))
                  )}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type HealthFilterValue = "all" | PeoplePerformanceHealth;
type IntegrationFilterValue = "all" | "connected" | "missing" | "invalid";

interface PeoplePerformanceDashboardProps {
  data: PeoplePerformanceResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  sessionRole: string;
  sessionUserId: string | undefined;
}

export default function PeoplePerformanceDashboard({
  data,
  loading,
  error,
  onRetry,
  sessionRole,
  sessionUserId,
}: PeoplePerformanceDashboardProps) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: "score", desc: true },
  ]);
  const [search, setSearch] = useState("");
  const [healthFilter, setHealthFilter] = useState<HealthFilterValue>("all");
  const [integrationFilter, setIntegrationFilter] =
    useState<IntegrationFilterValue>("all");
  const [alertsOnly, setAlertsOnly] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const deferredSearch = useDeferredValue(search);

  const normalizedSearch = deferredSearch.trim().toLowerCase();

  const filteredUsers = useMemo(() => {
    if (!data) return [];

    return data.users.filter((row) => {
      if (healthFilter !== "all" && row.metrics.health !== healthFilter) {
        return false;
      }

      if (
        integrationFilter !== "all" &&
        row.integration.status !== integrationFilter
      ) {
        return false;
      }

      if (alertsOnly && row.alerts.length === 0) {
        return false;
      }

      if (!normalizedSearch) {
        return true;
      }

      const searchableText = [
        row.user.name,
        row.user.email,
        row.user.department,
        row.user.role,
        ...row.projects.map((p) => p.name),
        ...row.topWorkItems.map((wi) => wi.title),
        ...row.alerts.map((alert) => `${alert.label} ${alert.detail}`),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(normalizedSearch);
    });
  }, [alertsOnly, data, healthFilter, integrationFilter, normalizedSearch]);

  const selectedUser = useMemo(
    () => data?.users.find((row) => row.user.id === selectedUserId) ?? null,
    [data, selectedUserId],
  );

  const columns = useMemo<ColumnDef<PeoplePerformanceUserRow>[]>(
    () => [
      {
        id: "user",
        accessorFn: (row) => row.user.name,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Colaborador
            <SortIcon sorted={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={row.original.user.name}
              image={row.original.user.image}
              size="sm"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">
                {row.original.user.name}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {row.original.user.email}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                <HealthBadge health={row.original.metrics.health} />
              </div>
            </div>
          </div>
        ),
      },
      {
        id: "score",
        accessorFn: (row) => row.metrics.performanceScore,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Performance
            <SortIcon sorted={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="min-w-[140px] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-lg font-semibold text-foreground">
                {row.original.metrics.performanceScore}
              </span>
            </div>
            <Progress value={row.original.metrics.performanceScore} />
          </div>
        ),
      },
      {
        id: "workload",
        accessorFn: (row) => row.metrics.activeItems,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Backlog ativo
            <SortIcon sorted={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => (
          <div className="space-y-1 text-sm">
            <p className="font-medium text-foreground">
              {row.original.metrics.activeItems} tarefa(s)
            </p>
            <p className="text-xs text-muted-foreground">
              {formatHours(row.original.metrics.remainingHours)} restantes
            </p>
            {row.original.metrics.blockedItems > 0 && (
              <p className="text-xs text-rose-600 dark:text-rose-400">
                {row.original.metrics.blockedItems} bloqueada(s)
              </p>
            )}
          </div>
        ),
      },
      {
        id: "availability",
        accessorFn: (row) =>
          row.user.weeklyCapacity - row.metrics.loggedThisWeekMinutes / 60,
        header: ({ column }) => (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-3 h-8 px-3"
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
          >
            Disponibilidade
            <SortIcon sorted={column.getIsSorted()} />
          </Button>
        ),
        cell: ({ row }) => {
          const logged = row.original.metrics.loggedThisWeekMinutes / 60;
          const available = Math.max(
            0,
            row.original.user.weeklyCapacity - logged,
          );
          const utilPct = row.original.metrics.utilizationPercent;

          return (
            <div className="space-y-1 text-sm">
              <p className="font-medium text-foreground">
                {formatHours(available)} livres
              </p>
              <p className="text-xs text-muted-foreground">
                {formatDuration(row.original.metrics.loggedThisWeekMinutes)}{" "}
                lançados
              </p>
              <p
                className={cn(
                  "text-xs font-medium",
                  utilPct >= 100
                    ? "text-rose-600 dark:text-rose-400"
                    : utilPct >= 75
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-emerald-600 dark:text-emerald-400",
                )}
              >
                {utilPct}% utilizado
              </p>
            </div>
          );
        },
      },
      {
        id: "projects",
        accessorFn: (row) => row.metrics.assignedProjects,
        header: "Projetos",
        cell: ({ row }) => {
          const overflow = row.original.projects.slice(2);
          return (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">
                {row.original.metrics.assignedProjects} projeto(s)
              </p>
              <div className="flex flex-wrap gap-1">
                {row.original.projects.slice(0, 2).map((proj) => (
                  <Badge
                    key={proj.id}
                    variant="outline"
                    className="max-w-[160px] truncate rounded-full text-[10px] px-2 whitespace-nowrap block"
                    title={proj.name}
                  >
                    {proj.name}
                  </Badge>
                ))}
                {overflow.length > 0 && (
                  <TooltipProvider delayDuration={200}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Badge
                          variant="outline"
                          className="cursor-default rounded-full text-[10px]"
                        >
                          +{overflow.length}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent
                        side="top"
                        className="max-w-56 space-y-1 p-3"
                      >
                        <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                          Outros projetos
                        </p>
                        {overflow.map((proj) => (
                          <div key={proj.id} className="flex items-center gap-2">
                            <span
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: proj.color }}
                            />
                            <span className="text-xs">{proj.name}</span>
                          </div>
                        ))}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </div>
          );
        },
      },
      {
        id: "alerts",
        accessorFn: (row) => row.alerts.length,
        header: ({ column }) => (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              size="sm"
              className="-mr-3 h-8 px-3"
              onClick={() =>
                column.toggleSorting(column.getIsSorted() === "asc")
              }
            >
              Alertas
              <SortIcon sorted={column.getIsSorted()} />
            </Button>
          </div>
        ),
        cell: ({ row }) => (
          <div className="space-y-1 text-right">
            {row.original.alerts.length > 0 ? (
              <>
                <p className="text-sm font-semibold text-foreground">
                  {row.original.alerts.length}
                </p>
                <p className="max-w-40 text-[11px] text-muted-foreground">
                  {row.original.alerts[0]?.label}
                </p>
              </>
            ) : (
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400">
                Sem alertas
              </p>
            )}
          </div>
        ),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: filteredUsers,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <div className="space-y-6">
        {loading ? <PerformanceSkeleton /> : null}
        {!loading && error ? (
          <div
            className="rounded-3xl border border-rose-500/20 bg-rose-500/5 p-6"
            role="alert"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-base font-semibold text-foreground">
                  Não foi possível carregar a performance da equipe
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{error}</p>
              </div>
              <Button onClick={onRetry} className="gap-2 self-start">
                <RefreshCw className="h-4 w-4" />
                Tentar novamente
              </Button>
            </div>
          </div>
        ) : null}

        {!loading && !error && data ? (
          <>
            {/* Summary cards — manager-focused, without commits */}
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              <SummaryCard
                title="Colaboradores"
                value={String(data.summary.monitoredUsers)}
                detail={`${data.summary.connectedUsers} com Azure ativo`}
                icon={<UserCog className="h-5 w-5" />}
                accent="bg-[linear-gradient(135deg,#0f766e,#14b8a6)]"
              />
              <SummaryCard
                title="Tarefas ativas"
                value={String(data.summary.activeItems)}
                detail={`${formatHours(data.summary.remainingHours)} restantes no backlog`}
                icon={<KanbanSquare className="h-5 w-5" />}
                accent="bg-[linear-gradient(135deg,#1d4ed8,#38bdf8)]"
              />
              <SummaryCard
                title="Horas lançadas (semana)"
                value={formatDuration(data.summary.loggedThisWeekMinutes)}
                detail={`${data.summary.pendingTimesheets} timesheet(s) pendente(s)`}
                icon={<Clock3 className="h-5 w-5" />}
                accent="bg-[linear-gradient(135deg,#7c2d12,#fb923c)]"
              />
              <SummaryCard
                title="Em atenção"
                value={String(data.summary.usersWithAlerts)}
                detail={`${data.summary.usersWithoutAzure} sem leitura Azure completa`}
                icon={<AlertTriangle className="h-5 w-5" />}
                accent="bg-[linear-gradient(135deg,#b45309,#f59e0b)]"
              />
              <SummaryCard
                title="Score médio"
                value={String(data.summary.averagePerformanceScore)}
                detail={`Atualizado ${getRelativeTime(data.generatedAt)}`}
                icon={<TrendingUp className="h-5 w-5" />}
                accent="bg-[linear-gradient(135deg,#166534,#4ade80)]"
                actionNode={<ScoreExplanationDialog />}
              />
            </div>

            {/* Table card */}
            <div>
              <Card className="overflow-hidden border-border/50 bg-card/80 shadow-sm">
                <CardHeader className="border-b border-border/50 pb-4">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <CardTitle className="font-display text-xl">
                        Equipe — capacidade e backlog por colaborador
                      </CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Visão de disponibilidade semanal, tarefas ativas no
                        Azure DevOps e riscos operacionais. Itens concluídos,
                        cancelados e removidos são excluídos automaticamente.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant="outline"
                        className="rounded-full px-3 py-1"
                      >
                        <ShieldCheck className="mr-1.5 h-3.5 w-3.5" />
                        Atualizado {getRelativeTime(data.generatedAt)}
                      </Badge>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={onRetry}
                      >
                        <RefreshCw className="h-4 w-4" />
                        Atualizar
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 p-5">
                  {/* Filters */}
                  <div className="flex flex-col gap-3 md:flex-row">
                    <div className="relative flex-1">
                      <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                      <Input
                        value={search}
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          startTransition(() => setSearch(nextValue));
                        }}
                        placeholder="Buscar por nome, projeto ou tarefa"
                        className="h-11 pl-10"
                        aria-label="Buscar colaboradores"
                      />
                    </div>
                    <Select
                      value={healthFilter}
                      onValueChange={(value) =>
                        startTransition(() =>
                          setHealthFilter(value as HealthFilterValue),
                        )
                      }
                    >
                      <SelectTrigger
                        className="h-11 w-full md:w-44"
                        aria-label="Filtrar por saúde"
                      >
                        <SelectValue placeholder="Saúde" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Toda saúde</SelectItem>
                        <SelectItem value="excellent">Excelente</SelectItem>
                        <SelectItem value="stable">Estável</SelectItem>
                        <SelectItem value="attention">Atenção</SelectItem>
                        <SelectItem value="critical">Crítico</SelectItem>
                        <SelectItem value="offline">Offline</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant={alertsOnly ? "default" : "outline"}
                      className="h-11 gap-2 md:w-36"
                      onClick={() =>
                        startTransition(() =>
                          setAlertsOnly((current) => !current),
                        )
                      }
                      aria-pressed={alertsOnly}
                    >
                      <Filter className="h-4 w-4" />
                      Só alertas
                    </Button>
                  </div>

                  {/* Row count + period */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-muted-foreground">
                      {filteredUsers.length} colaborador(es) no recorte atual.
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <span>
                        Semana: {formatDate(data.period.weekStart)} →{" "}
                        {formatDate(data.period.weekEnd)}
                      </span>
                    </div>
                  </div>

                  {/* Mobile cards */}
                  <div className="space-y-3 lg:hidden">
                    {table.getRowModel().rows.length === 0 ? (
                      <div className="rounded-2xl border border-border/60 bg-background/70 p-6 text-center">
                        <p className="font-medium text-foreground">
                          Nenhum colaborador encontrado
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          Ajuste os filtros para ampliar o recorte.
                        </p>
                      </div>
                    ) : (
                      table.getRowModel().rows.map((row) => {
                        const logged =
                          row.original.metrics.loggedThisWeekMinutes / 60;
                        const available = Math.max(
                          0,
                          row.original.user.weeklyCapacity - logged,
                        );
                        return (
                          <button
                            key={row.original.user.id}
                            type="button"
                            onClick={() =>
                              setSelectedUserId(row.original.user.id)
                            }
                            className="w-full rounded-3xl border border-border/60 bg-background/80 p-4 text-left transition-colors hover:border-brand-500/30"
                          >
                            <div className="flex items-start gap-3">
                              <UserAvatar
                                name={row.original.user.name}
                                image={row.original.user.image}
                                size="sm"
                              />
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-foreground">
                                    {row.original.user.name}
                                  </p>
                                  <HealthBadge
                                    health={row.original.metrics.health}
                                  />
                                </div>
                                <p className="truncate text-sm text-muted-foreground">
                                  {row.original.user.email}
                                </p>
                                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      Tarefas ativas
                                    </p>
                                    <p className="font-semibold text-foreground">
                                      {row.original.metrics.activeItems}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      Disponível
                                    </p>
                                    <p className="font-semibold text-foreground">
                                      {formatHours(available)}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      Horas semana
                                    </p>
                                    <p className="font-semibold text-foreground">
                                      {formatDuration(
                                        row.original.metrics
                                          .loggedThisWeekMinutes,
                                      )}
                                    </p>
                                  </div>
                                  <div>
                                    <p className="text-xs text-muted-foreground">
                                      Alertas
                                    </p>
                                    <p className="font-semibold text-foreground">
                                      {row.original.alerts.length}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {/* Desktop table — fills card width, scrolls only when truly needed */}
                  <div className="hidden overflow-hidden rounded-3xl border border-border/60 bg-background/60 lg:block">
                    <div className="overflow-x-auto">
                      <Table className="w-full table-fixed">
                        <TableHeader>
                          {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow
                              key={headerGroup.id}
                              className="hover:bg-transparent"
                            >
                              {headerGroup.headers.map((header) => (
                                <TableHead
                                  key={header.id}
                                  className={cn(
                                    "px-4",
                                    header.column.id === "alerts" &&
                                      "text-right",
                                    header.column.id === "user" && "w-[22%]",
                                    header.column.id === "score" && "w-[16%]",
                                    header.column.id === "workload" && "w-[14%]",
                                    header.column.id === "availability" &&
                                      "w-[15%]",
                                    header.column.id === "projects" && "w-[20%]",
                                    header.column.id === "alerts" && "w-[13%]",
                                  )}
                                >
                                  {header.isPlaceholder
                                    ? null
                                    : flexRender(
                                        header.column.columnDef.header,
                                        header.getContext(),
                                      )}
                                </TableHead>
                              ))}
                            </TableRow>
                          ))}
                        </TableHeader>
                        <TableBody>
                          {table.getRowModel().rows.length === 0 ? (
                            <TableRow>
                              <TableCell
                                colSpan={columns.length}
                                className="h-36 text-center"
                              >
                                <div className="space-y-1">
                                  <p className="font-medium text-foreground">
                                    Nenhum colaborador encontrado
                                  </p>
                                  <p className="text-sm text-muted-foreground">
                                    Ajuste os filtros para ampliar o recorte.
                                  </p>
                                </div>
                              </TableCell>
                            </TableRow>
                          ) : (
                            table.getRowModel().rows.map((row) => (
                              <TableRow
                                key={row.original.user.id}
                                className="cursor-pointer"
                                onClick={() =>
                                  setSelectedUserId(row.original.user.id)
                                }
                              >
                                {row.getVisibleCells().map((cell) => (
                                  <TableCell
                                    key={cell.id}
                                    className={cn(
                                      "px-4 align-top py-4",
                                      cell.column.id === "alerts" &&
                                        "text-right",
                                    )}
                                  >
                                    {flexRender(
                                      cell.column.columnDef.cell,
                                      cell.getContext(),
                                    )}
                                  </TableCell>
                                ))}
                              </TableRow>
                            ))
                          )}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : null}
      </div>

      <UserPerformanceSheet
        row={selectedUser}
        open={selectedUser !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedUserId(null);
        }}
        sessionRole={sessionRole}
        sessionUserId={sessionUserId}
        onActionSuccess={onRetry}
      />
    </>
  );
}
