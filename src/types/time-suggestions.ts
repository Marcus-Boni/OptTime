export type SuggestionConfidence = "high" | "medium" | "low";

/**
 * What a suggestion is built from. Development suggestions always belong to a
 * single project: `work_item` groups every commit that references the same
 * Azure DevOps task, `work_session` groups commits without a task that happened
 * close together. Meetings and calls stay in the collaboration panel and only
 * reach this type through legacy callers.
 */
export type TimeSuggestionKind =
  | "work_item"
  | "work_session"
  | "meeting"
  | "call";

export interface TimeSuggestionCommit {
  id: string;
  commitId: string;
  repositoryName: string;
  /** Internal project the commit was fetched for. */
  projectName?: string;
  message: string;
  branch: string | null;
  timestamp: string;
  workItemIds: number[];
  url?: string | null;
  /** Merge commits integrate work; they never name a suggestion. */
  isMerge?: boolean;
}

export interface TimeSuggestionActivitySummary {
  totalCommits: number;
  repositoryCount: number;
  repositories: string[];
  startedAt: string | null;
  endedAt: string | null;
  commits: TimeSuggestionCommit[];
}

export interface TimeSuggestionWorkItem {
  id: number;
  title: string | null;
  type: string | null;
  state: string | null;
  url: string | null;
}

export interface TimeSuggestion {
  fingerprint: string;
  kind?: TimeSuggestionKind;
  projectId: string | null;
  projectName: string | null;
  /** Project color from the catalogue, used only as a visual marker. */
  projectColor?: string | null;
  /** Display title for an evidence group; the entry description stays editable. */
  title?: string;
  description: string;
  date: string;
  duration: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  azureWorkItemUrl?: string | null;
  /** Resolved Azure DevOps task behind a `work_item` suggestion. */
  workItem?: TimeSuggestionWorkItem | null;
  /** Minutes already logged today for the same project and task. */
  loggedMinutes?: number;
  score: number;
  confidence: SuggestionConfidence;
  reasons: string[];
  sourceBreakdown: {
    commits: number;
    meetings: number;
    calls?: number;
    recency: number;
  };
  activitySummary: TimeSuggestionActivitySummary | null;
  payload: {
    projectId: string;
    description: string;
    date: string;
    duration: number;
    billable: boolean;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
  } | null;
}
