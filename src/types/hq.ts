/**
 * DTOs for the Executive & Manager HQ ("Central de Gestão").
 *
 * Everything here crosses the API boundary, so keep it JSON-serializable and
 * free of Drizzle/Date types — dates travel as YYYY-MM-DD strings and ISO
 * timestamps, durations always in minutes.
 */

// ─── Project Health Radar ─────────────────────────────────────────────

export type ProjectRiskLevel = "healthy" | "warning" | "critical" | "no_budget";

export interface ProjectWeeklyConsumption {
  /** ISO week id, e.g. "2026-W33" */
  week: string;
  /** Monday of the week, YYYY-MM-DD (for chart labels) */
  weekStart: string;
  minutes: number;
}

export interface ProjectHealthForecast {
  /** Weighted average of recent complete weeks, in minutes/week */
  burnRatePerWeek: number;
  /** Null when there is no budget or no recent activity */
  projectedExhaustionDate: string | null;
  /**
   * Days between projected exhaustion and the planned end date.
   * Negative = budget runs out BEFORE the delivery date (the bad case).
   */
  scheduleDeltaDays: number | null;
  /** Consumed / budget, 0–N (can exceed 1 when over budget) */
  budgetUsageRatio: number | null;
  /** Last complete week vs. the average of the 3 weeks before it, in % */
  trendPct: number | null;
  risk: ProjectRiskLevel;
  /** Ready-to-render pt-BR sentence explaining the forecast */
  headline: string;
}

export interface ProjectHealthSnapshot {
  projectId: string;
  name: string;
  code: string;
  color: string;
  clientName: string | null;
  status: string;
  billable: boolean;
  /** Contracted budget in minutes (project.budget hours × 60), null = no budget */
  budgetMinutes: number | null;
  consumedMinutes: number;
  /** Minutes in the current (partial) ISO week */
  currentWeekMinutes: number;
  endDate: string | null;
  startDate: string | null;
  teamSize: number;
  /** Last N weeks of consumption, oldest first (current partial week included) */
  weeklySeries: ProjectWeeklyConsumption[];
  forecast: ProjectHealthForecast;
  /** True when the project is linked to Azure DevOps (enables scope-creep drilldown) */
  hasAzureIntegration: boolean;
}

export interface HqHealthResponse {
  generatedAt: string;
  /** Current ISO week id */
  currentWeek: string;
  projects: ProjectHealthSnapshot[];
  totals: {
    projects: number;
    atRisk: number;
    minutesThisWeek: number;
    budgetMinutes: number;
    consumedMinutes: number;
  };
}

// ─── Scope Creep (Azure DevOps estimates vs. logged) ──────────────────

export interface ScopeCreepItem {
  workItemId: number;
  title: string;
  type: string;
  state: string;
  url: string | null;
  /** Original estimate from Azure DevOps, in minutes (null when not filled) */
  estimateMinutes: number | null;
  loggedMinutes: number;
  /** logged / estimate — null when there is no estimate */
  ratio: number | null;
}

export interface ScopeCreepResponse {
  available: boolean;
  /** Populated when available=false, pt-BR */
  reason: string | null;
  projectId: string;
  items: ScopeCreepItem[];
  /** Items over the 120% threshold */
  flaggedCount: number;
}

// ─── Workload Matrix & FTE Forecasting ────────────────────────────────

export type UtilizationLevel = "empty" | "low" | "ok" | "full" | "over";

export interface WorkloadWeekDescriptor {
  /** ISO week id */
  week: string;
  /** Monday, YYYY-MM-DD */
  start: string;
  /** Sunday, YYYY-MM-DD */
  end: string;
  /** Short pt-BR label, e.g. "24–30 ago" */
  label: string;
  isCurrent: boolean;
  isFuture: boolean;
}

export interface WorkloadAllocationSlice {
  allocationId: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  plannedMinutes: number;
  note: string | null;
}

export interface WorkloadCell {
  week: string;
  /** Logged minutes (past/current weeks) */
  actualMinutes: number;
  /** Planned minutes from allocations (future weeks) */
  plannedMinutes: number;
  level: UtilizationLevel;
  /** Present only on future weeks */
  allocations: WorkloadAllocationSlice[];
}

