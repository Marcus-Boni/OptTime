export type WorkItemType = "Bug" | "Task" | "User Story" | "Feature" | "Epic";
export type WorkItemState =
  | "New"
  | "Active"
  | "Resolved"
  | "Closed"
  | "Removed";

export interface AzureDevOpsWorkItem {
  id: number;
  title: string;
  type: WorkItemType;
  state: WorkItemState;
  assignedTo?: string;
  projectName: string;
  areaPath: string;
  iterationPath: string;
  /** Remaining work in hours */
  remainingWork?: number;
  /** Completed work in hours */
  completedWork?: number;
  /** Original estimate in hours */
  originalEstimate?: number;
  url: string;
}

export interface AzureDevOpsAssignedWorkItem extends AzureDevOpsWorkItem {
  createdDate?: string;
  changedDate?: string;
  priority?: number;
  tags?: string[];
  targetDate?: string;
}

export interface AzureDevOpsProject {
  id: string;
  name: string;
  description?: string;
  url: string;
  state: string;
}

export interface AzureDevOpsConfig {
  organizationUrl: string;
  /** Personal Access Token or OAuth token */
  accessToken: string;
  defaultProjectId?: string;
}

export interface AzureDevOpsRepository {
  id: string;
  name: string;
  remoteUrl?: string;
}

export interface AzureDevOpsCommit {
  id: string;
  commitId: string;
  repositoryId: string;
  repositoryName: string;
  projectName: string;
  message: string;
  comment: string;
  authorEmail: string | null;
  authorName: string | null;
  branch: string | null;
  timestamp: string;
  workItemIds: number[];
  url?: string | null;
}

export type PullRequestStatus = "active" | "completed" | "abandoned" | "all";

/**
 * Pull request as consumed by the predictive time-logging engine. Only the
 * fields that carry a time signal are kept.
 */
export interface AzureDevOpsPullRequest {
  id: number;
  title: string;
  description: string | null;
  status: Exclude<PullRequestStatus, "all">;
  repositoryName: string;
  projectName: string;
  authorEmail: string | null;
  authorName: string | null;
  sourceBranch: string | null;
  targetBranch: string | null;
  createdAt: string;
  /** Merge/abandon timestamp — null while the PR is still open. */
  closedAt: string | null;
  /** Work items linked to the PR, when the link lookup succeeded. */
  workItemIds: number[];
  url: string | null;
}

/** Search result for work item autocomplete */
export interface WorkItemSearchResult {
  id: number;
  title: string;
  type: WorkItemType;
  state: WorkItemState;
  projectName: string;
}
