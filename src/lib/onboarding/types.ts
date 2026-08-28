import type { UserRole } from "@/types/user";

/**
 * Bump whenever the onboarding content changes enough that people who already
 * finished it should be offered the welcome flow again. Additive tweaks (a new
 * optional tour, a reworded step) do NOT justify a bump — only changes that
 * alter how the product is meant to be used.
 */
export const ONBOARDING_CONTENT_VERSION = 1;

export type OnboardingStatus =
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped";

/** Where the step card is anchored relative to its target element. */
export type TourPlacement = "top" | "bottom" | "left" | "right" | "center";

export type TourId =
  | "welcome"
  | "time-tracking"
  | "timesheets"
  | "journey"
  | "ai-assistant"
  | "management"
  | "admin-setup";

export interface TourStep {
  /** Stable id, used for analytics and for resuming a tour. */
  id: string;
  title: string;
  /** Body copy. Kept to two or three sentences so the card never scrolls. */
  description: string;
  /**
   * CSS selector for the element to spotlight. Prefer the `data-tour`
   * attribute contract (`[data-tour="nav-time"]`) over class names,
   * which change with styling. Omit for a centered, target-less step.
   */
  target?: string;
  /** Route the step lives on. The engine navigates there before measuring. */
  route?: string;
  placement?: TourPlacement;
  /** Extra pixels of breathing room around the spotlight cutout. */
  spotlightPadding?: number;
  /** Corner radius of the cutout, in pixels. Defaults to 12. */
  spotlightRadius?: number;
  /** Let the user actually click the highlighted element during this step. */
  allowInteraction?: boolean;
  /** Restrict the step to some roles. Absent means every role sees it. */
  roles?: readonly UserRole[];
  /** Short label rendered as a tip line under the copy. */
  hint?: string;
  /**
   * Skip the step when the target never shows up (e.g. a widget that only
   * exists once there is data). Defaults to true — a tour must never dead-end.
   */
  optional?: boolean;
}

export interface TourDefinition {
  id: TourId;
  title: string;
  /** One-line pitch shown on the help hub card. */
  description: string;
  /** Lucide icon name, resolved by the UI through `TOUR_ICONS`. */
  icon: TourIconName;
  /** Rough duration in minutes, shown on the catalog card. */
  estimatedMinutes: number;
  /** Roles allowed to see and run the tour. */
  roles: readonly UserRole[];
  /** Ordered steps. Filtered by role before the tour starts. */
  steps: readonly TourStep[];
  /** Route the tour starts from, used when the first step has no `route`. */
  entryRoute: string;
}

export type TourIconName =
  | "compass"
  | "clock"
  | "check-square"
  | "trophy"
  | "bot"
  | "radar"
  | "settings";

/** How a checklist task gets ticked off. */
export type ChecklistTaskKind = "tour" | "signal" | "manual";

/** Server-derived facts about what the user has already done in the product. */
export interface OnboardingSignals {
  hasTimeEntry: boolean;
  hasTimerEntry: boolean;
  hasSubmittedTimesheet: boolean;
  hasApprovedTimesheet: boolean;
  hasSentInvitation: boolean;
}

export type OnboardingSignalKey = keyof OnboardingSignals;

export interface ChecklistTask {
  id: string;
  title: string;
  description: string;
  kind: ChecklistTaskKind;
  /** Set when `kind` is "tour". */
  tourId?: TourId;
  /** Set when `kind` is "signal". */
  signal?: OnboardingSignalKey;
  /** Call-to-action that takes the user where the task happens. */
  cta: {
    label: string;
    /** Route to push, or `null` when the action is the tour itself. */
    href: string | null;
  };
  roles?: readonly UserRole[];
  /** Rewarded XP is intentionally absent: onboarding never pays for hours. */
  icon: TourIconName;
}

export interface ChecklistTaskProgress extends ChecklistTask {
  done: boolean;
}

/** Persisted onboarding row, normalized for the client. */
export interface OnboardingState {
  status: OnboardingStatus;
  completedTours: string[];
  completedTasks: string[];
  dismissedHints: string[];
  welcomeSeen: boolean;
  contentVersion: number;
  startedAt: string | null;
  completedAt: string | null;
}

/** Everything the client needs in one round trip. */
export interface OnboardingOverview {
  state: OnboardingState;
  signals: OnboardingSignals;
  /** Tours available to this user's role, with completion flags. */
  tours: Array<TourDefinition & { completed: boolean }>;
  tasks: ChecklistTaskProgress[];
  completedCount: number;
  totalCount: number;
  /** True while the person still has pending first steps. */
  isComplete: boolean;
  /** True when the welcome modal should be offered on this session. */
  shouldShowWelcome: boolean;
}

export type OnboardingAction =
  | { action: "start_tour"; tourId: TourId }
  | { action: "complete_tour"; tourId: TourId }
  | { action: "dismiss_welcome"; startedTour: boolean }
  | { action: "complete_task"; taskId: string }
  | { action: "uncomplete_task"; taskId: string }
  | { action: "dismiss_hint"; hintId: string }
  | { action: "skip" }
  | { action: "reset" };
