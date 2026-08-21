/**
 * Response shapes of the OptSolv agent API (`/api/v1/me/*`).
 *
 * These mirror the server's view models rather than its database rows: the API
 * already returns pre-formatted labels (`elapsedLabel`, `totalLabel`) so every
 * client renders the same wording. We keep them and only compute locally what
 * has to tick every second.
 */

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  color: string;
  status: string;
  billable: boolean;
  clientName: string | null;
  azureProjectId: string | null;
}

export interface ActiveTimer {
  id: string;
  description: string;
  billable: boolean;
  startedAt: string;
  pausedAt: string | null;
  isPaused: boolean;
  elapsedMinutes: number;
  elapsedLabel: string;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  project: { id: string; name: string; code: string; color: string };
}

export interface TimeEntryView {
  id: string;
  date: string;
  durationMinutes: number;
  durationLabel: string;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  locked: boolean;
  project: { id: string; name: string; code: string; color: string };
}

export interface DaySummary {
  date: string;
  weekday: string;
  totalMinutes: number;
  totalLabel: string;
  billableMinutes: number;
  entryCount: number;
  dailyCapacityMinutes: number;
  remainingMinutes: number;
  remainingLabel: string;
  isComplete: boolean;
  byProject: Array<{
    projectId: string;
    projectName: string;
    projectCode: string;
    minutes: number;
    label: string;
  }>;
  entries: TimeEntryView[];
  activeTimer: ActiveTimer | null;
  weekTotalMinutes: number;
  weekTotalLabel: string;
  weeklyCapacityMinutes: number;
}

export interface TimesheetStatus {
  period: string;
  periodStart: string;
  periodEnd: string;
  status: "open" | "submitted" | "approved" | "rejected";
  statusLabel: string;
  totalMinutes: number;
  totalLabel: string;
  billableMinutes: number;
  weeklyCapacityMinutes: number;
  entryCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  canSubmit: boolean;
  days: Array<{
    date: string;
    weekday: string;
    minutes: number;
    label: string;
    isWeekend: boolean;
    isBelowTarget: boolean;
  }>;
  warnings: string[];
}

export interface WorkItemResult {
  id: number;
  title: string;
  type: string;
  state: string;
  projectName: string;
  url: string | null;
}

export interface Identity {
  user: { id: string; name: string; email: string; role: string };
  token: { name: string; scopes: string[]; legacy: boolean };
  capacity: { weeklyMinutes: number; dailyMinutes: number };
  today: {
    date: string;
    totalMinutes: number;
    totalLabel: string;
    remainingMinutes: number;
    entryCount: number;
    activeTimer: ActiveTimer | null;
  };
}

export interface LogTimeResult {
  entry: TimeEntryView;
  dayTotalMinutes: number;
  dayTotalLabel: string;
}

export interface StartTimerResult {
  timer: ActiveTimer;
  /** Set when a previously running timer was stopped and saved automatically. */
  replaced: {
    projectName: string;
    durationMinutes: number;
    entryId: string;
  } | null;
  /** Set when a previous timer was dropped for having run under a minute. */
  discarded: { projectName: string } | null;
}

export interface StopTimerResult {
  /** False when the timer was too short to record; no entry was created. */
  saved: boolean;
  entryId: string | null;
  durationMinutes: number;
  durationLabel: string;
  elapsedSeconds: number;
  date: string;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  project: { id: string; name: string; code: string };
}

export interface DiscardTimerResult {
  timer: ActiveTimer;
  discardedMinutes: number;
  discardedLabel: string;
  /** True when the request asked for more time than the timer had run. */
  clamped: boolean;
}

export interface SubmitTimesheetResult {
  period: string;
  status: string;
  totalMinutes: number;
  totalLabel: string;
  entryCount: number;
  submittedAt: string | null;
  warnings: string[];
}
