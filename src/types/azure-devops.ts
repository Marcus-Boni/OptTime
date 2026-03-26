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
}

/** Search result for work item autocomplete */
export interface WorkItemSearchResult {
  id: number;
  title: string;
  type: WorkItemType;
  state: WorkItemState;
  projectName: string;
}
