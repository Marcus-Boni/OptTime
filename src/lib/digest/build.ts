/**
 * Weekly digest statistics.
 *
 * Runs both from the cron (no session) and from the in-app preview, so it takes
 * an explicit userId/role instead of reading a session.
 */

import { and, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  type ActorContext,
  type AppRole,
  getDirectReportIds,
  getManagedProjectIds,
} from "@/lib/access-control";
import {
  eachDate,
  formatPeriodLabel,
  formatWeekdayLabel,
  isWeekend,
  resolvePeriod,
} from "@/lib/ai/periods";
import { db } from "@/lib/db";
import { projectMember, timeEntry, timesheet, user } from "@/lib/db/schema";
import { getWeekPeriod } from "@/lib/utils";
import { CATEGORY_LABELS, classifyWorkCategory } from "./classify";
import type {
  DigestCategorySlice,
  DigestDaySlice,
  DigestPeriod,
  DigestProjectSlice,
  DigestTeamMember,
  ManagerDigest,
  MemberDigest,
  WorkCategory,
} from "./types";

/** A weekday below this is flagged as incomplete, matching the submit rule. */
const INCOMPLETE_DAY_THRESHOLD_MINUTES = 360;
const UNDERLOAD_RATIO = 0.6;
const OVERLOAD_RATIO = 1.1;

type TimesheetStatus = MemberDigest["timesheetStatus"];

function normalizeStatus(value: string | undefined): TimesheetStatus {
  return value === "submitted" || value === "approved" || value === "rejected"
    ? value
    : "open";
}

