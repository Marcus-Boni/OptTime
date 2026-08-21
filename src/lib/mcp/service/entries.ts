import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { project, timeEntry, user } from "@/lib/db/schema";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { isTimesheetLockedStatus } from "@/lib/timesheet-status";
import { getPeriodRange, getWeekPeriod } from "@/lib/utils";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";
import { humanizeMinutes, weekdayLabel } from "../format";
import { resolveProject } from "./projects";
import { type ActiveTimerView, assertUnlocked, getActiveTimer } from "./timer";

/**
 * Time entry CRUD plus the day/week roll-ups agents read before answering
 * "quanto eu já lancei hoje?".
 */

export interface TimeEntryView {
  id: string;
  date: string;
  durationMinutes: number;
  durationLabel: string;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  locked: boolean;
  project: {
    id: string;
    name: string;
    code: string;
    color: string;
  };
}

type EntryRow = typeof timeEntry.$inferSelect & {
  project: { id: string; name: string; code: string; color: string };
};

function toView(row: EntryRow, lockedPeriods: Set<string>): TimeEntryView {
  return {
    id: row.id,
    date: row.date,
    durationMinutes: row.duration,
    durationLabel: humanizeMinutes(row.duration),
    description: row.description,
    billable: row.billable,
    azureWorkItemId: row.azureWorkItemId,
    azureWorkItemTitle: row.azureWorkItemTitle,
    locked: lockedPeriods.has(getWeekPeriod(row.date)),
    project: row.project,
  };
}

/**
 * Resolves the lock state of every week touched by a set of entries in one go,
 * so a 50-entry listing costs one extra query instead of fifty.
 */
async function buildLockedPeriodSet(
  userId: string,
  dates: string[],
): Promise<Set<string>> {
  const periods = [...new Set(dates.map((date) => getWeekPeriod(date)))];
  const locked = new Set<string>();

  await Promise.all(
    periods.map(async (period) => {
      const { start } = getPeriodRange(period, "weekly");
      const status = await getWeeklyTimesheetStatusForDate(userId, start);
      if (isTimesheetLockedStatus(status.status)) locked.add(period);
    }),
  );

  return locked;
}

export interface LogTimeInput {
  /** Project id, code or name. */
  project: string;
  durationMinutes: number;
  description: string;
  date: string;
  azureWorkItemId?: number | null;
  azureWorkItemTitle?: string | null;
  billable?: boolean | null;
}

export interface LogTimeResult {
  entry: TimeEntryView;
  dayTotalMinutes: number;
  dayTotalLabel: string;
}

export async function logTime(
  principal: AgentPrincipal,
  input: LogTimeInput,
): Promise<LogTimeResult> {
  const description = input.description?.trim();
  if (!description) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Descrição é obrigatória — resuma o que foi feito nesse período.",
    );
  }

  const targetProject = await resolveProject(principal, input.project);
  await assertUnlocked(principal.userId, input.date);

  const [created] = await db
    .insert(timeEntry)
    .values({
      id: crypto.randomUUID(),
      userId: principal.userId,
      projectId: targetProject.id,
      description: description.slice(0, 500),
      date: input.date,
      duration: input.durationMinutes,
      billable: input.billable ?? targetProject.billable,
      azureWorkItemId: input.azureWorkItemId ?? null,
      azureWorkItemTitle: input.azureWorkItemTitle ?? null,
      azdoSyncStatus: input.azureWorkItemId ? "pending" : "none",
    })
    .returning();

  triggerCompletedWorkSync(principal.userId, [created.azureWorkItemId]);

  const dayTotalMinutes = await sumMinutes(
    principal.userId,
    input.date,
    input.date,
  );

  return {
    entry: {
      id: created.id,
      date: created.date,
      durationMinutes: created.duration,
      durationLabel: humanizeMinutes(created.duration),
      description: created.description,
      billable: created.billable,
      azureWorkItemId: created.azureWorkItemId,
      azureWorkItemTitle: created.azureWorkItemTitle,
      locked: false,
      project: {
        id: targetProject.id,
        name: targetProject.name,
        code: targetProject.code,
        color: targetProject.color,
      },
    },
    dayTotalMinutes,
    dayTotalLabel: humanizeMinutes(dayTotalMinutes),
  };
}

export interface ListTimeEntriesInput {
  from: string;
  to: string;
  projectRef?: string | null;
  limit?: number | null;
}

