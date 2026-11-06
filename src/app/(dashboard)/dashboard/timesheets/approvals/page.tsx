"use client";

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { AnimatePresence, motion, type Variants } from "framer-motion";
import {
  CalendarDays,
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  Clock,
  FilterX,
  History,
  Search,
  Users,
} from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApprovalCard } from "@/components/timesheets/ApprovalCard";
import { HistoryCard } from "@/components/timesheets/HistoryCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import type { Timesheet } from "@/hooks/use-timesheets";
import {
  useTimesheetApprovals,
  useTimesheetHistory,
} from "@/hooks/use-timesheets";
import {
  formatPeriodRangeLabel,
  getPeriodCompetence,
  getPeriodWeekNumber,
  isSplitPeriod,
} from "@/lib/timesheet-periods";
import {
  cn,
  formatDuration,
  getPeriodRange,
  parseLocalDate,
} from "@/lib/utils";

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

const SKELETON_GROUPS = ["group-1", "group-2", "group-3"];
const SKELETON_ITEMS = ["item-1", "item-2"];

type ApprovalTab = "pending" | "history";
type PendingStatusFilter = "all" | "submitted" | "open" | "rejected";
type HistoryStatusFilter = "all" | "approved" | "rejected";
type SplitFilter = "all" | "split" | "regular";

// ─── Helpers ───────────────────────────────────────────────────────────────────

interface WeekGroup {
  key: string;
  label: string;
  dateRange: string;
  timesheets: Timesheet[];
  totalMinutes: number;
  billableMinutes: number;
}

/** Parses a period string and returns the week start date as a Date. */
function getWeekStart(period: string): Date {
  try {
    const { start } = getPeriodRange(
      period,
      period.includes("-W") ? "weekly" : "monthly",
    );
    return parseLocalDate(start);
  } catch {
    return new Date();
  }
}

/** Extracts competence month YYYY-MM for a timesheet period. */
function resolveTimesheetMonthKey(ts: Timesheet): string {
  const explicitCompetence = getPeriodCompetence(ts.period);
  if (explicitCompetence) return explicitCompetence;
  try {
    const { start } = getPeriodRange(ts.period, ts.periodType);
    return start.slice(0, 7);
  } catch {
    return "";
  }
}

function formatMonthOptionLabel(monthKey: string): string {
  try {
    const label = format(parseLocalDate(`${monthKey}-01`), "MMMM 'de' yyyy", {
      locale: ptBR,
    });
    return label.charAt(0).toUpperCase() + label.slice(1);
  } catch {
    return monthKey;
  }
}

function formatWeekLabel(period: string): string {
  if (period.includes("-W")) {
    const weekNum = getPeriodWeekNumber(period);
    const competence = getPeriodCompetence(period);
    if (competence) {
      const monthName = format(parseLocalDate(`${competence}-01`), "MMM", {
        locale: ptBR,
      });
      return `Semana ${parseInt(weekNum, 10)} · ${monthName}`;
    }
    return `Semana ${parseInt(weekNum, 10)}`;
  }
  const monthMatch = period.match(/^(\d{4})-(\d{2})$/);
  if (monthMatch) {
    return format(parseLocalDate(`${period}-01`), "MMMM", { locale: ptBR });
  }
  return period;
}

function formatDateRange(period: string): string {
  try {
    const { start, end } = getPeriodRange(
      period,
      period.includes("-W") ? "weekly" : "monthly",
    );
    return formatPeriodRangeLabel(start, end);
  } catch {
    return period;
  }
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
  onApprove: (id: string, options?: { force?: boolean }) => Promise<void>;
  onReject: (id: string, reason: string) => Promise<void>;
  onReopen?: (id: string, reason?: string) => Promise<void>;
}

