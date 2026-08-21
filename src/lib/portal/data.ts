/**
 * Sanitized data assembly for the public Client Portal.
 *
 * Everything the client sees flows through here, so the visibility toggles
 * (budget / team / descriptions) are enforced at assembly time — the page and
 * the API never receive fields they are not allowed to show.
 */

import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { portalLink, project, timeEntry, user } from "@/lib/db/schema";
import { buildWeekWindow } from "@/lib/hq/workload";
import { todayInAppTimeZone } from "@/lib/timezone";
import { getWeekPeriod, parseLocalDate } from "@/lib/utils";
import type { PortalGateState, PortalSnapshot } from "@/types/hq";

/** Weeks of history shown in the portal chart. */
const PORTAL_HISTORY_WEEKS = 11;
/** Recent activity rows served to the client. */
const ACTIVITY_LIMIT = 12;
/** Team members listed (by contribution). */
const TEAM_LIMIT = 8;

export type PortalLinkRow = typeof portalLink.$inferSelect;

/** Lifecycle state of a link, independent of the password gate. */
export function resolvePortalLinkState(
  link: PortalLinkRow | null | undefined,
): Extract<PortalGateState, "ok" | "expired" | "revoked" | "not_found"> {
  if (!link) return "not_found";
  if (link.revokedAt) return "revoked";
  if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
    return "expired";
  }
  return "ok";
}

export async function findPortalLinkByToken(
  token: string,
): Promise<PortalLinkRow | null> {
  if (!token || token.length > 200) return null;

  const link = await db.query.portalLink.findFirst({
    where: eq(portalLink.token, token),
  });

  return link ?? null;
}

function anonymizeName(index: number): string {
  return `Membro ${index + 1}`;
}

export async function buildPortalSnapshot(
  link: PortalLinkRow,
): Promise<PortalSnapshot | null> {
  const projectRow = await db.query.project.findFirst({
    where: eq(project.id, link.projectId),
    with: {
      scope: { columns: { stages: true } },
    },
  });

  if (!projectRow) return null;

  const today = todayInAppTimeZone();
  const weekWindow = buildWeekWindow(today, PORTAL_HISTORY_WEEKS, 0);
  const windowStart = weekWindow[0]?.start ?? today;

  const thirtyDaysAgo = new Date(parseLocalDate(today));
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  const thirtyDaysAgoKey = `${thirtyDaysAgo.getFullYear()}-${String(thirtyDaysAgo.getMonth() + 1).padStart(2, "0")}-${String(thirtyDaysAgo.getDate()).padStart(2, "0")}`;

  const [totals, recentDaily, memberMinutes, recentEntries] = await Promise.all(
    [
      db
        .select({
          consumed: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
          last30: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.date} >= ${thirtyDaysAgoKey} THEN ${timeEntry.duration} ELSE 0 END), 0)::int`,
        })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.projectId, link.projectId),
            isNull(timeEntry.deletedAt),
          ),
        ),
      db
        .select({
          date: timeEntry.date,
          minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
        })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.projectId, link.projectId),
            gte(timeEntry.date, windowStart),
            isNull(timeEntry.deletedAt),
          ),
        )
        .groupBy(timeEntry.date),
      db
        .select({
          userId: timeEntry.userId,
          name: user.name,
          minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
        })
        .from(timeEntry)
        .innerJoin(user, eq(timeEntry.userId, user.id))
        .where(
          and(
            eq(timeEntry.projectId, link.projectId),
            isNull(timeEntry.deletedAt),
          ),
        )
        .groupBy(timeEntry.userId, user.name),
      db
        .select({
          date: timeEntry.date,
          description: timeEntry.description,
          duration: timeEntry.duration,
          userName: user.name,
        })
        .from(timeEntry)
        .innerJoin(user, eq(timeEntry.userId, user.id))
        .where(
          and(
            eq(timeEntry.projectId, link.projectId),
            isNull(timeEntry.deletedAt),
          ),
        )
        .orderBy(sql`${timeEntry.date} DESC`, sql`${timeEntry.createdAt} DESC`)
        .limit(ACTIVITY_LIMIT),
    ],
  );

  const minutesByWeek = new Map<string, number>();
  for (const row of recentDaily) {
    const week = getWeekPeriod(row.date);
    minutesByWeek.set(
      week,
      (minutesByWeek.get(week) ?? 0) + Number(row.minutes),
    );
  }

  const weeklySeries = weekWindow.map((week) => ({
    week: week.week,
    weekStart: week.start,
    label: week.label,
    minutes: minutesByWeek.get(week.week) ?? 0,
  }));

  const consumedMinutes = Number(totals[0]?.consumed ?? 0);
  const budgetMinutes =
    projectRow.budget !== null ? projectRow.budget * 60 : null;

  const sortedMembers = [...memberMinutes]
    .sort((a, b) => Number(b.minutes) - Number(a.minutes))
    .slice(0, TEAM_LIMIT);

  const memberDisplayName = new Map<string, string>();
  sortedMembers.forEach((member, index) => {
    memberDisplayName.set(
      member.name,
      link.showTeam ? member.name : anonymizeName(index),
    );
  });

  let stages: string[] = [];
  try {
    const parsed: unknown = JSON.parse(projectRow.scope?.stages ?? "[]");
    if (Array.isArray(parsed)) {
      stages = parsed.filter(
        (item): item is string => typeof item === "string",
      );
    }
  } catch {
    stages = [];
  }

  return {
    projectName: projectRow.name,
    projectCode: projectRow.code,
    clientName: projectRow.clientName,
    color: projectRow.color,
    label: link.label,
    periodStart: projectRow.startDate,
    periodEnd: projectRow.endDate,
    currentStage: projectRow.currentStage,
    stages,
    budget: {
      visible: link.showBudget,
      budgetMinutes: link.showBudget ? budgetMinutes : null,
      consumedMinutes: link.showBudget ? consumedMinutes : 0,
      usageRatio:
        link.showBudget && budgetMinutes !== null && budgetMinutes > 0
          ? Math.round((consumedMinutes / budgetMinutes) * 1000) / 1000
          : null,
    },
    totals: {
      consumedMinutes,
      last30DaysMinutes: Number(totals[0]?.last30 ?? 0),
      activeWeeks: weeklySeries.filter((week) => week.minutes > 0).length,
      teamSize: memberMinutes.length,
    },
    weeklySeries,
    team: sortedMembers.map((member, index) => ({
      name: link.showTeam ? member.name : anonymizeName(index),
      minutes: Number(member.minutes),
    })),
    recentActivity: recentEntries.map((entry) => ({
      date: entry.date,
      description: link.showDescriptions ? entry.description : null,
      minutes: entry.duration,
      member:
        memberDisplayName.get(entry.userName) ??
        (link.showTeam ? entry.userName : "Equipe"),
    })),
    generatedAt: new Date().toISOString(),
  };
}

/** Fire-and-forget view counter — analytics must never block the page. */
export function registerPortalView(linkId: string): void {
  db.update(portalLink)
    .set({
      viewCount: sql`${portalLink.viewCount} + 1`,
      lastViewedAt: new Date(),
    })
    .where(eq(portalLink.id, linkId))
    .then(
      () => undefined,
      (error: unknown) => {
        console.error("[portal] view counter failed:", error);
      },
    );
}
