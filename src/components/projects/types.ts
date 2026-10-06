// ─── Shared types for project components ───────────────────────────────────

export interface ProjectMemberUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role?: string;
}

// ─── Project Scope ──────────────────────────────────────────────────────────

export interface ProjectScope {
  id: string;
  name: string;
  /** Parsed stages (stored as JSON in DB) */
  stages: string[];
  /** Default status applied to new projects in this scope */
  defaultStatus: string;
  createdAt: string;
  updatedAt: string;
}

// ─── Project Progress (from Azure DevOps) ──────────────────────────────────

export interface ProjectProgress {
  /** Total original estimate in hours */
  estimated: number;
  /** Total completed work in hours */
  completed: number;
  /** Total remaining work in hours */
  remaining: number;
  /** Percentage of original estimate completed (0–100) */
  progressPercent: number;
  /** Efficiency: completed / estimated * 100 (can exceed 100) */
  efficiency: number;
  /** True if Azure DevOps is not linked or has no scheduling data */
  unconfigured: boolean;
  /** Reason why progress is not available */
  unconfiguredReason?: "no_azure_linked" | "no_azure_config" | "no_data";
  /**
   * Set on later phases: only work items created on or after this date
   * (YYYY-MM-DD) count, so phase 2 does not inherit phase 1's backlog.
   */
  scopedSince?: string | null;
}

// ─── Project from API ───────────────────────────────────────────────────────

export interface ProjectFromAPI {
  id: string;
  name: string;
  code: string;
  description: string | null;
  clientName: string | null;
  color: string;
  status: string;
  billable: boolean;
  budget: number | null;
  source: string;
  imageUrl: string | null;
  azureProjectId: string | null;
  azureProjectUrl: string | null;
  managerId: string | null;
  /** Linked scope ID */
  scopeId: string | null;
  /** Current stage within the scope */
  currentStage: string | null;
  /** Commercial responsible name */
  commercialName: string | null;
  /** Project start date YYYY-MM-DD */
  startDate: string | null;
  /** Project end date YYYY-MM-DD */
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
  integrationKey: string | null;
  /** Phase number inside the project lineage (1 = original project) */
  phase: number;
  /** First phase of the lineage; null on the first phase itself */
  phaseRootId: string | null;
  members: Array<{ id: string; userId: string; user: ProjectMemberUser }>;
  manager: ProjectMemberUser | null;
  /** Populated when scope is linked */
  scope?: ProjectScope | null;
  /** Count of registered time entries for this project */
  timeEntriesCount?: number;
}

export interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  image?: string | null;
}