export async function listTimeEntries(
  principal: AgentPrincipal,
  input: ListTimeEntriesInput,
): Promise<TimeEntryView[]> {
  const conditions = [
    eq(timeEntry.userId, principal.userId),
    isNull(timeEntry.deletedAt),
    gte(timeEntry.date, input.from),
    lte(timeEntry.date, input.to),
  ];

  if (input.projectRef) {
    const target = await resolveProject(principal, input.projectRef);
    conditions.push(eq(timeEntry.projectId, target.id));
  }

  const rows = await db.query.timeEntry.findMany({
    where: and(...conditions),
    with: {
      project: { columns: { id: true, name: true, code: true, color: true } },
    },
    orderBy: [desc(timeEntry.date), desc(timeEntry.createdAt)],
    limit: input.limit && input.limit > 0 ? Math.min(input.limit, 200) : 100,
  });

  const locked = await buildLockedPeriodSet(
    principal.userId,
    rows.map((row) => row.date),
  );

  return rows.map((row) => toView(row, locked));
}

/** Loads an entry, asserting it belongs to the principal and is editable. */
async function loadEditableEntry(
  principal: AgentPrincipal,
  entryId: string,
): Promise<EntryRow> {
  const row = await db.query.timeEntry.findFirst({
    where: and(eq(timeEntry.id, entryId), isNull(timeEntry.deletedAt)),
    with: {
      project: { columns: { id: true, name: true, code: true, color: true } },
    },
  });

  if (!row || row.userId !== principal.userId) {
    throw new AgentError("NOT_FOUND", "Lançamento não encontrado.");
  }

  await assertUnlocked(principal.userId, row.date);

  return row;
}

export interface UpdateTimeEntryInput {
  entryId: string;
  project?: string | null;
  durationMinutes?: number | null;
  description?: string | null;
  date?: string | null;
  billable?: boolean | null;
  azureWorkItemId?: number | null;
}

export async function updateTimeEntry(
  principal: AgentPrincipal,
  input: UpdateTimeEntryInput,
): Promise<TimeEntryView> {
  const current = await loadEditableEntry(principal, input.entryId);

  const patch: Partial<typeof timeEntry.$inferInsert> = {};
  let nextProject = current.project;

  if (input.project) {
    const target = await resolveProject(principal, input.project);
    patch.projectId = target.id;
    nextProject = {
      id: target.id,
      name: target.name,
      code: target.code,
      color: target.color,
    };
  }

  if (input.description != null) {
    const description = input.description.trim();
    if (!description) {
      throw new AgentError("VALIDATION_ERROR", "Descrição não pode ser vazia.");
    }
    patch.description = description.slice(0, 500);
  }

  if (input.durationMinutes != null) patch.duration = input.durationMinutes;
  if (input.billable != null) patch.billable = input.billable;

  if (input.date) {
    await assertUnlocked(principal.userId, input.date);
    patch.date = input.date;
  }

  if (input.azureWorkItemId !== undefined) {
    patch.azureWorkItemId = input.azureWorkItemId;
    patch.azdoSyncStatus = input.azureWorkItemId ? "pending" : "none";
  }

  if (Object.keys(patch).length === 0) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Nenhum campo para atualizar foi informado.",
    );
  }

  const [updated] = await db
    .update(timeEntry)
    .set(patch)
    .where(eq(timeEntry.id, input.entryId))
    .returning();

  triggerCompletedWorkSync(principal.userId, [
    updated.azureWorkItemId,
    current.azureWorkItemId,
  ]);

  return {
    id: updated.id,
    date: updated.date,
    durationMinutes: updated.duration,
    durationLabel: humanizeMinutes(updated.duration),
    description: updated.description,
    billable: updated.billable,
    azureWorkItemId: updated.azureWorkItemId,
    azureWorkItemTitle: updated.azureWorkItemTitle,
    locked: false,
    project: nextProject,
  };
}

export async function deleteTimeEntry(
  principal: AgentPrincipal,
  entryId: string,
): Promise<{ entryId: string; durationMinutes: number; date: string }> {
  const current = await loadEditableEntry(principal, entryId);

  await db
    .update(timeEntry)
    .set({ deletedAt: new Date() })
    .where(eq(timeEntry.id, entryId));

  triggerCompletedWorkSync(principal.userId, [current.azureWorkItemId]);

  return {
    entryId,
    durationMinutes: current.duration,
    date: current.date,
  };
}

async function sumMinutes(
  userId: string,
  from: string,
  to: string,
): Promise<number> {
  const rows = await db
    .select({ duration: timeEntry.duration })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.userId, userId),
        isNull(timeEntry.deletedAt),
        gte(timeEntry.date, from),
        lte(timeEntry.date, to),
      ),
    );

  return rows.reduce((total, row) => total + row.duration, 0);
}

export interface ProjectBreakdown {
  projectId: string;
  projectName: string;
  projectCode: string;
  minutes: number;
  label: string;
}

