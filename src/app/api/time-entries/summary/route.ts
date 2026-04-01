import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  isDirectReport,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, timeEntry } from "@/lib/db/schema";

/**
 * GET - Aggregated time summary for reports and calendar.
 *
 * Query params:
 *   from (YYYY-MM-DD), to (YYYY-MM-DD)
 *   groupBy: "day" | "week" | "project"
 *   projectId? (filter)
 *   userId? (manager/admin only — defaults to session user)
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const groupBy = searchParams.get("groupBy") ?? "day";
  const projectId = searchParams.get("projectId");
  const requestedUserId = searchParams.get("userId");

  // Role check for querying other users
  const actor = getActorContext(session.user);
  const role = actor.role;
  const targetUserId =
    requestedUserId && ["manager", "admin"].includes(role)
      ? requestedUserId
      : session.user.id;

  if (
    role === "manager" &&
    requestedUserId &&
    !(await isDirectReport(actor.userId, requestedUserId))
  ) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const conditions = [
      eq(timeEntry.userId, targetUserId),
      isNull(timeEntry.deletedAt),
    ];
    if (from) conditions.push(gte(timeEntry.date, from));
    if (to) conditions.push(lte(timeEntry.date, to));
    if (projectId) conditions.push(eq(timeEntry.projectId, projectId));

    let data: unknown[];

    if (groupBy === "day") {
      data = await db
        .select({
          date: timeEntry.date,
          totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::integer`,
          billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)::integer`,
          entryCount: sql<number>`COUNT(*)::integer`,
        })
        .from(timeEntry)
        .where(and(...conditions))
        .groupBy(timeEntry.date)
        .orderBy(timeEntry.date);
    } else if (groupBy === "project") {
      data = await db
        .select({
          projectId: timeEntry.projectId,
          projectName: project.name,
          projectCode: project.code,
          projectColor: project.color,
          totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::integer`,
          billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)::integer`,
          entryCount: sql<number>`COUNT(*)::integer`,
        })
        .from(timeEntry)
        .innerJoin(project, eq(timeEntry.projectId, project.id))
        .where(and(...conditions))
        .groupBy(timeEntry.projectId, project.name, project.code, project.color)
        .orderBy(sql`SUM(${timeEntry.duration}) DESC`);
    } else {
      // Default: day-level (same as "day")
      data = await db
        .select({
          date: timeEntry.date,
          totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::integer`,
          billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)::integer`,
          entryCount: sql<number>`COUNT(*)::integer`,
        })
        .from(timeEntry)
        .where(and(...conditions))
        .groupBy(timeEntry.date)
        .orderBy(timeEntry.date);
    }

    // Overall totals
    const [totals] = await db
      .select({
        totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::integer`,
        billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)::integer`,
        entryCount: sql<number>`COUNT(*)::integer`,
      })
      .from(timeEntry)
      .where(and(...conditions));

    return Response.json({ data, totals });
  } catch (error) {
    console.error("[GET /api/time-entries/summary]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
