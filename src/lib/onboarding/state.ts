import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { userOnboarding } from "@/lib/db/schema";
import { isManualTaskId, resolveChecklist } from "@/lib/onboarding/checklist";
import { emptySignals, getOnboardingSignals } from "@/lib/onboarding/signals";
import { getToursForRole, isTourId } from "@/lib/onboarding/tours";
import {
  ONBOARDING_CONTENT_VERSION,
  type OnboardingAction,
  type OnboardingOverview,
  type OnboardingState,
  type OnboardingStatus,
} from "@/lib/onboarding/types";
import type { UserRole } from "@/types/user";

type OnboardingRow = typeof userOnboarding.$inferSelect;

const DEFAULT_STATE: OnboardingState = {
  status: "pending",
  completedTours: [],
  completedTasks: [],
  dismissedHints: [],
  welcomeSeen: false,
  contentVersion: 0,
  startedAt: null,
  completedAt: null,
};

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    // A corrupted column must never take the dashboard down with it.
    return [];
  }
}

function normalizeStatus(value: string): OnboardingStatus {
  return value === "in_progress" || value === "completed" || value === "skipped"
    ? value
    : "pending";
}

function toState(row: OnboardingRow): OnboardingState {
  return {
    status: normalizeStatus(row.status),
    completedTours: parseStringArray(row.completedTours),
    completedTasks: parseStringArray(row.completedTasks),
    dismissedHints: parseStringArray(row.dismissedHints),
    welcomeSeen: row.welcomeSeen,
    contentVersion: row.contentVersion,
    startedAt: row.startedAt?.toISOString() ?? null,
    completedAt: row.completedAt?.toISOString() ?? null,
  };
}

/** Reads the row, creating it on first access. */
export async function getOnboardingState(
  userId: string,
): Promise<OnboardingState> {
  const existing = await db.query.userOnboarding.findFirst({
    where: eq(userOnboarding.userId, userId),
  });

  if (existing) return toState(existing);

  const [created] = await db
    .insert(userOnboarding)
    .values({ userId })
    .onConflictDoNothing()
    .returning();

  if (created) return toState(created);

  // Lost the insert race against a parallel request — read the winner's row.
  const row = await db.query.userOnboarding.findFirst({
    where: eq(userOnboarding.userId, userId),
  });

  return row ? toState(row) : { ...DEFAULT_STATE };
}

function addUnique(list: readonly string[], value: string): string[] {
  return list.includes(value) ? [...list] : [...list, value];
}

/**
 * Applies one action and returns the state after it.
 *
 * Completion is derived, not trusted from the client: after every mutation the
 * checklist is recomputed, and the row flips to `completed` once nothing is
 * pending. A person who explicitly skipped stays skipped.
 */
export async function applyOnboardingAction(
  userId: string,
  role: UserRole,
  action: OnboardingAction,
): Promise<OnboardingState> {
  const current = await getOnboardingState(userId);
  const now = new Date();

  let next: OnboardingState = { ...current };

  switch (action.action) {
    case "start_tour": {
      if (!isTourId(action.tourId)) break;
      next.status =
        current.status === "completed" ? "completed" : "in_progress";
      next.startedAt = current.startedAt ?? now.toISOString();
      break;
    }
    case "complete_tour": {
      if (!isTourId(action.tourId)) break;
      next.completedTours = addUnique(current.completedTours, action.tourId);
      next.status =
        current.status === "completed" ? "completed" : "in_progress";
      next.startedAt = current.startedAt ?? now.toISOString();
      break;
    }
    case "dismiss_welcome": {
      next.welcomeSeen = true;
      next.contentVersion = ONBOARDING_CONTENT_VERSION;
      next.startedAt = current.startedAt ?? now.toISOString();
      if (action.startedTour && current.status === "pending") {
        next.status = "in_progress";
      }
      break;
    }
    case "complete_task": {
      if (!isManualTaskId(action.taskId)) break;
      next.completedTasks = addUnique(current.completedTasks, action.taskId);
      break;
    }
    case "uncomplete_task": {
      if (!isManualTaskId(action.taskId)) break;
      next.completedTasks = current.completedTasks.filter(
        (id) => id !== action.taskId,
      );
      break;
    }
    case "dismiss_hint": {
      next.dismissedHints = addUnique(current.dismissedHints, action.hintId);
      break;
    }
    case "skip": {
      next.status = "skipped";
      next.welcomeSeen = true;
      next.contentVersion = ONBOARDING_CONTENT_VERSION;
      break;
    }
    case "reset": {
      next = {
        ...DEFAULT_STATE,
        // Manual ticks survive a reset: they record real work, not tour state.
        completedTasks: current.completedTasks,
      };
      break;
    }
  }

  if (next.status !== "skipped") {
    const signals = await getOnboardingSignals(userId, role).catch(
      (error: unknown) => {
        console.error("[onboarding] getOnboardingSignals:", error);
        return emptySignals();
      },
    );

    const tasks = resolveChecklist({
      role,
      completedTours: next.completedTours,
      completedTasks: next.completedTasks,
      signals,
    });

    const allDone = tasks.length > 0 && tasks.every((task) => task.done);

    if (allDone) {
      next.status = "completed";
      next.completedAt = current.completedAt ?? now.toISOString();
    } else if (next.status === "completed") {
      next.status = "in_progress";
      next.completedAt = null;
    }
  }

  const [saved] = await db
    .insert(userOnboarding)
    .values({
      userId,
      status: next.status,
      completedTours: JSON.stringify(next.completedTours),
      completedTasks: JSON.stringify(next.completedTasks),
      dismissedHints: JSON.stringify(next.dismissedHints),
      welcomeSeen: next.welcomeSeen,
      contentVersion: next.contentVersion,
      startedAt: next.startedAt ? new Date(next.startedAt) : null,
      completedAt: next.completedAt ? new Date(next.completedAt) : null,
    })
    .onConflictDoUpdate({
      target: userOnboarding.userId,
      set: {
        status: next.status,
        completedTours: JSON.stringify(next.completedTours),
        completedTasks: JSON.stringify(next.completedTasks),
        dismissedHints: JSON.stringify(next.dismissedHints),
        welcomeSeen: next.welcomeSeen,
        contentVersion: next.contentVersion,
        startedAt: next.startedAt ? new Date(next.startedAt) : null,
        completedAt: next.completedAt ? new Date(next.completedAt) : null,
        updatedAt: now,
      },
    })
    .returning();

  return saved ? toState(saved) : next;
}

/** Everything the client needs to render onboarding, in one round trip. */
export async function getOnboardingOverview(
  userId: string,
  role: UserRole,
): Promise<OnboardingOverview> {
  const [state, signals] = await Promise.all([
    getOnboardingState(userId),
    getOnboardingSignals(userId, role).catch((error: unknown) => {
      console.error("[onboarding] getOnboardingSignals:", error);
      return emptySignals();
    }),
  ]);

  const tasks = resolveChecklist({
    role,
    completedTours: state.completedTours,
    completedTasks: state.completedTasks,
    signals,
  });

  const tours = getToursForRole(role).map((tour) => ({
    ...tour,
    completed: state.completedTours.includes(tour.id),
  }));

  const completedCount = tasks.filter((task) => task.done).length;

  return {
    state,
    signals,
    tours,
    tasks,
    completedCount,
    totalCount: tasks.length,
    isComplete: tasks.length > 0 && completedCount === tasks.length,
    shouldShowWelcome:
      state.status !== "skipped" &&
      (!state.welcomeSeen || state.contentVersion < ONBOARDING_CONTENT_VERSION),
  };
}
