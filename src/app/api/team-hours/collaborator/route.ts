import { format, startOfISOWeek } from "date-fns";
import { desc, eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, timeEntry, user } from "@/lib/db/schema";
import { buildTeamHoursWhere } from "@/lib/team-hours/scope";
import { parseLocalDate } from "@/lib/utils";
import {
  searchParamsToObject,
  teamHoursCollaboratorQuerySchema,
} from "@/lib/validations/team-hours.schema";
import type { TeamHoursCollaboratorResponse } from "@/types/team-hours";

/**
 * Roughly two years of daily logging for one person. Past this the weekly
 * board stops being a reading tool anyway, so the UI asks for a narrower
 * period instead of shipping the extra rows.
 */
const MAX_COLLABORATOR_ENTRIES = 2000;

/**
 * GET - Every entry of a single collaborator inside the active filters.
 *
 * Feeds the weekly board, the per-project breakdown and the individual PDF.
 * Scoped to one person, so the payload stays small even on "todo período".
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
  const parsed = teamHoursCollaboratorQuerySchema.safeParse(
    searchParamsToObject(searchParams),
  );

  if (!parsed.success) {
    return Response.json(
      { error: "Parâmetros inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    // The scope builder already restricts a manager to their own reports and
    // projects, so an out-of-scope userId simply returns nothing.
    const where = await buildTeamHoursWhere(actor, parsed.data);

    const rows = await db
      .select({
        id: timeEntry.id,
        description: timeEntry.description,
        date: timeEntry.date,
        duration: timeEntry.duration,
        billable: timeEntry.billable,
        azdoSyncStatus: timeEntry.azdoSyncStatus,
        createdAt: timeEntry.createdAt,
        // Every row belongs to the same person, so the avatar would be
        // repeated verbatim up to MAX_COLLABORATOR_ENTRIES times.
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
      .orderBy(desc(timeEntry.date), desc(timeEntry.createdAt))
      .limit(MAX_COLLABORATOR_ENTRIES + 1);

    const truncated = rows.length > MAX_COLLABORATOR_ENTRIES;
    const visibleRows = truncated
      ? rows.slice(0, MAX_COLLABORATOR_ENTRIES)
      : rows;

    const weekSet = new Set<string>();
    for (const row of visibleRows) {
      weekSet.add(
        format(startOfISOWeek(parseLocalDate(row.date)), "yyyy-MM-dd"),
      );
    }

    const payload: TeamHoursCollaboratorResponse = {
      entries: visibleRows.map((entry) => ({
        ...entry,
        user: { ...entry.user, image: null },
        createdAt: entry.createdAt.toISOString(),
      })),
      weeks: Array.from(weekSet).sort((a, b) => b.localeCompare(a)),
      truncated,
    };

    return Response.json(payload);
  } catch (err) {
    console.error("[GET /api/team-hours/collaborator]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
