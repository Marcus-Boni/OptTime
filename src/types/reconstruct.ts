/**
 * Shared types for the Magic Timesheet Reconstructor ("Preencher meu dia").
 * Kept free of server imports so client components can consume them directly.
 */

export type ReconstructSourceKind =
  | "calendar"
  | "pull_request"
  | "commits"
  | "work_item"
  | "pattern";

export type ReconstructConfidence = "high" | "medium" | "low";

export interface DayPlanItem {
  /** Stable key for UI editing and the AI refinement round-trip. */
  id: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  description: string;
  minutes: number;
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
    azureDevops: boolean;
    patterns: boolean;
  };
  warnings: string[];
}