export interface DaySummary {
  date: string;
  weekday: string;
  totalMinutes: number;
  totalLabel: string;
  billableMinutes: number;
  entryCount: number;
  dailyCapacityMinutes: number;
  remainingMinutes: number;
  remainingLabel: string;
  isComplete: boolean;
  byProject: ProjectBreakdown[];
  entries: TimeEntryView[];
  activeTimer: ActiveTimerView | null;
  weekTotalMinutes: number;
  weekTotalLabel: string;
  weeklyCapacityMinutes: number;
}

/** Working days per week used to derive a daily target from weekly capacity. */
const WORKING_DAYS_PER_WEEK = 5;

export async function getDaySummary(
  principal: AgentPrincipal,
  date: string,
): Promise<DaySummary> {
  const [profile, rows, activeTimer] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.id, principal.userId),
      columns: { weeklyCapacity: true },
    }),
    db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.userId, principal.userId),
        eq(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
      ),
      with: {
        project: { columns: { id: true, name: true, code: true, color: true } },
      },
      orderBy: [desc(timeEntry.createdAt)],
    }),
    getActiveTimer(principal),
  ]);

  const period = getWeekPeriod(date);
  const { start, end } = getPeriodRange(period, "weekly");
  const weekTotalMinutes = await sumMinutes(principal.userId, start, end);

  const weeklyCapacityMinutes = (profile?.weeklyCapacity ?? 40) * 60;
  const dailyCapacityMinutes = Math.round(
    weeklyCapacityMinutes / WORKING_DAYS_PER_WEEK,
  );

  const totalMinutes = rows.reduce((total, row) => total + row.duration, 0);
  const billableMinutes = rows
    .filter((row) => row.billable)
    .reduce((total, row) => total + row.duration, 0);

  const byProjectMap = new Map<string, ProjectBreakdown>();
  for (const row of rows) {
    const existing = byProjectMap.get(row.projectId);
    if (existing) {
      existing.minutes += row.duration;
      existing.label = humanizeMinutes(existing.minutes);
    } else {
      byProjectMap.set(row.projectId, {
        projectId: row.projectId,
        projectName: row.project.name,
        projectCode: row.project.code,
        minutes: row.duration,
        label: humanizeMinutes(row.duration),
      });
    }
  }

  const locked = await buildLockedPeriodSet(principal.userId, [date]);
  const remainingMinutes = Math.max(0, dailyCapacityMinutes - totalMinutes);

  return {
    date,
    weekday: weekdayLabel(date),
    totalMinutes,
    totalLabel: humanizeMinutes(totalMinutes),
    billableMinutes,
    entryCount: rows.length,
    dailyCapacityMinutes,
    remainingMinutes,
    remainingLabel: humanizeMinutes(remainingMinutes),
    isComplete: totalMinutes >= dailyCapacityMinutes,
    byProject: [...byProjectMap.values()].sort((a, b) => b.minutes - a.minutes),
    entries: rows.map((row) => toView(row, locked)),
    activeTimer,
    weekTotalMinutes,
    weekTotalLabel: humanizeMinutes(weekTotalMinutes),
    weeklyCapacityMinutes,
  };
}

export interface ProjectsTouchedSummary {
  from: string;
  to: string;
  totalMinutes: number;
  byProject: ProjectBreakdown[];
}

/** Roll-up used by the `opt-time://user/today` and week resources. */
export async function getRangeBreakdown(
  principal: AgentPrincipal,
  from: string,
  to: string,
): Promise<ProjectsTouchedSummary> {
  const rows = await db
    .select({
      projectId: timeEntry.projectId,
      projectName: project.name,
      projectCode: project.code,
      duration: timeEntry.duration,
    })
    .from(timeEntry)
    .innerJoin(project, eq(timeEntry.projectId, project.id))
    .where(
      and(
        eq(timeEntry.userId, principal.userId),
        isNull(timeEntry.deletedAt),
        gte(timeEntry.date, from),
        lte(timeEntry.date, to),
      ),
    );

  const byProject = new Map<string, ProjectBreakdown>();
  let totalMinutes = 0;

  for (const row of rows) {
    totalMinutes += row.duration;
    const existing = byProject.get(row.projectId);
    if (existing) {
      existing.minutes += row.duration;
      existing.label = humanizeMinutes(existing.minutes);
    } else {
      byProject.set(row.projectId, {
        projectId: row.projectId,
        projectName: row.projectName,
        projectCode: row.projectCode,
        minutes: row.duration,
        label: humanizeMinutes(row.duration),
      });
    }
  }

  return {
    from,
    to,
    totalMinutes,
    byProject: [...byProject.values()].sort((a, b) => b.minutes - a.minutes),
  };
}