export interface WorkloadRow {
  userId: string;
  name: string;
  image: string | null;
  role: string;
  /** Weekly capacity in minutes */
  capacityMinutes: number;
  cells: WorkloadCell[];
  /** Average utilization across past weeks, 0–N */
  avgUtilization: number;
}

export interface WorkloadMatrixResponse {
  generatedAt: string;
  weeks: WorkloadWeekDescriptor[];
  rows: WorkloadRow[];
  projects: Array<{
    id: string;
    name: string;
    code: string;
    color: string;
  }>;
  totals: {
    people: number;
    overloadedThisWeek: number;
    idleThisWeek: number;
  };
}

// ─── Approval Center with anomaly detection ───────────────────────────

export type AnomalyKind =
  | "weekend_entry"
  | "long_day"
  | "missing_work_item"
  | "over_capacity"
  | "duplicate_entry"
  | "late_backfill";

export type AnomalySeverity = "info" | "warning" | "critical";

export interface TimesheetAnomaly {
  kind: AnomalyKind;
  severity: AnomalySeverity;
  /** Short chip label, pt-BR */
  label: string;
  /** One-sentence explanation with the numbers, pt-BR */
  detail: string;
  /** Offending time-entry ids (for future drill-down) */
  entryIds: string[];
}

export interface ApprovalInsight {
  timesheetId: string;
  userId: string;
  userName: string;
  userImage: string | null;
  period: string;
  periodLabel: string;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
  submittedAt: string | null;
  projects: Array<{ name: string; color: string; minutes: number }>;
  anomalies: TimesheetAnomaly[];
  /** No warning/critical anomalies — safe for one-click batch approval */
  conformant: boolean;
}

export interface HqApprovalsResponse {
  generatedAt: string;
  pending: ApprovalInsight[];
  totals: {
    pending: number;
    conformant: number;
    withAnomalies: number;
    totalMinutes: number;
  };
}

export interface BatchApprovalResult {
  timesheetId: string;
  status: "approved" | "failed";
  error: string | null;
}

// ─── Client Portal links ──────────────────────────────────────────────

export interface PortalLinkSummary {
  id: string;
  projectId: string;
  projectName: string;
  projectCode: string;
  projectColor: string;
  label: string;
  /** Full shareable URL (origin + /portal/token) */
  url: string;
  hasPassword: boolean;
  expiresAt: string | null;
  revokedAt: string | null;
  showBudget: boolean;
  showTeam: boolean;
  showDescriptions: boolean;
  viewCount: number;
  lastViewedAt: string | null;
  createdAt: string;
  createdByName: string;
  /** Derived from revokedAt/expiresAt */
  status: "active" | "expired" | "revoked";
}

// ─── Public portal snapshot (what the client sees) ────────────────────

export interface PortalWeeklyPoint {
  week: string;
  weekStart: string;
  label: string;
  minutes: number;
}

export interface PortalActivityItem {
  date: string;
  /** Present only when the link allows descriptions */
  description: string | null;
  minutes: number;
  /** Team member display — anonymized initials when showTeam=false */
  member: string;
}

export interface PortalSnapshot {
  projectName: string;
  projectCode: string;
  clientName: string | null;
  color: string;
  label: string;
  periodStart: string | null;
  periodEnd: string | null;
  currentStage: string | null;
  stages: string[];
  budget: {
    visible: boolean;
    budgetMinutes: number | null;
    consumedMinutes: number;
    usageRatio: number | null;
  };
  totals: {
    consumedMinutes: number;
    last30DaysMinutes: number;
    activeWeeks: number;
    teamSize: number;
  };
  weeklySeries: PortalWeeklyPoint[];
  team: Array<{ name: string; minutes: number }>;
  recentActivity: PortalActivityItem[];
  generatedAt: string;
}

export type PortalGateState =
  | "ok"
  | "password_required"
  | "invalid_password"
  | "expired"
  | "revoked"
  | "not_found";
