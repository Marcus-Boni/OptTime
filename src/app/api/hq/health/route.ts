import { and, gte, inArray, isNull, sql } from "drizzle-orm";
import {
  getAccessibleProjectIds,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, projectMember, timeEntry } from "@/lib/db/schema";
import { buildProjectForecast } from "@/lib/hq/burndown";
import { buildWeekWindow } from "@/lib/hq/workload";
import { todayInAppTimeZone } from "@/lib/timezone";
import { getWeekPeriod } from "@/lib/utils";
import type {
  HqHealthResponse,
  ProjectHealthSnapshot,
  ProjectWeeklyConsumption,
} from "@/types/hq";

/** Complete weeks of history feeding the burn-down chart and forecast. */
const HISTORY_WEEKS = 8;
/** Radar cares about ongoing work; archived/completed projects are excluded. */
const RADAR_STATUSES = ["open", "active"];

/**
 * GET - Project Health Radar.
 *
 * For every project the actor can see: budget consumption, weekly burn
 * series, predictive exhaustion date vs. planned delivery and a risk level.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const today = todayInAppTimeZone();
    const currentWeek = getWeekPeriod(today);
    const weekWindow = buildWeekWindow(today, HISTORY_WEEKS, 0);
    const windowStart = weekWindow[0]?.start ?? today;

    const accessibleProjectIds = await getAccessibleProjectIds(actor);
    if (accessibleProjectIds !== null && accessibleProjectIds.length === 0) {
      const empty: HqHealthResponse = {
        generatedAt: new Date().toISOString(),
        currentWeek,
        projects: [],
        totals: {
          projects: 0,
          atRisk: 0,
          minutesThisWeek: 0,
          budgetMinutes: 0,
          consumedMinutes: 0,
        },
      };
      return Response.json(empty);
    }

    const projectWhere =
      accessibleProjectIds === null
        ? inArray(project.status, RADAR_STATUSES)
        : and(
            inArray(project.id, accessibleProjectIds),
            inArray(project.status, RADAR_STATUSES),
          );

    const projects = await db.query.project.findMany({
      where: projectWhere,
      columns: {
        id: true,
        name: true,
        code: true,
        color: true,
        clientName: true,
        status: true,
        billable: true,
        budget: true,
        startDate: true,
        endDate: true,
        azureProjectId: true,
      },
    });

    if (projects.length === 0) {
      const empty: HqHealthResponse = {
        generatedAt: new Date().toISOString(),
        currentWeek,
        projects: [],
        totals: {
          projects: 0,
          atRisk: 0,
          minutesThisWeek: 0,
          budgetMinutes: 0,
          consumedMinutes: 0,
        },
      };
      return Response.json(empty);
    }

    const projectIds = projects.map((item) => item.id);

    const [lifetimeTotals, recentDaily, memberCounts] = await Promise.all([
      db
        .select({
          projectId: timeEntry.projectId,
          minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
        })
        .from(timeEntry)
        .where(
          and(
            inArray(timeEntry.projectId, projectIds),
            isNull(timeEntry.deletedAt),
          ),
        )
        .groupBy(timeEntry.projectId),
      db
        .select({
          projectId: timeEntry.projectId,
          date: timeEntry.date,
          minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
        })
        .from(timeEntry)
        .where(
          and(
            inArray(timeEntry.projectId, projectIds),
            gte(timeEntry.date, windowStart),
            isNull(timeEntry.deletedAt),
          ),
        )
        .groupBy(timeEntry.projectId, timeEntry.date),
      db
        .select({
          projectId: projectMember.projectId,
          members: sql<number>`COUNT(*)::int`,
        })
        .from(projectMember)
        .where(inArray(projectMember.projectId, projectIds))
        .groupBy(projectMember.projectId),
    ]);

    const consumedByProject = new Map(
      lifetimeTotals.map((row) => [row.projectId, Number(row.minutes)]),
    );
    const teamSizeByProject = new Map(
      memberCounts.map((row) => [row.projectId, Number(row.members)]),
    );

    // date-level rows → per-project ISO-week buckets
    const weeklyByProject = new Map<string, Map<string, number>>();
    for (const row of recentDaily) {
      const week = getWeekPeriod(row.date);
      const bucket = weeklyByProject.get(row.projectId) ?? new Map();
      bucket.set(week, (bucket.get(week) ?? 0) + Number(row.minutes));
      weeklyByProject.set(row.projectId, bucket);
    }

    const snapshots: ProjectHealthSnapshot[] = projects.map((item) => {
      const weekBuckets = weeklyByProject.get(item.id) ?? new Map();

      const weeklySeries: ProjectWeeklyConsumption[] = weekWindow.map(
        (week) => ({
          week: week.week,
          weekStart: week.start,
          minutes: weekBuckets.get(week.week) ?? 0,
        }),
      );

      const budgetMinutes = item.budget !== null ? item.budget * 60 : null;
      const consumedMinutes = consumedByProject.get(item.id) ?? 0;
      const currentWeekMinutes = weekBuckets.get(currentWeek) ?? 0;

      const forecast = buildProjectForecast({
        budgetMinutes,
        consumedMinutes,
        weeklySeries,
        endDate: item.endDate,
        today,
      });

      return {
        projectId: item.id,
        name: item.name,
        code: item.code,
        color: item.color,
        clientName: item.clientName,
        status: item.status,
        billable: item.billable,
        budgetMinutes,
        consumedMinutes,
        currentWeekMinutes,
        endDate: item.endDate,
        startDate: item.startDate,
        teamSize: teamSizeByProject.get(item.id) ?? 0,
        weeklySeries,
        forecast,
        hasAzureIntegration: Boolean(item.azureProjectId),
      };
    });

    // Risky projects first, then by weekly consumption.
    const riskOrder: Record<string, number> = {
      critical: 0,
      warning: 1,
      healthy: 2,
      no_budget: 3,
    };
    snapshots.sort(
      (a, b) =>
        (riskOrder[a.forecast.risk] ?? 4) - (riskOrder[b.forecast.risk] ?? 4) ||
        b.currentWeekMinutes - a.currentWeekMinutes,
    );

    const payload: HqHealthResponse = {
      generatedAt: new Date().toISOString(),
      currentWeek,
      projects: snapshots,
      totals: {
        projects: snapshots.length,
        atRisk: snapshots.filter(
          (item) =>
            item.forecast.risk === "critical" ||
            item.forecast.risk === "warning",
        ).length,
        minutesThisWeek: snapshots.reduce(
          (sum, item) => sum + item.currentWeekMinutes,
          0,
        ),
        budgetMinutes: snapshots.reduce(
          (sum, item) => sum + (item.budgetMinutes ?? 0),
          0,
        ),
        consumedMinutes: snapshots.reduce(
          (sum, item) => sum + item.consumedMinutes,
          0,
        ),
      },
    };

    return Response.json(payload);
  } catch (error) {
    console.error("[GET /api/hq/health]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
