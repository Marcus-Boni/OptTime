/**
 * Shared types for the Magic Timesheet Reconstructor ("Preencher meu dia").
 * Kept free of server imports so client components can consume them directly.
 */

export type ReconstructSourceKind =
  | "calendar"
  | "teams_attendance"
  | "teams_call"
  | "document"
  | "pull_request"
  | "commits"
  | "work_item"
  | "pattern";

export type ReconstructConfidence = "high" | "medium" | "low";

export interface DayPlanItem {
  sourceId?: string;
  /** Stable key for UI editing and the AI refinement round-trip. */
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  description: string;
  minutes: number;
  /**
   * Minutes the evidence implied, before the plan was fitted to the day. Equal
   * to `minutes` unless the day's activity added up to more than the gap.
   */
  estimatedMinutes: number;
  /** When the activity started, for items anchored in time. */
  startsAt: string | null;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  source: ReconstructSourceKind;
  confidence: ReconstructConfidence;
  /** One-line pt-BR justification shown under the item. */
  evidence: string;
}

export interface DayPlan {
  date: string;
  targetMinutes: number;
  existingMinutes: number;
  /** target − existing at build time. */
  gapMinutes: number;
  items: DayPlanItem[];
  planMinutes: number;
  /** Provider that refined the plan, or null when fully deterministic. */
  refinedBy: string | null;
  /** Short pt-BR note from the AI about how the day was composed. */
  narrative: string | null;
  sources: {
    calendar: boolean;
    calls?: boolean;
    documents: boolean;
    attendance: boolean;
    transcripts: boolean;
    documentsNeedsConsent: boolean;
    attendanceNeedsConsent: boolean;
    transcriptsNeedsConsent: boolean;
    azureDevops: boolean;
    /** Commits were read for this day — true even when they were all covered. */
    commits: boolean;
    patterns: boolean;
  };
  warnings: string[];
  /** Server clock at build time, so the client can show the plan's age. */
  generatedAt: string;
}