function WeekGroupSection({
  group,
  isOpen,
  onToggle,
  onApprove,
  onReject,
  onReopen,
}: WeekGroupSectionProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="overflow-hidden"
    >
      {/* Week header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Recolher" : "Expandir"} grupo ${group.label}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/40 bg-card/60 px-4 py-2.5 text-left backdrop-blur-sm transition-colors hover:border-border/70 hover:bg-card/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {isSplitPeriod(group.key) && (
              <Badge
                variant="outline"
                className="rounded-full border-blue-500/30 bg-blue-500/10 text-blue-500 text-[10px] py-0 px-2"
              >
                Semana fracionada
              </Badge>
            )}
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
              className="mt-1.5 space-y-1.5 pl-1.5"
            >
              {group.timesheets.map((ts) => (
                <motion.div
                  key={ts.id}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <ApprovalCard
                    timesheet={ts}
                    onApprove={onApprove}
                    onReject={onReject}
                    onReopen={onReopen}
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
  onReopen?: (id: string, reason?: string) => Promise<void>;
}

function HistoryWeekSection({
  group,
  isOpen,
  onToggle,
  onReopen,
}: HistoryWeekSectionProps) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      animate="visible"
      className="overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-label={`${isOpen ? "Recolher" : "Expandir"} histórico ${group.label}`}
        className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-border/30 bg-card/40 px-4 py-2.5 text-left backdrop-blur-sm transition-colors hover:border-border/60 hover:bg-card/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
            {isSplitPeriod(group.key) && (
              <Badge
                variant="outline"
                className="rounded-full border-blue-500/30 bg-blue-500/10 text-blue-500 text-[10px] py-0 px-2"
              >
                Semana fracionada
              </Badge>
            )}
          </div>
        </div>

        <div className="hidden sm:flex items-center gap-3 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            <span>
              {group.timesheets.length} pessoa
              {group.timesheets.length !== 1 ? "s" : ""}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="font-mono">
              {formatDuration(group.totalMinutes)}
            </span>
          </div>
          {group.approvedCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-green-500/10 text-green-500 border-green-500/20 text-[11px] dark:text-green-400"
            >
              {group.approvedCount} aprovado
              {group.approvedCount !== 1 ? "s" : ""}
            </Badge>
          )}
          {group.rejectedCount > 0 && (
            <Badge
              variant="secondary"
              className="bg-destructive/10 text-destructive border-destructive/20 text-[11px]"
            >
              {group.rejectedCount} rejeitado
              {group.rejectedCount !== 1 ? "s" : ""}
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
                <motion.div
                  key={ts.id}
                  variants={cardVariants}
                  initial="hidden"
                  animate="visible"
                >
                  <HistoryCard timesheet={ts} onReopen={onReopen} />
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
    reopenTimesheet,
    rejectTimesheet,
  } = useTimesheetApprovals();

  const [activeTab, setActiveTab] = useState<ApprovalTab>("pending");
  const { timesheets: historyTimesheets, loading: historyLoading } =
    useTimesheetHistory({ enabled: true });

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [pendingStatusFilter, setPendingStatusFilter] =
    useState<PendingStatusFilter>("all");
  const [historyStatusFilter, setHistoryStatusFilter] =
    useState<HistoryStatusFilter>("all");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [monthFilter, setMonthFilter] = useState<string>("all");
  const [splitFilter, setSplitFilter] = useState<SplitFilter>("all");

  const allPending = useMemo(
    () =>
      approvals.filter(
        (ts) =>
          ts.user?.isActive !== false &&
          (ts.status === "submitted" ||
            ts.status === "open" ||
            ts.status === "rejected"),
      ),
    [approvals],
  );

  // Extract unique collaborator options & month options from currently active tab source
  const sourceTimesheets =
    activeTab === "pending" ? allPending : historyTimesheets;

  const userOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const ts of sourceTimesheets) {
      if (ts.userId && ts.user?.name) {
        map.set(ts.userId, ts.user.name);
      }
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [sourceTimesheets]);

  const monthOptions = useMemo(() => {
    const set = new Set<string>();
    for (const ts of sourceTimesheets) {
      const monthKey = resolveTimesheetMonthKey(ts);
      if (monthKey) set.add(monthKey);
    }
    return Array.from(set).sort((a, b) => b.localeCompare(a));
  }, [sourceTimesheets]);

  const matchesCommonFilters = useCallback(
    (ts: Timesheet): boolean => {
      if (userFilter !== "all" && ts.userId !== userFilter) {
        return false;
      }
      if (monthFilter !== "all") {
        const tsMonth = resolveTimesheetMonthKey(ts);
        if (tsMonth !== monthFilter) return false;
      }
      if (splitFilter === "split" && !isSplitPeriod(ts.period)) {
        return false;
      }
      if (splitFilter === "regular" && isSplitPeriod(ts.period)) {
        return false;
      }
      if (searchQuery.trim() !== "") {
        const q = searchQuery.trim().toLowerCase();
        const name = (ts.user?.name ?? "").toLowerCase();
        const email = (ts.user?.email ?? "").toLowerCase();
        const dept = (ts.user?.department ?? "").toLowerCase();
        const periodLabel = formatWeekLabel(ts.period).toLowerCase();
        const rangeLabel = formatDateRange(ts.period).toLowerCase();
        if (
          !name.includes(q) &&
          !email.includes(q) &&
          !dept.includes(q) &&
          !ts.period.toLowerCase().includes(q) &&
          !periodLabel.includes(q) &&
          !rangeLabel.includes(q)
        ) {
          return false;
        }
      }
      return true;
    },
    [monthFilter, searchQuery, splitFilter, userFilter],
  );

  const filteredPending = useMemo(
    () =>
      allPending.filter((ts) => {
        if (
          pendingStatusFilter !== "all" &&
          ts.status !== pendingStatusFilter
        ) {
          return false;
        }
        return matchesCommonFilters(ts);
      }),
    [allPending, matchesCommonFilters, pendingStatusFilter],
  );

  const filteredHistory = useMemo(
    () =>
      historyTimesheets.filter((ts) => {
        if (
          historyStatusFilter !== "all" &&
          ts.status !== historyStatusFilter
        ) {
          return false;
        }
        return matchesCommonFilters(ts);
      }),
    [historyStatusFilter, historyTimesheets, matchesCommonFilters],
  );

  const weekGroups = useMemo(
    () => groupByWeek(filteredPending),
    [filteredPending],
  );

  const totalMinutes = useMemo(
    () => filteredPending.reduce((acc, ts) => acc + ts.totalMinutes, 0),
    [filteredPending],
  );

  const historyGroups = useMemo(
    () => groupHistoryByWeek(filteredHistory),
    [filteredHistory],
  );

  const historyTotalMinutes = useMemo(
    () => filteredHistory.reduce((acc, ts) => acc + ts.totalMinutes, 0),
    [filteredHistory],
  );

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    userFilter !== "all" ||
    monthFilter !== "all" ||
    splitFilter !== "all" ||
    (activeTab === "pending" && pendingStatusFilter !== "all") ||
    (activeTab === "history" && historyStatusFilter !== "all");

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setPendingStatusFilter("all");
    setHistoryStatusFilter("all");
    setUserFilter("all");
    setMonthFilter("all");
    setSplitFilter("all");
  }, []);

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

  const activeGroups = activeTab === "pending" ? weekGroups : historyGroups;
  const activeCollapsedSet =
    activeTab === "pending" ? collapsedGroups : collapsedHistoryGroups;
  const allCollapsed =
    activeGroups.length > 0 &&
    activeGroups.every((g) => activeCollapsedSet.has(g.key));

  const handleToggleAllGroups = useCallback(() => {
    if (activeTab === "pending") {
      if (allCollapsed) {
        setCollapsedGroups(new Set());
      } else {
        setCollapsedGroups(new Set(weekGroups.map((g) => g.key)));
      }
    } else {
      if (allCollapsed) {
        setCollapsedHistoryGroups(new Set());
      } else {
        setCollapsedHistoryGroups(new Set(historyGroups.map((g) => g.key)));
      }
    }
  }, [activeTab, allCollapsed, historyGroups, weekGroups]);

  const handleApprove = useCallback(
    async (id: string, options?: { force?: boolean }): Promise<void> => {
      try {
        await approveTimesheet(id, options);
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

  const handleReopen = useCallback(
    async (id: string, reason?: string): Promise<void> => {
      try {
        await reopenTimesheet(id, reason);
        toast.success(
          "Timesheet reaberto com sucesso. O colaborador já pode editar os lançamentos.",
        );
      } catch (error: unknown) {
        console.error("[TimesheetApprovalsPage] handleReopen:", error);
        toast.error(
          error instanceof Error
            ? error.message
            : "Não foi possível reabrir o timesheet.",
        );
        throw error;
      }
    },
    [reopenTimesheet],
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

  const submittedCount = useMemo(
    () => allPending.filter((ts) => ts.status === "submitted").length,
    [allPending],
  );
  const openWithHoursCount = useMemo(
    () => allPending.filter((ts) => ts.status === "open").length,
    [allPending],
  );

  return (
    <motion.div
      variants={pageVariants}
      initial="hidden"
      animate="visible"
      className="space-y-6"
    >
      {/* ── Header & View Switcher ── */}
      <motion.div
        variants={fadeUp}
        className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-bold text-foreground">
            Aprovação de Timesheets
          </h1>
          <p className="text-sm text-muted-foreground">
            {activeTab === "pending"
              ? loading
                ? "Carregando…"
                : `${filteredPending.length} timesheet${filteredPending.length !== 1 ? "s" : ""} aguardando aprovação${weekGroups.length > 0 ? `, distribuídos em ${weekGroups.length} período${weekGroups.length !== 1 ? "s" : ""}` : "."}`
              : historyLoading
                ? "Carregando histórico…"
                : `${filteredHistory.length} timesheet${filteredHistory.length !== 1 ? "s" : ""} no histórico de aprovações — você pode reabrir qualquer período aprovado se precisar editar.`}
          </p>
        </div>

        {/* Top-level tab switcher */}
        <div
          className="inline-flex items-center rounded-xl border border-border/50 bg-card/60 p-1 self-start sm:self-auto"
          role="tablist"
          aria-label="Alternar entre pendentes e histórico"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "pending"}
            onClick={() => setActiveTab("pending")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              activeTab === "pending"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
            Pendentes
            <Badge
              variant="secondary"
              className={cn(
                "px-1.5 py-0 text-[10px]",
                activeTab === "pending"
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {allPending.length}
            </Badge>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "history"}
            onClick={() => setActiveTab("history")}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors cursor-pointer",
              activeTab === "history"
                ? "bg-orange-500 text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <History className="h-3.5 w-3.5" aria-hidden="true" />
            Aprovados / Histórico
            <Badge
              variant="secondary"
              className={cn(
                "px-1.5 py-0 text-[10px]",
                activeTab === "history"
                  ? "bg-white/20 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {historyTimesheets.length}
            </Badge>
          </button>
        </div>
      </motion.div>

      {/* ── Summary stats ── */}
      {activeTab === "pending" && !loading && allPending.length > 0 && (
        <motion.div
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Submetidos
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-orange-400">
              {submittedCount}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Em Aberto (com horas)
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {openWithHoursCount}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Total de Horas (filtro)
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {formatDuration(totalMinutes)}
            </p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
            <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
              Períodos Exibidos
            </p>
            <p className="mt-1 font-mono text-xl font-semibold text-foreground">
              {weekGroups.length}
            </p>
          </div>
        </motion.div>
      )}

      {activeTab === "history" &&
        !historyLoading &&
        historyTimesheets.length > 0 && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Aprovados / Rejeitados
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-green-400">
                {filteredHistory.length}
              </p>
            </div>
            <div className="rounded-xl border border-border/40 bg-card/50 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Total de Horas (filtro)
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-foreground">
                {formatDuration(historyTotalMinutes)}
              </p>
            </div>
            <div className="col-span-2 rounded-xl border border-border/40 bg-card/50 px-4 py-3 sm:col-span-1">
              <p className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground">
                Períodos Exibidos
              </p>
              <p className="mt-1 font-mono text-xl font-semibold text-foreground">
                {historyGroups.length}
              </p>
            </div>
          </motion.div>
        )}

      {/* ── Filters & Organization Bar ── */}
      <motion.div
        variants={fadeUp}
        data-tour="approvals-filters"
        className="rounded-xl border border-border/40 bg-card/60 p-3.5 backdrop-blur-sm space-y-3"
      >
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
          {/* Search input */}
          <div className="relative sm:col-span-2 lg:col-span-2">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            <Input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar colaborador, departamento ou semana…"
              aria-label="Buscar por colaborador, departamento ou semana"
              className="pl-9 h-9 text-xs bg-background/60"
            />
          </div>

          {/* Collaborator select */}
          <Select value={userFilter} onValueChange={setUserFilter}>
            <SelectTrigger
              aria-label="Filtrar por colaborador"
              className="h-9 text-xs bg-background/60"
            >
              <SelectValue placeholder="Todos os colaboradores" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os colaboradores</SelectItem>
              {userOptions.map((person) => (
                <SelectItem key={person.id} value={person.id}>
                  {person.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Month select */}
          <Select value={monthFilter} onValueChange={setMonthFilter}>
            <SelectTrigger
              aria-label="Filtrar por mês de competência"
              className="h-9 text-xs bg-background/60"
            >
              <SelectValue placeholder="Todos os meses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {monthOptions.map((monthKey) => (
                <SelectItem key={monthKey} value={monthKey}>
                  {formatMonthOptionLabel(monthKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Split week filter */}
          <Select
            value={splitFilter}
            onValueChange={(v) => setSplitFilter(v as SplitFilter)}
          >
            <SelectTrigger
              aria-label="Filtrar por tipo de período"
              className="h-9 text-xs bg-background/60"
            >
              <SelectValue placeholder="Todos os tipos" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos de semana</SelectItem>
              <SelectItem value="regular">Apenas semanas completas</SelectItem>
              <SelectItem value="split">Apenas semanas fracionadas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Status pills + Expand/Collapse & Reset */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-border/30">
          {activeTab === "pending" ? (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "Todos" },
                  { id: "submitted", label: "Submetidos" },
                  { id: "open", label: "Em aberto (com horas)" },
                  { id: "rejected", label: "Rejeitados" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPendingStatusFilter(item.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                    pendingStatusFilter === item.id
                      ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: "all", label: "Todos do histórico" },
                  { id: "approved", label: "Aprovados" },
                  { id: "rejected", label: "Rejeitados" },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setHistoryStatusFilter(item.id)}
                  className={cn(
                    "rounded-full px-3 py-1 text-xs font-medium transition-colors cursor-pointer",
                    historyStatusFilter === item.id
                      ? "bg-orange-500/15 text-orange-400 border border-orange-500/30"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground border border-transparent",
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 ml-auto">
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleResetFilters}
                className="h-7 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <FilterX className="h-3.5 w-3.5" aria-hidden="true" />
                Limpar filtros
              </Button>
            )}

            {activeGroups.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleAllGroups}
                className="h-7 gap-1.5 px-2.5 text-xs"
              >
                {allCollapsed ? (
                  <>
                    <ChevronsUpDown
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    Expandir todas
                  </>
                ) : (
                  <>
                    <ChevronsDownUp
                      className="h-3.5 w-3.5"
                      aria-hidden="true"
                    />
                    Recolher todas
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </motion.div>

      {/* ── Content ── */}
      {activeTab === "pending" ? (
        loading ? (
          <output className="space-y-4" aria-label="Carregando aprovações">
            {SKELETON_GROUPS.slice(0, 2).map((groupKey) => (
              <div key={groupKey} className="space-y-2">
                <Skeleton className="h-14 w-full rounded-xl" />
                {SKELETON_ITEMS.map((itemKey) => (
                  <Skeleton
                    key={`${groupKey}-${itemKey}`}
                    className="ml-2 h-20 w-full rounded-lg"
                  />
                ))}
              </div>
            ))}
          </output>
        ) : weekGroups.length === 0 ? (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            animate="visible"
            className="rounded-xl border border-dashed border-border py-16 text-center"
          >
            <CalendarDays
              className="mx-auto mb-3 h-8 w-8 text-muted-foreground/40"
              aria-hidden="true"
            />
            <p className="text-sm font-medium text-muted-foreground">
              {hasActiveFilters
                ? "Nenhum timesheet encontrado para os filtros selecionados."
                : "Nenhum timesheet aguardando aprovação."}
            </p>
            <p className="mt-1 text-xs text-muted-foreground/60">
              {hasActiveFilters
                ? "Tente ajustar a busca ou limpar os filtros ativos."
                : "Quando colaboradores registrarem horas ou submeterem seus timesheets, eles aparecerão aqui."}
            </p>
            {hasActiveFilters && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                className="mt-4 text-xs"
              >
                Limpar filtros
              </Button>
            )}
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
                onReopen={handleReopen}
              />
            ))}
          </motion.div>
        )
      ) : historyLoading ? (
        <output className="space-y-2" aria-label="Carregando histórico">
          {SKELETON_GROUPS.map((groupKey) => (
            <div key={groupKey} className="space-y-1.5">
              <Skeleton className="h-12 w-full rounded-xl" />
              {SKELETON_ITEMS.map((itemKey) => (
                <Skeleton
                  key={`hist-${groupKey}-${itemKey}`}
                  className="ml-2 h-16 w-full rounded-lg"
                />
              ))}
            </div>
          ))}
        </output>
      ) : historyGroups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/50 py-16 text-center">
          <History
            className="mx-auto mb-2 h-7 w-7 text-muted-foreground/30"
            aria-hidden="true"
          />
          <p className="text-sm font-medium text-muted-foreground">
            {hasActiveFilters
              ? "Nenhum timesheet aprovado ou rejeitado encontrado para os filtros selecionados."
              : "Nenhum timesheet aprovado ou rejeitado encontrado."}
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleResetFilters}
              className="mt-4 text-xs"
            >
              Limpar filtros
            </Button>
          )}
        </div>
      ) : (
        <motion.div
          variants={groupVariants}
          initial="hidden"
          animate="visible"
          className="space-y-3"
        >
          {historyGroups.map((group) => (
            <HistoryWeekSection
              key={group.key}
              group={group}
              isOpen={!collapsedHistoryGroups.has(group.key)}
              onToggle={() => toggleHistoryGroup(group.key)}
              onReopen={handleReopen}
            />
          ))}
        </motion.div>
      )}
    </motion.div>
  );
}
