"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  Clock,
  History,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApprovalCard } from "@/components/timesheets/ApprovalCard";
import { HistoryCard } from "@/components/timesheets/HistoryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import type { Timesheet } from "@/hooks/use-timesheets";
import {
  useTimesheetApprovals,
  useTimesheetHistory,
} from "@/hooks/use-timesheets";
import { formatDuration } from "@/lib/utils";

// ─── Animation variants ────────────────────────────────────────────────────────

const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut",
      staggerChildren: 0.08,
    },
  },
};

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
};

const groupVariants: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
    },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};

const collapseVariants: Variants = {
  open: {
    height: "auto",
    opacity: 1,
    transition: {
      duration: 0.4,
      ease: "easeOut",
    },
  },
  closed: {
    height: 0,
    opacity: 0,
    transition: {
      duration: 0.3,
      ease: "easeOut",
    },
  },
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface WeekGroup {
  key: string;
  label: string;
  dateRange: string;
  timesheets: Timesheet[];
  totalMinutes: number;
  billableMinutes: number;
}

/** Parses a period string and returns the week start date (Monday) as a Date. */
function getWeekStart(period: string): Date {
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const year = parseInt(weekMatch[1]);
    const week = parseInt(weekMatch[2]);
    // ISO 8601: week 1 is the week containing the first Thursday of the year
    const jan4 = new Date(year, 0, 4);
    const jan4DayOfWeek = jan4.getDay() === 0 ? 7 : jan4.getDay();
    const monday = new Date(jan4);
    monday.setDate(jan4.getDate() - (jan4DayOfWeek - 1) + (week - 1) * 7);
    return monday;
  }
  // For monthly periods, use first day of the month
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return new Date(parseInt(monthMatch[1]), parseInt(monthMatch[2]) - 1, 1);
  }
  return new Date();
}

function formatWeekLabel(period: string): string {
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const weekNum = parseInt(weekMatch[2]);
    return `Semana ${weekNum}`;
  }
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
    return months[parseInt(monthMatch[2]) - 1] ?? period;
  }
  return period;
}

function formatDateRange(period: string): string {
  const weekMatch = period.match(/^(\d{4})-W(\d{2})$/);
  if (weekMatch) {
    const monday = getWeekStart(period);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const fmt = (d: Date): string =>
      d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
    return `${fmt(monday)} – ${fmt(sunday)} de ${monday.getFullYear()}`;
  }
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    const d = new Date(parseInt(monthMatch[1]), parseInt(monthMatch[2]) - 1, 1);
    return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  }
  return period;
}

/** Groups timesheets by their period, sorted newest first. */
function groupByWeek(timesheets: Timesheet[]): WeekGroup[] {
  const map = new Map<string, Timesheet[]>();

  for (const ts of timesheets) {
    const group = map.get(ts.period) ?? [];
    group.push(ts);
    map.set(ts.period, group);
  }

  const groups: WeekGroup[] = Array.from(map.entries()).map(
    ([period, sheets]) => ({
      key: period,
      label: formatWeekLabel(period),
      dateRange: formatDateRange(period),
      timesheets: sheets,
      totalMinutes: sheets.reduce((acc, ts) => acc + ts.totalMinutes, 0),
      billableMinutes: sheets.reduce((acc, ts) => acc + ts.billableMinutes, 0),
    }),
  );

  // Sort newest period first
  groups.sort((a, b) => {
    const da = getWeekStart(a.key).getTime();
    const db = getWeekStart(b.key).getTime();
    return db - da;
  });

  return groups;
}

// ─── Sub-components ────────────────────────────────────────────────────────────

interface WeekGroupSectionProps {
  group: WeekGroup;
  isOpen: boolean;
  onToggle: () => void;
  onApprove: (id: string) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
}

