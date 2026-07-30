export type SuggestionConfidence = "high" | "medium" | "low";

export interface TimeSuggestionCommit {
  id: string;
  commitId: string;
  repositoryName: string;
  message: string;
  branch: string | null;
  timestamp: string;
  workItemIds: number[];
  url?: string | null;
}

export interface TimeSuggestionActivitySummary {
  totalCommits: number;
  repositoryCount: number;
  repositories: string[];
  startedAt: string | null;
  endedAt: string | null;
  commits: TimeSuggestionCommit[];
}

export interface TimeSuggestion {
  fingerprint: string;
  projectId: string | null;
  projectName: string | null;
  description: string;
  date: string;
  duration: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  azureWorkItemUrl?: string | null;
  score: number;
  confidence: SuggestionConfidence;
  reasons: string[];
  sourceBreakdown: {
    commits: number;
    meetings: number;
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
