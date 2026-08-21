import { eq } from "drizzle-orm";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { activeTimer, timeEntry } from "@/lib/db/schema";
import {
  assertWeeklyTimesheetDateUnlocked,
  LockedTimesheetPeriodError,
} from "@/lib/time-entry-locks";
import { todayInAppTimeZone } from "@/lib/timezone";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";
import { humanizeMinutes } from "../format";
import { type ProjectSummary, resolveProject } from "./projects";

/**
 * Real-time timer control.
 *
 * The timer lives in the database (one row per user, enforced by a unique
 * index), so a timer started by an agent in Cursor is the same timer the user
 * sees in the sidebar of the web app a second later.
 */

export interface ActiveTimerView {
  id: string;
  description: string;
  billable: boolean;
  startedAt: string;
  pausedAt: string | null;
  isPaused: boolean;
  elapsedMinutes: number;
  elapsedLabel: string;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  project: {
    id: string;
    name: string;
    code: string;
    color: string;
  };
}

/**
 * A timer shorter than this is treated as never having run. Saved entries are
 * clamped to a one-minute floor, so persisting these would invent work.
 */
const MIN_PERSISTED_TIMER_MS = 60_000;

type TimerRow = typeof activeTimer.$inferSelect;

/** Milliseconds accumulated so far, honouring the paused state. */
function elapsedMs(timer: TimerRow, now = Date.now()): number {
  if (timer.pausedAt) return timer.accumulatedMs;
  return timer.accumulatedMs + (now - timer.startedAt.getTime());
}

function toView(
  timer: TimerRow & {
    project: { id: string; name: string; code: string; color: string };
  },
): ActiveTimerView {
  const minutes = Math.floor(elapsedMs(timer) / 60_000);

  return {
    id: timer.id,
    description: timer.description,
    billable: timer.billable,
    startedAt: timer.startedAt.toISOString(),
    pausedAt: timer.pausedAt?.toISOString() ?? null,
    isPaused: !!timer.pausedAt,
    elapsedMinutes: minutes,
    elapsedLabel: humanizeMinutes(minutes),
    azureWorkItemId: timer.azureWorkItemId,
    azureWorkItemTitle: timer.azureWorkItemTitle,
    project: timer.project,
  };
}

async function findTimerWithProject(userId: string) {
  return db.query.activeTimer.findFirst({
    where: eq(activeTimer.userId, userId),
    with: {
      project: { columns: { id: true, name: true, code: true, color: true } },
    },
  });
}

export async function getActiveTimer(
  principal: AgentPrincipal,
): Promise<ActiveTimerView | null> {
  const timer = await findTimerWithProject(principal.userId);
  return timer ? toView(timer) : null;
}

export interface StartTimerInput {
  /** Project id, code or name — resolved leniently. */
  project: string;
  description: string;
  azureWorkItemId?: number | null;
  azureWorkItemTitle?: string | null;
  billable?: boolean | null;
}

export interface StartTimerResult {
  timer: ActiveTimerView;
  /** Set when a previously running timer was stopped and saved automatically. */
  replaced: {
    projectName: string;
    durationMinutes: number;
    entryId: string;
  } | null;
  /** Set when a previous timer was dropped for having run under a minute. */
  discarded: { projectName: string } | null;
}

/**
 * Starts a timer, closing any timer already running.
 *
 * Only one timer per user may exist, so the previous one is stopped and saved
 * as a time entry rather than discarded — losing tracked work would be the
 * worst possible failure mode here.
 *
 * The exception is a timer that never really ran: an agent retrying a timed-out
 * `start_timer`, or a user immediately correcting the project, would otherwise
 * leave a phantom 1-minute entry behind, because a saved entry is clamped to a
 * one-minute floor. Under `MIN_PERSISTED_TIMER_MS` the previous timer is
 * discarded instead of persisted.
 */
export async function startTimer(
  principal: AgentPrincipal,
  input: StartTimerInput,
): Promise<StartTimerResult> {
  const description = input.description?.trim();
  if (!description) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Descrição é obrigatória para iniciar o timer — descreva o que está sendo feito.",
    );
  }

  const targetProject = await resolveProject(principal, input.project);
  const today = todayInAppTimeZone();

  await assertUnlocked(principal.userId, today);

  const existing = await findTimerWithProject(principal.userId);
  let replaced: StartTimerResult["replaced"] = null;
  let discarded: StartTimerResult["discarded"] = null;

  if (existing) {
    if (elapsedMs(existing) < MIN_PERSISTED_TIMER_MS) {
      await db
        .delete(activeTimer)
        .where(eq(activeTimer.userId, principal.userId));
      discarded = { projectName: existing.project.name };
    } else {
      const saved = await stopAndPersist(principal.userId, existing);
      replaced = {
        projectName: existing.project.name,
        durationMinutes: saved.durationMinutes,
        entryId: saved.entryId,
      };
    }
  }

  await db.insert(activeTimer).values({
    id: crypto.randomUUID(),
    userId: principal.userId,
    projectId: targetProject.id,
    description,
    billable: input.billable ?? targetProject.billable,
    azureWorkItemId: input.azureWorkItemId ?? null,
    azureWorkItemTitle: input.azureWorkItemTitle ?? null,
    startedAt: new Date(),
    accumulatedMs: 0,
  });

  const created = await findTimerWithProject(principal.userId);
  if (!created) {
    throw new AgentError(
      "INTERNAL_ERROR",
      "O timer foi criado mas não pôde ser lido de volta.",
    );
  }

  return { timer: toView(created), replaced, discarded };
}

