export type PeoplePerformanceHealth =
  | "excellent"
  | "stable"
  | "attention"
  | "critical"
  | "offline";

export type PeoplePerformanceAlertLevel =
  | "info"
  | "warning"
  | "critical"
  | "success";

export type PeoplePerformanceIntegrationStatus =
  | "connected"
  | "missing"
  | "invalid";

export interface PeoplePerformanceAlert {
  id: string;
  level: PeoplePerformanceAlertLevel;
  label: string;
  detail: string;
}

export interface PeoplePerformanceProjectSnapshot {
  id: string;
  name: string;
  color: string;
  source: string;
  activeItems: number;
  staleItems: number;
  itemsWithoutEstimate: number;
  remainingHours: number;
  loggedMinutes30d: number;
  commits30d: number;
}

export interface PeoplePerformanceWorkItemSnapshot {
  id: number;
  title: string;
  type: string;
  state: string;
  projectName: string;
  changedAt: string | null;
  createdAt: string | null;
  remainingWork: number | null;
  originalEstimate: number | null;
  priority: number | null;
  url: string;
  stale: boolean;
  blocked: boolean;
  unestimated: boolean;
}

export interface PeoplePerformanceCommitSnapshot {
  id: string;
  message: string;
  projectName: string;
  repositoryName: string;
  timestamp: string;
  branch: string | null;
  linkedWorkItems: number;
}

export interface PeoplePerformanceUserRow {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    department: string | null;
    isActive: boolean;
    weeklyCapacity: number;
  };
  integration: {
    status: PeoplePerformanceIntegrationStatus;
    organizationUrl: string | null;
    commitAuthor: string | null;
    analyzedProjects: number;
  };
  metrics: {
    assignedProjects: number;
    azureProjects: number;
    activeItems: number;
    staleItems: number;
    blockedItems: number;
    itemsWithoutEstimate: number;
    remainingHours: number;
    completedHours: number;
    loggedThisWeekMinutes: number;
    logged30dMinutes: number;
    utilizationPercent: number;
    commits30d: number;
    linkedCommits30d: number;
    lastActivityAt: string | null;
    performanceScore: number;
    health: PeoplePerformanceHealth;
    timesheetStatus: string | null;
  };
  highlights: {
    primary: string;
    secondary: string;
  };
  alerts: PeoplePerformanceAlert[];
  projects: PeoplePerformanceProjectSnapshot[];
  topWorkItems: PeoplePerformanceWorkItemSnapshot[];
  recentCommits: PeoplePerformanceCommitSnapshot[];
}

export interface PeoplePerformanceSummary {
  monitoredUsers: number;
  connectedUsers: number;
  usersWithAlerts: number;
  usersWithoutAzure: number;
  activeItems: number;
  remainingHours: number;
  loggedThisWeekMinutes: number;
  commits30d: number;
  pendingTimesheets: number;
  averagePerformanceScore: number;
}

export interface PeoplePerformanceResponse {
  generatedAt: string;
  period: {
    today: string;
    weekStart: string;
    weekEnd: string;
    last30DaysStart: string;
  };
  summary: PeoplePerformanceSummary;
  users: PeoplePerformanceUserRow[];
}
