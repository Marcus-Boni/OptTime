import { and, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getDirectReportIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, timeEntry, user } from "@/lib/db/schema";

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  const role = actor.role;
  if (role !== "admin" && role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const projectId = searchParams.get("projectId");
  const userId = searchParams.get("userId");

  try {
    const filters = [];

    // Ignorar "deletedAt" sempre para não trazer deletados
    filters.push(sql`${timeEntry.deletedAt} IS NULL`);

    if (from) {
      filters.push(gte(timeEntry.date, from));
    }
    if (to) {
      filters.push(lte(timeEntry.date, to));
    }
    if (projectId) {
      filters.push(eq(timeEntry.projectId, projectId));
    }
    if (userId) {
      filters.push(eq(timeEntry.userId, userId));
    }

    if (role === "manager") {
      const directReportIds = await getDirectReportIds(actor.userId);
      if (directReportIds.length === 0) {
        return Response.json({ entries: [] });
      }

      if (userId && !directReportIds.includes(userId)) {
        return Response.json({ error: "Forbidden" }, { status: 403 });
      }

      filters.push(inArray(timeEntry.userId, directReportIds));
    }

    const whereCondition = filters.length > 0 ? and(...filters) : undefined;

    const entries = await db
      .select({
        id: timeEntry.id,
        description: timeEntry.description,
        date: timeEntry.date,
        duration: timeEntry.duration,
        billable: timeEntry.billable,
        azdoSyncStatus: timeEntry.azdoSyncStatus,
        createdAt: timeEntry.createdAt,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
        project: {
          id: project.id,
          name: project.name,
          color: project.color,
          clientName: project.clientName,
        },
      })
      .from(timeEntry)
      .innerJoin(user, eq(timeEntry.userId, user.id))
      .innerJoin(project, eq(timeEntry.projectId, project.id))
      .where(whereCondition)
      .orderBy(desc(timeEntry.date), desc(timeEntry.createdAt));

    return Response.json({ entries });
  } catch (err) {
    console.error("[GET /api/team-hours]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