export interface StopTimerResult {
  /** False when the timer was too short to record; no entry was created. */
  saved: boolean;
  entryId: string | null;
  durationMinutes: number;
  durationLabel: string;
  elapsedSeconds: number;
  date: string;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  project: ProjectSummary | { id: string; name: string; code: string };
}

/**
 * Stops the running timer and records it.
 *
 * A timer under `MIN_PERSISTED_TIMER_MS` is discarded rather than saved. Entries
 * have a one-minute floor, so persisting a 20-second timer would bill 40 seconds
 * of work that never happened — and "started it by mistake" is the single most
 * common reason a timer stops that quickly.
 */
export async function stopTimer(
  principal: AgentPrincipal,
): Promise<StopTimerResult> {
  const existing = await findTimerWithProject(principal.userId);

  if (!existing) {
    throw new AgentError("NOT_FOUND", "Nenhum timer ativo no momento.", {
      hint: "Use opt_time_start_timer para iniciar, ou opt_time_log_time para lançar horas manualmente.",
    });
  }

  const elapsed = elapsedMs(existing);
  const common = {
    elapsedSeconds: Math.round(elapsed / 1000),
    description: existing.description,
    billable: existing.billable,
    azureWorkItemId: existing.azureWorkItemId,
    project: existing.project,
  };

  if (elapsed < MIN_PERSISTED_TIMER_MS) {
    await db
      .delete(activeTimer)
      .where(eq(activeTimer.userId, principal.userId));

    return {
      ...common,
      saved: false,
      entryId: null,
      durationMinutes: 0,
      durationLabel: humanizeMinutes(0),
      date: todayInAppTimeZone(),
    };
  }

  const saved = await stopAndPersist(principal.userId, existing);

  return {
    ...common,
    saved: true,
    entryId: saved.entryId,
    durationMinutes: saved.durationMinutes,
    durationLabel: humanizeMinutes(saved.durationMinutes),
    date: saved.date,
  };
}

export async function pauseTimer(
  principal: AgentPrincipal,
): Promise<ActiveTimerView> {
  const existing = await findTimerWithProject(principal.userId);
  if (!existing) {
    throw new AgentError("NOT_FOUND", "Nenhum timer ativo no momento.");
  }
  if (existing.pausedAt) {
    throw new AgentError("CONFLICT", "O timer já está pausado.");
  }

  const now = new Date();
  await db
    .update(activeTimer)
    .set({
      pausedAt: now,
      accumulatedMs: elapsedMs(existing, now.getTime()),
    })
    .where(eq(activeTimer.userId, principal.userId));

  const updated = await findTimerWithProject(principal.userId);
  if (!updated) {
    throw new AgentError("INTERNAL_ERROR", "Falha ao pausar o timer.");
  }
  return toView(updated);
}

export async function resumeTimer(
  principal: AgentPrincipal,
): Promise<ActiveTimerView> {
  const existing = await findTimerWithProject(principal.userId);
  if (!existing) {
    throw new AgentError("NOT_FOUND", "Nenhum timer ativo no momento.");
  }
  if (!existing.pausedAt) {
    throw new AgentError("CONFLICT", "O timer já está em execução.");
  }

  await db
    .update(activeTimer)
    .set({ pausedAt: null, startedAt: new Date() })
    .where(eq(activeTimer.userId, principal.userId));

  const updated = await findTimerWithProject(principal.userId);
  if (!updated) {
    throw new AgentError("INTERNAL_ERROR", "Falha ao retomar o timer.");
  }
  return toView(updated);
}

export interface UpdateTimerInput {
  description?: string | null;
  billable?: boolean | null;
  azureWorkItemId?: number | null;
  azureWorkItemTitle?: string | null;
}

/**
 * Edits the running timer in place.
 *
 * The editor extension uses this to attach the Work Item it read off the Git
 * branch to a timer that was already running — retyping the description just to
 * add a link would be the alternative. Fields left undefined are untouched;
 * passing `azureWorkItemId: null` clears the link deliberately.
 */
