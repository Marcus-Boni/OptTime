/**
 * AI Operator — permission model and audit contracts.
 *
 * Shared by the server (which decides what the model may even propose) and the
 * client (which decides what runs without a click). Keeping the resolution
 * logic pure means both sides always reach the same verdict.
 */

import type { AppRole } from "@/lib/access-control";
import type { OperatorActionKind } from "@/lib/ai/types";

/** How much autonomy the user granted the assistant. */
export type OperatorMode = "always_ask" | "smart" | "autopilot";

/** Per-action override on top of the mode. */
export type OperatorPermission = "ask" | "auto" | "never";

/** Risk tier, used for the mode defaults and for UI colouring. */
export type OperatorRisk = "low" | "medium" | "high";

/**
 * Grouping used by the settings screen: actions that touch the user's data vs.
 * actions that only drive the interface.
 */
export type OperatorActionCategory = "data" | "interface";

export interface OperatorActionMeta {
  kind: OperatorActionKind;
  category: OperatorActionCategory;
  /** Short pt-BR label shown in settings and in the history list. */
  label: string;
  description: string;
  risk: OperatorRisk;
  /**
   * Whether the app can put things back the way they were. Drives the undo
   * button in the history panel.
   */
  reversible: boolean;
  /**
   * True when the action is visible outside the app — sends an e-mail, changes
   * someone else's record. These can never run without an explicit click.
   */
  outward: boolean;
  /** Roles allowed to run it at all. Omit for everyone. */
  roles?: AppRole[];
}

export interface OperatorSettings {
  mode: OperatorMode;
  overrides: Partial<Record<OperatorActionKind, OperatorPermission>>;
  voiceEnabled: boolean;
  voiceLocale: string;
  speakReplies: boolean;
  /** Receive the Monday-morning AI weekly digest by e-mail. */
  digestEnabled: boolean;
}

export const DEFAULT_OPERATOR_SETTINGS: OperatorSettings = {
  mode: "always_ask",
  overrides: {},
  voiceEnabled: true,
  voiceLocale: "pt-BR",
  speakReplies: false,
  digestEnabled: true,
};

// ─── Audit log ───────────────────────────────────────────────────────

export type OperatorLogStatus = "executed" | "failed" | "skipped" | "undone";
export type OperatorAuthorization = "confirmed" | "auto";
export type OperatorInputMode = "text" | "voice";

export interface OperatorLogEntry {
  id: string;
  planId: string | null;
  stepIndex: number;
  kind: string;
  summary: string;
  status: OperatorLogStatus;
  authorization: OperatorAuthorization;
  inputMode: OperatorInputMode;
  resultId: string | null;
  errorMessage: string | null;
  undoneAt: string | null;
  createdAt: string;
}
