"use client";

import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCheck,
  CheckCircle2,
  Clock,
  Filter,
  Inbox,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserCheck,
  XCircle,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/shared/user-avatar";
import { ProjectCombobox } from "@/components/time/ProjectCombobox";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
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

const SEVERITY_STYLES: Record<AnomalySeverity, string> = {
  critical: "bg-red-500/10 text-red-600 dark:text-red-400",
  warning: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
  info: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
};

const FILTER_OPTIONS = ["all", "ready", "review"] as const;
const SORT_OPTIONS = [
  "oldest",
  "alerts",
  "newest",
  "hours_desc",
  "person_asc",
] as const;

type QueueFilter = (typeof FILTER_OPTIONS)[number];
type QueueSort = (typeof SORT_OPTIONS)[number];

export interface ApprovalsTabProps {
  controller: ApprovalsController;
}

interface RejectDialogState {
  timesheetId: string;
  userName: string;
}

interface QueueOption {
  value: string;
  label: string;
}

const EMPTY_PENDING: ApprovalInsight[] = [];

function isQueueFilter(value: string): value is QueueFilter {
  return FILTER_OPTIONS.includes(value as QueueFilter);
}

function isQueueSort(value: string): value is QueueSort {
  return SORT_OPTIONS.includes(value as QueueSort);
}

function normalizeSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function getSubmittedAgeDays(submittedAt: string | null): number | null {
  if (!submittedAt) return null;
  const submittedTime = new Date(submittedAt).getTime();
  if (Number.isNaN(submittedTime)) return null;
  const diff = Date.now() - submittedTime;
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function getSubmittedAgeLabel(submittedAt: string | null): string {
  const ageDays = getSubmittedAgeDays(submittedAt);
  if (ageDays === null) return "Sem data de submissão";
  if (ageDays === 0) return "Submetido há menos de 24h";
  if (ageDays === 1) return "Submetido há 1 dia";
  return `Submetido há ${ageDays} dias`;
}

function getSubmittedDateLabel(submittedAt: string | null): string {
  if (!submittedAt) return "Data indisponível";
  const date = new Date(submittedAt);
  if (Number.isNaN(date.getTime())) return "Data indisponível";
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(date);
}

function getCriticalCount(insight: ApprovalInsight): number {
  return insight.anomalies.filter((item) => item.severity === "critical")
    .length;
}

function getWarningCount(insight: ApprovalInsight): number {
  return insight.anomalies.filter((item) => item.severity === "warning").length;
}

function getReviewWeight(insight: ApprovalInsight): number {
  return getCriticalCount(insight) * 3 + getWarningCount(insight) * 2;
}

function compareSubmittedAt(a: ApprovalInsight, b: ApprovalInsight): number {
  const aTime = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
  const bTime = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
  return aTime - bTime;
}

function buildProjectOptions(
  items: ApprovalInsight[],
): Array<{ id: string; name: string; color: string }> {
  const projects = new Map<string, string>();
  for (const insight of items) {
    for (const project of insight.projects) {
      projects.set(project.name, project.color);
    }
  }

  return [...projects].map(([name, color]) => ({ id: name, name, color }));
}

function buildPeriodOptions(items: ApprovalInsight[]): QueueOption[] {
  const periods = new Map<string, string>();
  for (const insight of items) {
    periods.set(insight.period, insight.periodLabel);
  }

  return [...periods.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))
    .map(([value, label]) => ({ value, label }));
}

function getSortedQueue(
  items: ApprovalInsight[],
  sort: QueueSort,
): ApprovalInsight[] {
  return [...items].sort((a, b) => {
    if (sort === "alerts") {
      return (
        getReviewWeight(b) - getReviewWeight(a) || compareSubmittedAt(a, b)
      );
    }
    if (sort === "newest") return compareSubmittedAt(b, a);
    if (sort === "hours_desc") return b.totalMinutes - a.totalMinutes;
    if (sort === "person_asc") {
      return a.userName.localeCompare(b.userName, "pt-BR");
    }
    return compareSubmittedAt(a, b);
  });
}