export async function updateTimer(
  principal: AgentPrincipal,
  input: UpdateTimerInput,
): Promise<ActiveTimerView> {
  const existing = await findTimerWithProject(principal.userId);
  if (!existing) {
    throw new AgentError("NOT_FOUND", "Nenhum timer ativo no momento.", {
      hint: "Inicie um timer antes de editá-lo.",
    });
  }

  const updates: Partial<typeof activeTimer.$inferInsert> = {};

  if (input.description !== undefined && input.description !== null) {
    const description = input.description.trim();
    if (!description) {
      throw new AgentError(
        "VALIDATION_ERROR",
        "A descrição não pode ficar vazia.",
      );
    }
    updates.description = description;
  }

  if (typeof input.billable === "boolean") {
    updates.billable = input.billable;
  }

  if (input.azureWorkItemId !== undefined) {
    updates.azureWorkItemId = input.azureWorkItemId;
    updates.azureWorkItemTitle = input.azureWorkItemId
      ? (input.azureWorkItemTitle ?? null)
      : null;
  }

  if (Object.keys(updates).length === 0) {
    return toView(existing);
  }

  await db
    .update(activeTimer)
    .set(updates)
    .where(eq(activeTimer.userId, principal.userId));

  const updated = await findTimerWithProject(principal.userId);
  if (!updated) {
    throw new AgentError("INTERNAL_ERROR", "Falha ao atualizar o timer.");
  }
  return toView(updated);
}

export interface DiscardTimerTimeResult {
  timer: ActiveTimerView;
  /** Minutes actually removed — capped at the time the timer had accumulated. */
  discardedMinutes: number;
  discardedLabel: string;
  /** True when the request asked for more time than the timer had run. */
  clamped: boolean;
}

/**
 * Removes a stretch of time from the running timer without stopping it.
 *
 * This exists for idle detection: an editor extension notices the developer
 * walked away for 30 minutes and offers to drop that gap. Doing it as a single
 * server-side operation matters — the alternative (stop, then patch the saved
 * entry) leaves a window where the wrong duration is already persisted and
 * already syncing to Azure DevOps.
 *
 * The discount is clamped to the elapsed time, so a clock skew or a duplicated
 * prompt can never drive the timer negative.
 */
export async function discardTimerTime(
  principal: AgentPrincipal,
  minutes: number,
): Promise<DiscardTimerTimeResult> {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Informe 'minutes' como um número positivo de minutos a descartar.",
    );
  }

  const existing = await findTimerWithProject(principal.userId);
  if (!existing) {
    throw new AgentError("NOT_FOUND", "Nenhum timer ativo no momento.", {
      hint: "Nada a descartar — o timer já foi parado.",
    });
  }

  const now = new Date();
  const elapsed = elapsedMs(existing, now.getTime());
  const requestedMs = Math.round(minutes * 60_000);
  const appliedMs = Math.min(requestedMs, elapsed);

  await db
    .update(activeTimer)
    .set({
      accumulatedMs: elapsed - appliedMs,
      // While paused, `startedAt` is dormant and gets reset on resume. While
      // running it is the clock's origin, so it has to move with the discount.
      ...(existing.pausedAt ? {} : { startedAt: now }),
    })
    .where(eq(activeTimer.userId, principal.userId));

  const updated = await findTimerWithProject(principal.userId);
  if (!updated) {
    throw new AgentError(
      "INTERNAL_ERROR",
      "Falha ao descartar o tempo ocioso.",
    );
  }

  const discardedMinutes = Math.round(appliedMs / 60_000);

  return {
    timer: toView(updated),
    discardedMinutes,
    discardedLabel: humanizeMinutes(discardedMinutes),
    clamped: appliedMs < requestedMs,
  };
}

/** Converts a running timer into a saved time entry, inside one transaction. */
async function stopAndPersist(
  userId: string,
  timer: TimerRow,
): Promise<{ entryId: string; durationMinutes: number; date: string }> {
  const now = new Date();
  const durationMinutes = Math.max(
    1,
    Math.round(elapsedMs(timer, now.getTime()) / 60_000),
  );
  const date = todayInAppTimeZone();

  await assertUnlocked(userId, date);

  const entry = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(timeEntry)
      .values({
        id: crypto.randomUUID(),
        userId,
        projectId: timer.projectId,
        description: timer.description || "Timer",
        date,
        duration: durationMinutes,
        billable: timer.billable,
        azureWorkItemId: timer.azureWorkItemId,
        azureWorkItemTitle: timer.azureWorkItemTitle,
        startTime: timer.startedAt,
        endTime: now,
        azdoSyncStatus: timer.azureWorkItemId ? "pending" : "none",
      })
      .returning();

    await tx.delete(activeTimer).where(eq(activeTimer.userId, userId));

    return created;
  });

  triggerCompletedWorkSync(userId, [entry.azureWorkItemId]);

  return { entryId: entry.id, durationMinutes, date };
}

/** Translates the shared lock error into the agent error vocabulary. */
export async function assertUnlocked(
  userId: string,
  date: string,
): Promise<void> {
  try {
    await assertWeeklyTimesheetDateUnlocked(userId, date);
  } catch (error: unknown) {
    if (error instanceof LockedTimesheetPeriodError) {
      throw new AgentError("PERIOD_LOCKED", error.message, {
        details: { date, timesheetStatus: error.timesheetStatus },
        hint: "A semana já foi submetida ou aprovada. Peça ao gestor para rejeitar o timesheet antes de alterar as horas.",
      });
    }
    throw error;
  }
}
