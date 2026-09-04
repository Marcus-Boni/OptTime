import { and, eq, inArray } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getDirectReportIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import {
  appRelease,
  invitation,
  project,
  suggestion,
  timesheet,
  user,
} from "@/lib/db/schema";

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const directReportIds =
      actor.role === "manager" ? await getDirectReportIds(actor.userId) : [];

    const peopleInScope = await db.query.user.findMany({
      columns: { id: true },
      where:
        actor.role === "admin"
          ? eq(user.isActive, true)
          : and(eq(user.managerId, actor.userId), eq(user.isActive, true)),
    });
    const activeUserIds = peopleInScope.map((u) => u.id);

    const [
      pendingInvitations,
      pendingApprovals,
      projectsInScope,
      schedule,
      publishedReleases,
      draftReleases,
      pendingSuggestions,
      syncedProjects,
    ] = await Promise.all([
      db.query.invitation.findMany({
        columns: { id: true },
        where:
          actor.role === "admin"
            ? eq(invitation.status, "pending")
            : and(
                eq(invitation.status, "pending"),
                eq(invitation.invitedById, actor.userId),
              ),
      }),
      activeUserIds.length === 0
        ? Promise.resolve([])
        : db.query.timesheet.findMany({
            columns: { id: true },
            where: and(
              eq(timesheet.status, "submitted"),
              inArray(timesheet.userId, activeUserIds),
            ),
          }),
      db.query.project.findMany({
        columns: { id: true },
        where:
          actor.role === "admin"
            ? eq(project.status, "active")
            : and(
                eq(project.status, "active"),
                eq(project.managerId, actor.userId),
              ),
      }),
      db.query.reminderSchedule.findFirst({
        columns: {
          condition: true,
          daysOfWeek: true,
          enabled: true,
          hour: true,
          minute: true,
          targetScope: true,
          timezone: true,
        },
      }),
      db.query.appRelease.findMany({
        columns: { id: true },
        where: eq(appRelease.status, "published"),
      }),
      actor.role === "admin"
        ? db.query.appRelease.findMany({
            columns: { id: true },
            where: eq(appRelease.status, "draft"),
          })
        : Promise.resolve([]),
      actor.role === "admin"
        ? db.query.suggestion.findMany({
            columns: { id: true },
            where: eq(suggestion.status, "pending"),
          })
        : Promise.resolve([]),
      db.query.project.findMany({
        columns: { id: true },
        where:
          actor.role === "admin"
            ? eq(project.source, "azure-devops")
            : and(
                eq(project.source, "azure-devops"),
                eq(project.managerId, actor.userId),
              ),
      }),
    ]);

    return Response.json({
      scope: actor.role === "admin" ? "organization" : "team",
      directReports: directReportIds.length,
      draftReleases: draftReleases.length,
      pendingApprovals: pendingApprovals.length,
      pendingInvitations: pendingInvitations.length,
      pendingSuggestions: pendingSuggestions.length,
      projectsInScope: projectsInScope.length,
      publishedReleases: publishedReleases.length,
      reminderSchedule: schedule,
      syncedProjects: syncedProjects.length,
      teamMembers: peopleInScope.length,
    });
  } catch (error) {
    console.error("[GET /api/settings/overview]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
