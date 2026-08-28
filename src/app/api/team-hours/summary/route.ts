import { asc, eq, sql } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, timeEntry, user } from "@/lib/db/schema";
import { buildTeamHoursWhere } from "@/lib/team-hours/scope";
import {
  searchParamsToObject,
  teamHoursSummaryQuerySchema,
} from "@/lib/validations/team-hours.schema";
import type {
  TeamHoursCollaborator,
  TeamHoursSummaryResponse,
} from "@/types/team-hours";

/**
 * GET - Aggregated team hours for the KPI strip and the collaborator list.
 *
 * Everything is rolled up in Postgres: the payload stays a few kilobytes no
 * matter how many entries the period holds, which is what keeps the screen
 * responsive on wide date ranges.
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
  const parsed = teamHoursSummaryQuerySchema.safeParse(
    searchParamsToObject(searchParams),
  );

  if (!parsed.success) {
    return Response.json(
      { error: "Parâmetros inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const filters = parsed.data;

    // Filter options ignore the person/project/search selection so the
    // comboboxes never collapse into the option the user just picked.
    const [where, optionsWhere] = await Promise.all([
      buildTeamHoursWhere(actor, filters),
      buildTeamHoursWhere(actor, { from: filters.from, to: filters.to }),
    ]);

    const [rows, [totals], userOptions, projectOptions] = await Promise.all([
      db
        .select({
          userId: user.id,
          userName: user.name,
          userEmail: user.email,
          totalMinutes: sql<number>`coalesce(sum(${timeEntry.duration}), 0)::int`,
          billableMinutes: sql<number>`coalesce(sum(${timeEntry.duration}) filter (where ${timeEntry.billable}), 0)::int`,
          entryCount: sql<number>`count(*)::int`,
          projectsCount: sql<number>`count(distinct ${timeEntry.projectId})::int`,
          latestDate: sql<string | null>`max(${timeEntry.date})`,
          latestProjectName: sql<
            string | null
          >`(array_agg(${project.name} order by ${timeEntry.date} desc, ${timeEntry.createdAt} desc))[1]`,
        })
        .from(timeEntry)
        .innerJoin(user, eq(timeEntry.userId, user.id))
        .innerJoin(project, eq(timeEntry.projectId, project.id))
        .where(where)
        .groupBy(user.id, user.name, user.email)
        .orderBy(sql`sum(${timeEntry.duration}) desc`),

      db
        .select({
          totalMinutes: sql<number>`coalesce(sum(${timeEntry.duration}), 0)::int`,
          billableMinutes: sql<number>`coalesce(sum(${timeEntry.duration}) filter (where ${timeEntry.billable}), 0)::int`,
          entryCount: sql<number>`count(*)::int`,
          activePeople: sql<number>`count(distinct ${timeEntry.userId})::int`,
          activeProjects: sql<number>`count(distinct ${timeEntry.projectId})::int`,
        })
        .from(timeEntry)
        .innerJoin(user, eq(timeEntry.userId, user.id))
        .innerJoin(project, eq(timeEntry.projectId, project.id))
        .where(where),

      db
        .selectDistinct({
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        })
        .from(timeEntry)
        .innerJoin(user, eq(timeEntry.userId, user.id))
        .innerJoin(project, eq(timeEntry.projectId, project.id))
        .where(optionsWhere)
        .orderBy(asc(user.name)),

      db
        .selectDistinct({
          id: project.id,
          name: project.name,
          color: project.color,
          clientName: project.clientName,
        })
        .from(timeEntry)
        .innerJoin(user, eq(timeEntry.userId, user.id))
        .innerJoin(project, eq(timeEntry.projectId, project.id))
        .where(optionsWhere)
        .orderBy(asc(project.name)),
    ]);

    const totalMinutes = totals?.totalMinutes ?? 0;
    const billableMinutes = totals?.billableMinutes ?? 0;

    const collaborators = rows.map<TeamHoursCollaborator>((row) => ({
      // Avatars are stored inline and can reach tens of kilobytes each, so
      // they ride along exactly once — in `filterOptions.users`, the superset
      // of everyone selectable. The client joins the two by id.
      user: {
        id: row.userId,
        name: row.userName,
        email: row.userEmail,
        image: null,
      },
      totalMinutes: row.totalMinutes,
      billableMinutes: row.billableMinutes,
      billableRate: percentage(row.billableMinutes, row.totalMinutes),
      entryCount: row.entryCount,
      projectsCount: row.projectsCount,
      latestDate: row.latestDate,
      latestProjectName: row.latestProjectName,
      sharePercent: percentage(row.totalMinutes, totalMinutes),
    }));

    const top = collaborators[0] ?? null;

    const payload: TeamHoursSummaryResponse = {
      totals: {
        totalMinutes,
        billableMinutes,
        billableRate: percentage(billableMinutes, totalMinutes),
        entryCount: totals?.entryCount ?? 0,
        activePeople: totals?.activePeople ?? 0,
        activeProjects: totals?.activeProjects ?? 0,
        topContributorName: top?.user.name ?? null,
        topContributorMinutes: top?.totalMinutes ?? 0,
      },
      collaborators,
      filterOptions: {
        users: userOptions,
        projects: projectOptions,
      },
    };

    return Response.json(payload);
  } catch (err) {
    console.error("[GET /api/team-hours/summary]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function percentage(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