function WeekGroupSection({
  group,
  isOpen,
  onToggle,
  onApprove,
  onReject,
}: WeekGroupSectionProps) {
  return (
    <motion.div variants={fadeUp} className="overflow-hidden">
      {/* Week header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Recolher" : "Expandir"} grupo ${group.label}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-card/60 px-5 py-4 text-left backdrop-blur-sm transition-colors hover:border-border/70 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CalendarDays
          className="h-4 w-4 flex-shrink-0 text-orange-400"
          aria-hidden="true"
        />

        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground text-sm">
              {group.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {group.dateRange}
            </span>
          </div>
        </div>

        {/* Stats */}
        <div className="hidden sm:flex items-center gap-4 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {group.timesheets.length}{" "}
              {group.timesheets.length === 1 ? "pessoa" : "pessoas"}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">
              {formatDuration(group.totalMinutes)}
            </span>
          </div>
          <Badge
            variant="secondary"
            className="bg-orange-500/10 text-orange-400 border-orange-500/20 text-[11px]"
          >
            {group.timesheets.length} pendente
            {group.timesheets.length !== 1 ? "s" : ""}
          </Badge>
        </div>

        {/* Mobile badge */}
        <Badge
          variant="secondary"
          className="sm:hidden bg-orange-500/10 text-orange-400 border-orange-500/20 text-[11px]"
        >
          {group.timesheets.length}
        </Badge>

        <motion.div
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 text-muted-foreground"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </button>

      {/* Cards */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="cards"
            initial="closed"
            animate="open"
            exit="closed"
            variants={collapseVariants}
            className="overflow-hidden"
          >
            <motion.div
              variants={groupVariants}
              initial="hidden"
              animate="visible"
              className="mt-2 space-y-2 pl-2"
            >
              {group.timesheets.map((ts) => (
                <motion.div key={ts.id} variants={cardVariants}>
                  <ApprovalCard
                    timesheet={ts}
                    onApprove={onApprove}
                    onReject={onReject}
                  />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── History section ────────────────────────────────────────────────────────────

interface HistoryWeekGroup extends Omit<WeekGroup, "timesheets"> {
  timesheets: Timesheet[];
  approvedCount: number;
  rejectedCount: number;
}

function groupHistoryByWeek(timesheets: Timesheet[]): HistoryWeekGroup[] {
  const map = new Map<string, Timesheet[]>();
  for (const ts of timesheets) {
    const group = map.get(ts.period) ?? [];
    group.push(ts);
    map.set(ts.period, group);
  }

  const groups: HistoryWeekGroup[] = Array.from(map.entries()).map(
    ([period, sheets]) => ({
      key: period,
      label: formatWeekLabel(period),
      dateRange: formatDateRange(period),
      timesheets: sheets,
      totalMinutes: sheets.reduce((acc, ts) => acc + ts.totalMinutes, 0),
      billableMinutes: sheets.reduce((acc, ts) => acc + ts.billableMinutes, 0),
      approvedCount: sheets.filter((ts) => ts.status === "approved").length,
      rejectedCount: sheets.filter((ts) => ts.status === "rejected").length,
    }),
  );

  groups.sort((a, b) => {
    const da = getWeekStart(a.key).getTime();
    const db = getWeekStart(b.key).getTime();
    return db - da;
  });

  return groups;
}

interface HistoryWeekSectionProps {
  group: HistoryWeekGroup;
  isOpen: boolean;
  onToggle: () => void;
}

function HistoryWeekSection({
  group,
  isOpen,
  onToggle,
}: HistoryWeekSectionProps) {
  return (
    <motion.div variants={fadeUp} className="overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Recolher" : "Expandir"} histórico ${group.label}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/30 bg-card/40 px-5 py-3.5 text-left backdrop-blur-sm transition-colors hover:border-border/60 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <CalendarDays
          className="h-4 w-4 flex-shrink-0 text-muted-foreground"
          aria-hidden="true"
        />

        <div className="flex flex-1 flex-col gap-0.5 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground">
              {group.label}
            </span>
            <span className="text-xs text-muted-foreground">
              {group.dateRange}
            </span>
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{group.timesheets.length} pessoa{group.timesheets.length !== 1 ? "s" : ""}</span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">{formatDuration(group.totalMinutes)}</span>
          </div>
          {group.approvedCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-green-500/10 text-green-500 border-green-500/20 text-[11px] dark:text-green-400"
            >
              {group.approvedCount} aprovado{group.approvedCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {group.rejectedCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-destructive/10 text-destructive border-destructive/20 text-[11px]"
            >
              {group.rejectedCount} rejeitado{group.rejectedCount !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>

        {/* Mobile */}
        <span className="sm:hidden text-xs text-muted-foreground font-mono">
          {group.timesheets.length}
        </span>

        <motion.div
          animate={{ rotate: isOpen ? 0 : -90 }}
          transition={{ duration: 0.2 }}
          className="flex-shrink-0 text-muted-foreground"
          aria-hidden="true"
        >
          <ChevronDown className="h-4 w-4" />
        </motion.div>
      </button>

      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="history-cards"
            initial="closed"
            animate="open"
            exit="closed"
            variants={collapseVariants}
            className="overflow-hidden"
          >
            <motion.div
              variants={groupVariants}
              initial="hidden"
              animate="visible"
              className="mt-2 space-y-1.5 pl-2"
            >
              {group.timesheets.map((ts) => (
                <motion.div key={ts.id} variants={cardVariants}>
                  <HistoryCard timesheet={ts} />
                </motion.div>
              ))}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function TimesheetApprovalsPage() {
  const {
    timesheets: approvals,
    loading,
    approveTimesheet,
    rejectTimesheet,
  } = useTimesheetApprovals();

  // History section is opt-in (lazy load)
  const [showHistory, setShowHistory] = useState(false);
  const { timesheets: historyTimesheets, loading: historyLoading } =
    useTimesheetHistory({ enabled: showHistory });

  const pending = useMemo(
    () => approvals.filter((ts) => ts.status === "submitted"),
    [approvals],
  );

  const weekGroups = useMemo(() => groupByWeek(pending), [pending]);

  const totalMinutes = useMemo(
    () => pending.reduce((acc, ts) => acc + ts.totalMinutes, 0),
    [pending],
  );

  // History groups (only computed when showHistory)
  const historyGroups = useMemo(
    () => (showHistory ? groupHistoryByWeek(historyTimesheets) : []),
    [showHistory, historyTimesheets],
  );

  // Track collapsed state per group key; default all open
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(
    new Set(),
  );

  const [collapsedHistoryGroups, setCollapsedHistoryGroups] = useState<
    Set<string>
  >(new Set());

  const toggleGroup = useCallback((key: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const toggleHistoryGroup = useCallback((key: string) => {
    setCollapsedHistoryGroups((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleApprove = useCallback(
    async (id: string): Promise<void> => {
      try {
        await approveTimesheet(id);
        toast.success("Timesheet aprovado com sucesso.");
      } catch (error: unknown) {
        console.error("[TimesheetApprovalsPage] handleApprove:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível aprovar o timesheet.",
        );
        throw error;
      }
    },
    [approveTimesheet],
  );

  const handleReject = useCallback(
    async (id: string, reason: string): Promise<void> => {
      try {
        await rejectTimesheet(id, reason);
        toast.success("Timesheet rejeitado com sucesso.");
      } catch (error: unknown) {
        console.error("[TimesheetApprovalsPage] handleReject:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível rejeitar o timesheet.",
        );
        throw error;
      }
    },
    [rejectTimesheet],
  );

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="space-y-8"
    >
      {/* ── Header ── */}
      <motion.div variants={fadeUp} className="space-y-1">
        <h1 className="font-display text-2xl font-bold text-foreground">
          Aprovação de Timesheets
        </h1>
        <p className="text-sm text-muted-foreground">
          {loading
            ? "Carregando…"
            : `${pending.length} timesheet${pending.length !== 1 ? "s" : ""} aguardando aprovação${weekGroups.length > 0 ? `, distribuídos em ${weekGroups.length} semana${weekGroups.length !== 1 ? "s" : ""}` : "."}`}
        </p>
      </motion.div>

      {/* ── Summary stats ── */}
      {!loading && pending.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-3 sm:grid-cols-3"
        >
          <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Pendentes
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {pending.length}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Total de Horas
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {formatDuration(totalMinutes)}
            </p>
          </div>
          <div className="col-span-2 rounded-xl border border-border/40 bg-card/50 px-4 py-3 sm:col-span-1">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Semanas
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {weekGroups.length}
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Content ── */}
      {loading ? (
        <div
          className="space-y-4"
          aria-label="Carregando aprovações"
          role="status"
        >
          {Array.from({ length: 2 }).map((_, gi) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
            <div key={gi} className="space-y-2">
              <Skeleton className="h-14 w-full rounded-xl" />
              {Array.from({ length: 2 }).map((_, ci) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                <Skeleton key={ci} className="ml-2 h-20 w-full rounded-lg" />
              ))}
            </div>
          ))}
        </div>
      ) : pending.length === 0 ? (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="rounded-xl border border-dashed border-border py-20 text-center"
        >
          <CalendarDays
            className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-muted-foreground">
            Nenhum timesheet aguardando aprovação.
          </p>
          <p className="mt-1 text-xs text-muted-foreground/60">
            Quando colaboradores submeterem seus timesheets, eles aparecerão
            aqui.
          </p>
        </motion.div>
      ) : (
        <motion.div
          variants={pageVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {weekGroups.map((group) => (
            <WeekGroupSection
              key={group.key}
              group={group}
              isOpen={!collapsedGroups.has(group.key)}
              onToggle={() => toggleGroup(group.key)}
              onApprove={handleApprove}
              onReject={handleReject}
            />
          ))}
        </motion.div>
      )}

      {/* ── Approved History (optional) ── */}
      <motion.div variants={fadeUp} className="space-y-4">
        {/* Toggle button */}
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-border/40" />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowHistory((v) => !v)}
            aria-expanded={showHistory}
            aria-controls="history-section"
            className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            {showHistory ? "Ocultar histórico" : "Ver histórico de aprovações"}
            <motion.span
              animate={{ rotate: showHistory ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="inline-flex"
            >
              <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
            </motion.span>
          </Button>
          <div className="h-px flex-1 bg-border/40" />
        </div>

        {/* History content */}
        <AnimatePresence initial={false}>
          {showHistory && (
            <motion.div
              id="history-section"
              key="history"
              initial="closed"
              animate="open"
              exit="closed"
              variants={collapseVariants}
              className="overflow-hidden"
            >
              <div className="space-y-3 pb-4">
                {/* Section label */}
                <div className="flex items-center gap-2">
                  <History
                    className="h-4 w-4 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-widest">
                    Histórico
                  </h2>
                  {!historyLoading && historyTimesheets.length > 0 && (
                    <Badge
                      variant="secondary"
                      className="text-[11px] bg-muted/60"
                    >
                      {historyTimesheets.length} timesheet
                      {historyTimesheets.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                {/* Skeleton */}
                {historyLoading ? (
                  <div
                    className="space-y-2"
                    role="status"
                    aria-label="Carregando histórico"
                  >
                    {Array.from({ length: 3 }).map((_, i) => (
                      // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                      <div key={i} className="space-y-1.5">
                        <Skeleton className="h-12 w-full rounded-xl" />
                        {Array.from({ length: 2 }).map((_, j) => (
                          // biome-ignore lint/suspicious/noArrayIndexKey: skeleton
                          <Skeleton
                            key={j}
                            className="ml-2 h-16 w-full rounded-lg"
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                ) : historyGroups.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/50 py-12 text-center">
                    <History
                      className="mx-auto mb-2 h-6 w-6 text-muted-foreground/30"
                      aria-hidden="true"
                    />
                    <p className="text-sm text-muted-foreground">
                      Nenhum timesheet aprovado ou rejeitado encontrado.
                    </p>
                  </div>
                ) : (
                  <motion.div
                    variants={groupVariants}
                    initial="hidden"
                    animate="visible"
                    className="space-y-2"
                  >
                    {historyGroups.map((group) => (
                      <HistoryWeekSection
                        key={group.key}
                        group={group}
                        isOpen={!collapsedHistoryGroups.has(group.key)}
                        onToggle={() => toggleHistoryGroup(group.key)}
                      />
                    ))}
                  </motion.div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