function percentage(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** Resolves the ISO week that ended before `today`. */
export function resolveDigestPeriod(today: string): DigestPeriod {
  const range = resolvePeriod("last_week", today);
  const period = getWeekPeriod(range.from);

  return {
    period,
    from: range.from,
    to: range.to,
    label: formatPeriodLabel(period),
  };
}

interface EntryRow {
  date: string;
  duration: number;
  billable: boolean;
  description: string;
  azureWorkItemTitle: string | null;
  projectId: string;
  project: { name: string; code: string; color: string } | null;
}

function buildProjectSlices(
  entries: EntryRow[],
  totalMinutes: number,
): DigestProjectSlice[] {
  const byProject = new Map<string, DigestProjectSlice>();

  for (const entry of entries) {
    const existing = byProject.get(entry.projectId);

    if (existing) {
      existing.minutes += entry.duration;
      continue;
    }

    byProject.set(entry.projectId, {
      projectId: entry.projectId,
      name: entry.project?.name ?? "Projeto removido",
      code: entry.project?.code ?? "—",
      color: entry.project?.color ?? "#737373",
      minutes: entry.duration,
      percentage: 0,
    });
  }

  return [...byProject.values()]
    .map((slice) => ({
      ...slice,
      percentage: percentage(slice.minutes, totalMinutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

function buildDaySlices(
  entries: EntryRow[],
  from: string,
  to: string,
): DigestDaySlice[] {
  const minutesByDate = new Map<string, number>();

  for (const entry of entries) {
    minutesByDate.set(
      entry.date,
      (minutesByDate.get(entry.date) ?? 0) + entry.duration,
    );
  }

  return eachDate(from, to).map((date) => ({
    date,
    weekday: formatWeekdayLabel(date),
    minutes: minutesByDate.get(date) ?? 0,
    isWeekend: isWeekend(date),
  }));
}

function buildCategorySlices(
  entries: EntryRow[],
  totalMinutes: number,
): DigestCategorySlice[] {
  const byCategory = new Map<WorkCategory, number>();

  for (const entry of entries) {
    const category = classifyWorkCategory(
      entry.description,
      entry.azureWorkItemTitle,
    );
    byCategory.set(category, (byCategory.get(category) ?? 0) + entry.duration);
  }

  return [...byCategory.entries()]
    .map(([category, minutes]) => ({
      category,
      label: CATEGORY_LABELS[category],
      minutes,
      percentage: percentage(minutes, totalMinutes),
    }))
    .sort((a, b) => b.minutes - a.minutes);
}

async function fetchEntries(
  userIds: string[],
  from: string,
  to: string,
): Promise<Array<EntryRow & { userId: string }>> {
  if (userIds.length === 0) return [];

  const rows = await db.query.timeEntry.findMany({
    where: and(
      inArray(timeEntry.userId, userIds),
      gte(timeEntry.date, from),
      lte(timeEntry.date, to),
      isNull(timeEntry.deletedAt),
    ),
    columns: {
      userId: true,
      date: true,
      duration: true,
      billable: true,
      description: true,
      azureWorkItemTitle: true,
      projectId: true,
    },
    with: {
      project: { columns: { name: true, code: true, color: true } },
    },
  });

  return rows;
}

// ─── Member digest ───────────────────────────────────────────────────

export async function buildMemberDigest(
  target: {
    userId: string;
    name: string;
    email: string;
    role: AppRole;
    weeklyCapacity: number;
  },
  today: string,
): Promise<MemberDigest> {
  const period = resolveDigestPeriod(today);
  const previous = resolvePeriod("last_week", period.from);

  const [entries, previousEntries, sheet] = await Promise.all([
    fetchEntries([target.userId], period.from, period.to),
    db
      .select({ duration: timeEntry.duration })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, target.userId),
          gte(timeEntry.date, previous.from),
          lte(timeEntry.date, previous.to),
          isNull(timeEntry.deletedAt),
        ),
      ),
    db.query.timesheet.findFirst({
      where: and(
        eq(timesheet.userId, target.userId),
        eq(timesheet.period, period.period),
      ),
      columns: { status: true },
    }),
  ]);

  const totalMinutes = entries.reduce((sum, entry) => sum + entry.duration, 0);
  const previousTotalMinutes = previousEntries.reduce(
    (sum, entry) => sum + entry.duration,
    0,
  );

  const days = buildDaySlices(entries, period.from, period.to);
  const businessDays = days.filter((day) => !day.isWeekend);

  const mostProductive = days.reduce<DigestDaySlice | null>(
    (best, day) => (day.minutes > (best?.minutes ?? 0) ? day : best),
    null,
  );

  return {
    audience: "member",
    userId: target.userId,
    userName: target.name,
    email: target.email,
    role: target.role,
    period,
    totalMinutes,
    previousTotalMinutes,
    deltaMinutes: totalMinutes - previousTotalMinutes,
    deltaPercentage:
      previousTotalMinutes > 0
        ? Math.round(
            ((totalMinutes - previousTotalMinutes) / previousTotalMinutes) *
              100,
          )
        : null,
    billableMinutes: entries
      .filter((entry) => entry.billable)
      .reduce((sum, entry) => sum + entry.duration, 0),
    targetMinutes: target.weeklyCapacity * 60,
    entryCount: entries.length,
    projects: buildProjectSlices(entries, totalMinutes),
    days,
    categories: buildCategorySlices(entries, totalMinutes),
    mostProductiveDay:
      mostProductive && mostProductive.minutes > 0
        ? {
            date: mostProductive.date,
            weekday: mostProductive.weekday,
            minutes: mostProductive.minutes,
          }
        : null,
    timesheetStatus: normalizeStatus(sheet?.status),
    incompleteDays: businessDays.filter(
      (day) => day.minutes < INCOMPLETE_DAY_THRESHOLD_MINUTES,
    ).length,
  };
}

// ─── Manager digest ──────────────────────────────────────────────────

/** Everyone in the manager's scope: direct reports plus managed-project members. */
async function resolveTeamUserIds(actor: ActorContext): Promise<string[]> {
  if (actor.role === "admin") {
    const rows = await db.query.user.findMany({
      where: eq(user.isActive, true),
      columns: { id: true },
    });
    return rows.map((row) => row.id).filter((id) => id !== actor.userId);
  }

  const [directReports, managedProjectIds] = await Promise.all([
    getDirectReportIds(actor.userId),
    getManagedProjectIds(actor),
  ]);

  const ids = new Set(directReports);

  if (managedProjectIds && managedProjectIds.length > 0) {
    const members = await db.query.projectMember.findMany({
      where: inArray(projectMember.projectId, managedProjectIds),
      columns: { userId: true },
    });
    for (const member of members) ids.add(member.userId);
  }

  ids.delete(actor.userId);
  return [...ids];
}

/** Returns null when the manager has nobody in scope. */
export async function buildManagerDigest(
  target: {
    userId: string;
    name: string;
    email: string;
    role: AppRole;
  },
  today: string,
): Promise<ManagerDigest | null> {
  const period = resolveDigestPeriod(today);
  const teamUserIds = await resolveTeamUserIds({
    role: target.role,
    userId: target.userId,
  });

  if (teamUserIds.length === 0) return null;

  const [members, entries, sheets] = await Promise.all([
    db.query.user.findMany({
      where: and(inArray(user.id, teamUserIds), eq(user.isActive, true)),
      columns: { id: true, name: true, weeklyCapacity: true },
    }),
    fetchEntries(teamUserIds, period.from, period.to),
    db.query.timesheet.findMany({
      where: and(
        inArray(timesheet.userId, teamUserIds),
        eq(timesheet.period, period.period),
      ),
      columns: { userId: true, status: true },
    }),
  ]);

  const statusByUser = new Map(
    sheets.map((sheet) => [sheet.userId, normalizeStatus(sheet.status)]),
  );

  const minutesByUser = new Map<string, number>();
  for (const entry of entries) {
    minutesByUser.set(
      entry.userId,
      (minutesByUser.get(entry.userId) ?? 0) + entry.duration,
    );
  }

  const teamMembers: DigestTeamMember[] = members
    .map((member) => ({
      userId: member.id,
      name: member.name,
      minutes: minutesByUser.get(member.id) ?? 0,
      targetMinutes: member.weeklyCapacity * 60,
      timesheetStatus: statusByUser.get(member.id) ?? "open",
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const teamTotalMinutes = teamMembers.reduce(
    (sum, member) => sum + member.minutes,
    0,
  );

  const approvals = {
    approved: 0,
    submitted: 0,
    rejected: 0,
    notSubmitted: 0,
  };

  for (const member of teamMembers) {
    if (member.timesheetStatus === "approved") approvals.approved += 1;
    else if (member.timesheetStatus === "submitted") approvals.submitted += 1;
    else if (member.timesheetStatus === "rejected") approvals.rejected += 1;
    else approvals.notSubmitted += 1;
  }

  return {
    audience: "manager",
    userId: target.userId,
    userName: target.name,
    email: target.email,
    role: target.role,
    period,
    teamTotalMinutes,
    teamTargetMinutes: teamMembers.reduce(
      (sum, member) => sum + member.targetMinutes,
      0,
    ),
    memberCount: teamMembers.length,
    activeMemberCount: teamMembers.filter((member) => member.minutes > 0)
      .length,
    projects: buildProjectSlices(entries, teamTotalMinutes),
    members: teamMembers,
    approvals,
    underloaded: teamMembers.filter(
      (member) =>
        member.targetMinutes > 0 &&
        member.minutes < member.targetMinutes * UNDERLOAD_RATIO,
    ),
    overloaded: teamMembers.filter(
      (member) =>
        member.targetMinutes > 0 &&
        member.minutes > member.targetMinutes * OVERLOAD_RATIO,
    ),
  };
}
