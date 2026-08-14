import type { SuggestionConfidence } from "@/types/time-suggestions";

/**
 * Where a proposal came from. Each signal has a different strength: a merged PR
 * is evidence that work *happened*, while an in-progress work item is only a
 * hint that work is *happening*.
 */
export type AutofillSignal =
  | "pr_completed"
  | "pr_active"
  | "work_item_active"
  | "commits_unlogged";

export interface AutofillEvidence {
  kind: "pull_request" | "work_item" | "commits";
  /** Short headline, e.g. "PR #402 — Ajusta validação do login". */
  label: string;
  detail: string | null;
  url: string | null;
}

export interface AutofillProposal {
  /** Stable across refreshes so a dismissal keeps it away. */
  fingerprint: string;
  signal: AutofillSignal;
  /** Target date in YYYY-MM-DD. */
  date: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  description: string;
  durationMinutes: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  confidence: SuggestionConfidence;
  /** 0–100, drives ordering. */
  score: number;
  /** Plain-language justification shown in the card. */
  reasons: string[];
  evidence: AutofillEvidence[];
  /** Minutes already logged on that date, so the user sees the gap. */
  loggedMinutesOnDate: number;
  /** How the duration was arrived at, shown on the adjust panel. */
  durationBasis: string;
}

export interface AutofillRadarResponse {
  generatedAt: string;
  /** Days inspected, oldest first. */
  from: string;
  to: string;
  proposals: AutofillProposal[];
  /** False when the user has no Azure DevOps integration configured. */
  integrationReady: boolean;
  /** Populated when a signal source failed but the rest still worked. */
  warnings: string[];
}