function ProjectDots({ projects }: { projects: ApprovalInsight["projects"] }) {
  return (
    <span className="flex items-center gap-1">
      {projects.slice(0, 5).map((project) => (
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
      {projects.length > 5 ? (
        <span className="text-[10px] text-muted-foreground">
          +{projects.length - 5}
        </span>
      ) : null}
    </span>
  );
}

function ProjectBreakdown({
  projects,
}: {
  projects: ApprovalInsight["projects"];
}) {
  const totalMinutes = projects.reduce(
    (sum, project) => sum + project.minutes,
    0,
  );

  return (
    <div className="space-y-2">
      {projects.slice(0, 4).map((project) => {
        const ratio =
          totalMinutes > 0
            ? Math.round((project.minutes / totalMinutes) * 100)
            : 0;
        return (
          <div key={`${project.name}-${project.minutes}`} className="space-y-1">
            <div className="flex items-center justify-between gap-3 text-xs">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: project.color }}
                  aria-hidden="true"
                />
                <span className="truncate">{project.name}</span>
              </span>
              <span className="font-mono text-muted-foreground">
                {formatDuration(project.minutes)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-brand-500"
                style={{ width: `${ratio}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface InsightCardProps {
  insight: ApprovalInsight;
  selected: boolean;
  selectable: boolean;
  onToggle: (timesheetId: string) => void;
  onApprove: (insight: ApprovalInsight) => void;
  onReject: (insight: ApprovalInsight) => void;
  busy: boolean;
}

function InsightCard({
  insight,
  selected,
  selectable,
  onToggle,
  onApprove,
  onReject,
  busy,
}: InsightCardProps) {
  const criticalCount = getCriticalCount(insight);
  const warningCount = getWarningCount(insight);
  const billableRatio =
    insight.totalMinutes > 0
      ? Math.round((insight.billableMinutes / insight.totalMinutes) * 100)
      : 0;

  function handleToggle(): void {
    onToggle(insight.timesheetId);
  }

  function handleApproveClick(): void {
    onApprove(insight);
  }

  function handleRejectClick(): void {
    onReject(insight);
  }

  return (
    <Card
      className={cn(
        "gap-0 overflow-hidden py-0 transition-colors duration-150 hover:border-brand-500/30",
        selected && "border-emerald-500/50 bg-emerald-500/5",
      )}
    >
      <CardContent className="p-0">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <div className="space-y-4 p-4">
            <div className="flex items-start gap-3">
              <input
                type="checkbox"
                checked={selected}
                disabled={!selectable || busy}
                onChange={handleToggle}
                aria-label={`Selecionar timesheet de ${insight.userName} para aprovação em lote`}
                className="mt-1 size-4 rounded border-border accent-emerald-600 disabled:cursor-not-allowed disabled:opacity-40"
              />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <UserAvatar
                      name={insight.userName}
                      image={insight.userImage}
                      size="sm"
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {insight.userName}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {insight.periodLabel}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {insight.conformant ? (
                      <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        <ShieldCheck aria-hidden="true" />
                        Conforme
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        <ShieldAlert aria-hidden="true" />
                        Revisar
                      </Badge>
                    )}
                    {criticalCount > 0 ? (
                      <Badge className="bg-red-500/10 text-red-600 dark:text-red-400">
                        {criticalCount} crítico{criticalCount === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                    {warningCount > 0 ? (
                      <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        {warningCount} alerta{warningCount === 1 ? "" : "s"}
                      </Badge>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-mono font-semibold">
                      {formatDuration(insight.totalMinutes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Faturável</p>
                    <p className="font-mono font-semibold">
                      {billableRatio}% ·{" "}
                      {formatDuration(insight.billableMinutes)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Registros</p>
                    <p className="font-mono font-semibold">
                      {insight.entryCount}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Submissão</p>
                    <p className="font-medium">
                      {getSubmittedAgeLabel(insight.submittedAt)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {getSubmittedDateLabel(insight.submittedAt)}
                    </p>
                  </div>
                </div>

                {insight.anomalies.length > 0 ? (
                  <ul className="space-y-1.5">
                    {insight.anomalies.map((anomaly) => (
                      <li
                        key={`${anomaly.kind}-${anomaly.entryIds.join("-")}`}
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
                          <span className="font-semibold">
                            {anomaly.label}:
                          </span>{" "}
                          {anomaly.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-700 dark:text-emerald-300">
                    Nenhuma anomalia detectada pelas regras atuais. A decisão
                    depende da revisão dos lançamentos antes de aprovar.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-border/60 border-t bg-muted/20 p-4 lg:border-t-0 lg:border-l">
            <div className="flex h-full flex-col justify-between gap-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-medium text-muted-foreground">
                    Projetos no período
                  </span>
                  <ProjectDots projects={insight.projects} />
                </div>
                <ProjectBreakdown projects={insight.projects} />
              </div>

              <div className="space-y-3">
                <Link
                  href={`/dashboard/timesheets/${insight.timesheetId}?from=/dashboard/hq?tab=approvals`}
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-brand-500"
                >
                  Abrir lançamentos reais
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                </Link>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={handleRejectClick}
                    className="flex-1 text-red-600 hover:text-red-600 dark:text-red-400"
                  >
                    <XCircle className="size-4" aria-hidden="true" />
                    Rejeitar
                  </Button>
                  <Button
                    size="sm"
                    disabled={busy}
                    onClick={handleApproveClick}
                    className="flex-1 bg-brand-500 text-white hover:bg-brand-600"
                  >
                    <CheckCircle2 className="size-4" aria-hidden="true" />
                    Aprovar
                  </Button>
                </div>
              </div>
            </div>
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

  const shouldReduceMotion = useReducedMotion();
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
  const [query, setQuery] = useState("");
  const [queueFilter, setQueueFilter] = useState<QueueFilter>("all");
  const [sortMode, setSortMode] = useState<QueueSort>("oldest");
  const [projectFilter, setProjectFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const pendingItems = data?.pending ?? EMPTY_PENDING;

  const projectOptions = useMemo(
    () => buildProjectOptions(pendingItems),
    [pendingItems],
  );
  const periodOptions = useMemo(
    () => buildPeriodOptions(pendingItems),
    [pendingItems],
  );

  const filteredQueue = useMemo(() => {
    const normalizedQuery = normalizeSearch(query);
    const filtered = pendingItems.filter((insight) => {
      if (queueFilter === "ready" && !insight.conformant) return false;
      if (queueFilter === "review" && insight.conformant) return false;
      if (projectFilter !== "all") {
        const hasProject = insight.projects.some(
          (project) => project.name === projectFilter,
        );
        if (!hasProject) return false;
      }
      if (periodFilter !== "all" && insight.period !== periodFilter) {
        return false;
      }
      if (!normalizedQuery) return true;

      const searchable = normalizeSearch(
        [
          insight.userName,
          insight.periodLabel,
          ...insight.projects.map((project) => project.name),
        ].join(" "),
      );
      return searchable.includes(normalizedQuery);
    });

    return getSortedQueue(filtered, sortMode);
  }, [pendingItems, query, queueFilter, projectFilter, periodFilter, sortMode]);

  const visibleConformant = useMemo(
    () => filteredQueue.filter((item) => item.conformant),
    [filteredQueue],
  );

  const selectedVisibleConformant = useMemo(
    () => visibleConformant.filter((item) => selectedIds.has(item.timesheetId)),
    [visibleConformant, selectedIds],
  );

  const selectedMinutes = selectedVisibleConformant.reduce(
    (sum, item) => sum + item.totalMinutes,
    0,
  );

  const oldestPending = useMemo(() => {
    if (pendingItems.length === 0) return null;
    return getSortedQueue(pendingItems, "oldest")[0] ?? null;
  }, [pendingItems]);

  const highAttentionCount = pendingItems.filter(
    (item) => getCriticalCount(item) > 0,
  ).length;

  useEffect(() => {
    setSelectedIds((current) => {
      const allowed = new Set(pendingItems.map((item) => item.timesheetId));
      const next = new Set<string>();
      for (const id of current) {
        if (allowed.has(id)) next.add(id);
      }
      return next;
    });
  }, [pendingItems]);

  const markBusy = useCallback((id: string, busy: boolean): void => {
    setBusyIds((current) => {
      const next = new Set(current);
      if (busy) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const handleQueryChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>): void => {
      setQuery(event.target.value);
    },
    [],
  );

  const handleQueueFilterChange = useCallback((value: string): void => {
    if (isQueueFilter(value)) setQueueFilter(value);
  }, []);

  const handleSortModeChange = useCallback((value: string): void => {
    if (isQueueSort(value)) setSortMode(value);
  }, []);

  const handleProjectFilterChange = useCallback((value: string): void => {
    setProjectFilter(value);
  }, []);

  const handlePeriodFilterChange = useCallback((value: string): void => {
    setPeriodFilter(value);
  }, []);

  const handleClearFilters = useCallback((): void => {
    setQuery("");
    setQueueFilter("all");
    setSortMode("oldest");
    setProjectFilter("all");
    setPeriodFilter("all");
  }, []);

  const handleToggleSelected = useCallback((timesheetId: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(timesheetId)) next.delete(timesheetId);
      else next.add(timesheetId);
      return next;
    });
  }, []);

  const handleSelectVisibleConformant = useCallback((): void => {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const item of visibleConformant) next.add(item.timesheetId);
      return next;
    });
  }, [visibleConformant]);

  const handleClearSelection = useCallback((): void => {
    setSelectedIds(new Set());
  }, []);

  const handleOpenReject = useCallback((insight: ApprovalInsight): void => {
    setRejectState({
      timesheetId: insight.timesheetId,
      userName: insight.userName,
    });
  }, []);

  const handleCancelReject = useCallback((): void => {
    setRejectState(null);
    setRejectReason("");
  }, []);

  const handleRejectOpenChange = useCallback((open: boolean): void => {
    if (!open) {
      setRejectState(null);
      setRejectReason("");
    }
  }, []);

  const handleRejectReasonChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>): void => {
      setRejectReason(event.target.value);
    },
    [],
  );

  const handleApprove = useCallback(
    async (insight: ApprovalInsight): Promise<void> => {
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
    (insight: ApprovalInsight): void => {
      if (insight.conformant) {
        void handleApprove(insight);
      } else {
        setConfirmApprove(insight);
      }
    },
    [handleApprove],
  );

  const handleConfirmApproveOpenChange = useCallback((open: boolean): void => {
    if (!open) setConfirmApprove(null);
  }, []);

  const handleApproveDespiteAnomalies = useCallback((): void => {
    if (confirmApprove) void handleApprove(confirmApprove);
    setConfirmApprove(null);
  }, [confirmApprove, handleApprove]);

  const handleBatchApprove = useCallback(async (): Promise<void> => {
    if (selectedVisibleConformant.length === 0) return;

    setBatchRunning(true);
    try {
      const results = await approveBatch(
        selectedVisibleConformant.map((item) => item.timesheetId),
      );
      const approved = results.filter((item) => item.status === "approved");
      const failed = results.length - approved.length;

      if (failed === 0) {
        toast.success(
          `${approved.length} timesheet${approved.length === 1 ? "" : "s"} aprovado${approved.length === 1 ? "" : "s"} em lote.`,
        );
        setSelectedIds(new Set());
      } else {
        toast.warning(
          `${approved.length} aprovados, ${failed} falharam. Confira a fila atualizada.`,
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
  }, [selectedVisibleConformant, approveBatch]);

  const handleRejectSubmit = useCallback(async (): Promise<void> => {
    if (!rejectState) return;
    if (rejectReason.trim().length < 10) {
      toast.error("Descreva o motivo com pelo menos 10 caracteres.");
      return;
    }

    setRejectSubmitting(true);
    try {
      await rejectOne(rejectState.timesheetId, rejectReason.trim());
      toast.success(
        `Timesheet de ${rejectState.userName} rejeitado. A pessoa verá o motivo para corrigir e reenviar.`,
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
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-48 w-full" />
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
          <p className="font-medium">Caixa de aprovações zerada</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Nenhum timesheet aguardando decisão. Novas submissões aparecem aqui
            com idade, horas, projetos e triagem automática de anomalias.
          </p>
        </CardContent>
      </Card>
    );
  }

  const hasActiveFilters =
    query !== "" ||
    queueFilter !== "all" ||
    projectFilter !== "all" ||
    periodFilter !== "all" ||
    sortMode !== "oldest";

  return (
    <TooltipProvider delayDuration={150}>
      <motion.div
        variants={shouldReduceMotion ? undefined : containerVariants}
        initial={shouldReduceMotion ? false : "hidden"}
        animate="visible"
        className="space-y-6"
      >
        <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
          <Card
            data-tour="hq-approvals-summary"
            className="gap-0 overflow-hidden py-0"
          >
            <CardContent className="p-0">
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_22rem]">
                <div className="space-y-5 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-brand-600 dark:text-brand-400">
                        Central de decisão
                      </p>
                      <h2 className="font-sora text-2xl font-semibold tracking-normal">
                        {data.totals.pending} timesheet
                        {data.totals.pending === 1 ? "" : "s"} aguardando você
                      </h2>
                      <p className="max-w-2xl text-sm text-muted-foreground">
                        A fila destaca idade de submissão, alertas reais e horas
                        por projeto para aprovar com contexto.
                      </p>
                    </div>
                    <Button variant="outline" size="sm" onClick={refresh}>
                      <RefreshCw className="size-4" aria-hidden="true" />
                      Atualizar
                    </Button>
                  </div>

                  <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                      <Clock
                        className="mb-2 size-4 text-brand-500"
                        aria-hidden="true"
                      />
                      <p className="font-mono text-lg font-semibold">
                        {formatDuration(data.totals.totalMinutes)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        horas submetidas
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                      <ShieldCheck
                        className="mb-2 size-4 text-emerald-500"
                        aria-hidden="true"
                      />
                      <p className="font-mono text-lg font-semibold">
                        {data.totals.conformant}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        prontos para lote
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                      <ShieldAlert
                        className="mb-2 size-4 text-amber-500"
                        aria-hidden="true"
                      />
                      <p className="font-mono text-lg font-semibold">
                        {data.totals.withAnomalies}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        com alertas
                      </p>
                    </div>
                    <div className="rounded-lg border border-border/60 bg-background/60 p-3">
                      <CalendarDays
                        className="mb-2 size-4 text-sky-500"
                        aria-hidden="true"
                      />
                      <p className="font-mono text-lg font-semibold">
                        {oldestPending
                          ? (getSubmittedAgeDays(oldestPending.submittedAt) ??
                            0)
                          : 0}
                        d
                      </p>
                      <p className="text-xs text-muted-foreground">
                        mais antigo na fila
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-border/60 border-t bg-muted/20 p-5 lg:border-t-0 lg:border-l">
                  <div className="flex h-full flex-col justify-between gap-5">
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <Sparkles
                          className="size-4 text-emerald-500"
                          aria-hidden="true"
                        />
                        <p className="text-sm font-semibold">
                          Aprovação em lote controlada
                        </p>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Apenas itens conformes, selecionados e visíveis com os
                        filtros atuais serão aprovados após sua confirmação.
                      </p>
                      <div className="rounded-lg bg-background/70 p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-xs text-muted-foreground">
                            Selecionados agora
                          </span>
                          <span className="font-mono text-sm font-semibold">
                            {selectedVisibleConformant.length} ·{" "}
                            {formatDuration(selectedMinutes)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-col gap-2">
                      <div className="grid grid-cols-2 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleSelectVisibleConformant}
                          disabled={
                            visibleConformant.length === 0 || batchRunning
                          }
                        >
                          <UserCheck className="size-4" aria-hidden="true" />
                          Selecionar visíveis
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={handleClearSelection}
                          disabled={selectedIds.size === 0 || batchRunning}
                        >
                          Limpar seleção
                        </Button>
                      </div>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button
                            disabled={
                              selectedVisibleConformant.length === 0 ||
                              batchRunning
                            }
                            className="bg-brand-500 text-white hover:bg-brand-600"
                          >
                            <CheckCheck className="size-4" aria-hidden="true" />
                            {batchRunning
                              ? "Aprovando..."
                              : `Aprovar ${selectedVisibleConformant.length || ""} selecionado${selectedVisibleConformant.length === 1 ? "" : "s"}`}
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent className="flex max-h-[85vh] flex-col overflow-hidden sm:max-w-lg">
                          <AlertDialogHeader className="shrink-0">
                            <AlertDialogTitle>
                              Aprovar seleção visível
                            </AlertDialogTitle>
                            <AlertDialogDescription>
                              {selectedVisibleConformant.length} timesheet
                              {selectedVisibleConformant.length === 1
                                ? ""
                                : "s"}{" "}
                              conforme
                              {selectedVisibleConformant.length === 1
                                ? ""
                                : "s"}{" "}
                              e selecionado
                              {selectedVisibleConformant.length === 1
                                ? ""
                                : "s"}{" "}
                              na fila filtrada ser
                              {selectedVisibleConformant.length === 1
                                ? "á"
                                : "ão"}{" "}
                              aprovado
                              {selectedVisibleConformant.length === 1
                                ? ""
                                : "s"}
                              , totalizando{" "}
                              <span className="font-mono font-semibold text-foreground">
                                {formatDuration(selectedMinutes)}
                              </span>
                              .
                            </AlertDialogDescription>
                          </AlertDialogHeader>

                          <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-border/60 bg-muted/20 p-2.5">
                            {selectedVisibleConformant.map((item) => (
                              <div
                                key={item.timesheetId}
                                className="flex items-center justify-between gap-3 rounded-lg bg-background px-3 py-2 text-sm"
                              >
                                <span className="truncate">
                                  {item.userName}
                                </span>
                                <span className="shrink-0 font-mono text-xs text-muted-foreground">
                                  {formatDuration(item.totalMinutes)}
                                </span>
                              </div>
                            ))}
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
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div variants={shouldReduceMotion ? undefined : itemVariants}>
          <Card className="gap-0 py-4">
            <CardContent className="space-y-4 px-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Filter
                    className="size-4 text-brand-500"
                    aria-hidden="true"
                  />
                  <h3 className="text-sm font-semibold">Triagem da fila</h3>
                  <Badge variant="outline">
                    {filteredQueue.length} de {pendingItems.length}
                  </Badge>
                </div>
                {hasActiveFilters ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearFilters}
                  >
                    Limpar filtros
                  </Button>
                ) : null}
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(14rem,1.4fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)_minmax(10rem,1fr)]">
                <div className="space-y-2">
                  <Label htmlFor="approvals-search">Buscar</Label>
                  <div className="relative">
                    <Search
                      className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      id="approvals-search"
                      value={query}
                      onChange={handleQueryChange}
                      placeholder="Pessoa, projeto ou período"
                      className="pl-9"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approvals-status">Status</Label>
                  <Select
                    value={queueFilter}
                    onValueChange={handleQueueFilterChange}
                  >
                    <SelectTrigger id="approvals-status">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      <SelectItem value="ready">Prontos para lote</SelectItem>
                      <SelectItem value="review">Com alertas</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approvals-project">Projeto</Label>
                  <ProjectCombobox
                    id="approvals-project"
                    projects={projectOptions}
                    value={projectFilter}
                    onChange={handleProjectFilterChange}
                    emptyOption={{ value: "all", label: "Todos os projetos" }}
                    placeholder="Buscar ou selecionar projeto..."
                    byPassMemberFilter
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approvals-period">Período</Label>
                  <Select
                    value={periodFilter}
                    onValueChange={handlePeriodFilterChange}
                  >
                    <SelectTrigger id="approvals-period">
                      <SelectValue placeholder="Período" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos os períodos</SelectItem>
                      {periodOptions.map((period) => (
                        <SelectItem key={period.value} value={period.value}>
                          {period.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="approvals-sort">Ordenar</Label>
                  <Select value={sortMode} onValueChange={handleSortModeChange}>
                    <SelectTrigger id="approvals-sort">
                      <SelectValue placeholder="Ordenação" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="oldest">
                        Mais antigas primeiro
                      </SelectItem>
                      <SelectItem value="alerts">
                        Mais alertas primeiro
                      </SelectItem>
                      <SelectItem value="newest">
                        Mais recentes primeiro
                      </SelectItem>
                      <SelectItem value="hours_desc">
                        Mais horas primeiro
                      </SelectItem>
                      <SelectItem value="person_asc">Pessoa A-Z</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <Separator />

              <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>{visibleConformant.length} conforme(s) visível(is)</span>
                <span aria-hidden="true">·</span>
                <span>
                  {highAttentionCount} com alerta crítico na fila total
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Lote atual: {selectedVisibleConformant.length} selecionado(s)
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.section
          data-tour="hq-approvals-queue"
          initial={
            shouldReduceMotion
              ? false
              : { opacity: 0, transform: "translateY(12px)" }
          }
          animate={{ opacity: 1, transform: "translateY(0)" }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }}
          className="space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold">Fila de aprovação</h3>
            <p className="text-xs text-muted-foreground">
              Abra os lançamentos reais quando precisar validar descrição, work
              item ou dia.
            </p>
          </div>

          {filteredQueue.length > 0 ? (
            <div className="space-y-3">
              {filteredQueue.map((insight) => (
                <InsightCard
                  key={insight.timesheetId}
                  insight={insight}
                  selected={selectedIds.has(insight.timesheetId)}
                  selectable={insight.conformant}
                  busy={busyIds.has(insight.timesheetId) || batchRunning}
                  onToggle={handleToggleSelected}
                  onApprove={handleRequestApprove}
                  onReject={handleOpenReject}
                />
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center gap-2 py-12 text-center">
                <Inbox
                  className="size-8 text-muted-foreground"
                  aria-hidden="true"
                />
                <p className="font-medium">Nada encontrado com estes filtros</p>
                <p className="max-w-sm text-sm text-muted-foreground">
                  Ajuste a busca, projeto, período ou status para voltar a ver a
                  fila pendente.
                </p>
              </CardContent>
            </Card>
          )}
        </motion.section>

        <AlertDialog
          open={confirmApprove !== null}
          onOpenChange={handleConfirmApproveOpenChange}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Aprovar com alertas?</AlertDialogTitle>
              <AlertDialogDescription>
                O timesheet de {confirmApprove?.userName} tem{" "}
                {confirmApprove?.anomalies.length} alerta
                {confirmApprove?.anomalies.length === 1 ? "" : "s"} detectado
                {confirmApprove?.anomalies.length === 1 ? "" : "s"}. Você pode
                aprovar mesmo assim depois de revisar os lançamentos; a decisão
                fica registrada no histórico.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Voltar</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleApproveDespiteAnomalies}
                className="bg-brand-500 text-white hover:bg-brand-600"
              >
                Aprovar mesmo assim
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog
          open={rejectState !== null}
          onOpenChange={handleRejectOpenChange}
        >
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Rejeitar timesheet</DialogTitle>
              <DialogDescription>
                Explique o que precisa ser ajustado. {rejectState?.userName}{" "}
                verá exatamente este motivo e poderá corrigir e reenviar.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="approval-rejection-reason">
                Motivo da rejeição
              </Label>
              <Textarea
                id="approval-rejection-reason"
                value={rejectReason}
                onChange={handleRejectReasonChange}
                placeholder="Ex.: as horas do fim de semana precisam de justificativa ou ajuste."
                rows={4}
                aria-describedby="approval-rejection-help"
              />
              <p
                id="approval-rejection-help"
                className="text-xs text-muted-foreground"
              >
                Mínimo de 10 caracteres.
              </p>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={handleCancelReject}
                disabled={rejectSubmitting}
              >
                Cancelar
              </Button>
              <Button
                variant="destructive"
                onClick={handleRejectSubmit}
                disabled={rejectSubmitting}
              >
                {rejectSubmitting ? "Rejeitando..." : "Rejeitar timesheet"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </motion.div>
    </TooltipProvider>
  );
}
