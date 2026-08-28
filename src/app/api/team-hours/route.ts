import { asc, desc, eq, sql } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, timeEntry, user } from "@/lib/db/schema";
import { buildTeamHoursWhere } from "@/lib/team-hours/scope";
import {
  searchParamsToObject,
  teamHoursEntriesQuerySchema,
} from "@/lib/validations/team-hours.schema";
import type { TeamHoursEntriesResponse } from "@/types/team-hours";

/**
 * GET - Paginated team time entries for the detailed table and PDF exports.
 *
 * Search, sort and pagination all run in Postgres so the browser only ever
 * holds one page of rows.
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

  const { searchParams } = new URL(req.url);
  const parsed = teamHoursEntriesQuerySchema.safeParse(
    searchParamsToObject(searchParams),
  );

  if (!parsed.success) {
    return Response.json(
      { error: "Parâmetros inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { page, pageSize, sort, ...filters } = parsed.data;
    const where = await buildTeamHoursWhere(actor, filters);

    const orderBy =
      sort === "oldest"
        ? [asc(timeEntry.date), asc(timeEntry.createdAt)]
        : sort === "longest"
          ? [desc(timeEntry.duration), desc(timeEntry.date)]
          : [desc(timeEntry.date), desc(timeEntry.createdAt)];

    const [entries, [totalRow]] = await Promise.all([
      db
        .select({
          id: timeEntry.id,
          description: timeEntry.description,
          date: timeEntry.date,
          duration: timeEntry.duration,
          billable: timeEntry.billable,
          azdoSyncStatus: timeEntry.azdoSyncStatus,
          createdAt: timeEntry.createdAt,
          // `image` is deliberately absent: avatars are stored inline and
          // repeating one per row is what made this endpoint slow. The client
          // resolves them once from the summary payload.
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
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
        .where(where)
        .orderBy(...orderBy)
        .limit(pageSize)
        .offset(page * pageSize),

      db
        .select({ value: sql<number>`count(*)::int` })
        .from(timeEntry)
        .innerJoin(user, eq(timeEntry.userId, user.id))
        .innerJoin(project, eq(timeEntry.projectId, project.id))
        .where(where),
    ]);

    const payload: TeamHoursEntriesResponse = {
      entries: entries.map((entry) => ({
        ...entry,
        user: { ...entry.user, image: null },
        createdAt: entry.createdAt.toISOString(),
      })),
      total: totalRow?.value ?? 0,
      page,
      pageSize,
    };

    return Response.json(payload);
  } catch (err) {
    console.error("[GET /api/team-hours]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
