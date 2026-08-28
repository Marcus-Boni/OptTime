import { eq } from "drizzle-orm";
import {
  canManageProject,
  ensureManagerAssignableUsers,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { allocation, project, user } from "@/lib/db/schema";
import { todayInAppTimeZone } from "@/lib/timezone";
import { getWeekPeriod } from "@/lib/utils";
import { upsertAllocationSchema } from "@/lib/validations/hq.schema";

/**
 * POST - Create or update a planned allocation (user × project × ISO week).
 *
 * Upsert semantics: dropping the same project on the same cell twice simply
 * updates the planned minutes. Past weeks are immutable — planning backwards
 * would silently rewrite history the matrix already reported.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = upsertAllocationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { userId, projectId, week, plannedMinutes, note } = parsed.data;

    const currentWeek = getWeekPeriod(todayInAppTimeZone());
    if (week < currentWeek) {
      return Response.json(
        { error: "Não é possível planejar alocações em semanas passadas." },
        { status: 400 },
      );
    }

    const [canAssignUser, canPlanProject, targetUser, targetProject] =
      await Promise.all([
        ensureManagerAssignableUsers(actor, [userId]),
        canManageProject(actor, projectId),
        db.query.user.findFirst({
          where: eq(user.id, userId),
          columns: { id: true, isActive: true },
        }),
        db.query.project.findFirst({
          where: eq(project.id, projectId),
          columns: { id: true, status: true },
        }),
      ]);

    if (!targetUser || !targetUser.isActive) {
      return Response.json(
        { error: "Colaborador não encontrado ou inativo." },
        { status: 404 },
      );
    }

    if (!targetProject) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    if (!canAssignUser) {
      return Response.json(
        { error: "Você só pode alocar pessoas do seu time." },
        { status: 403 },
      );
    }

    if (!canPlanProject) {
      return Response.json(
        { error: "Você só pode planejar projetos que gerencia." },
        { status: 403 },
      );
    }

    const [saved] = await db
      .insert(allocation)
      .values({
        id: crypto.randomUUID(),
        userId,
        projectId,
        week,
        plannedMinutes,
        note: note ?? null,
        createdById: session.user.id,
      })
      .onConflictDoUpdate({
        target: [allocation.userId, allocation.projectId, allocation.week],
        set: {
          plannedMinutes,
          note: note ?? null,
          updatedAt: new Date(),
        },
      })
      .returning();

    return Response.json({ allocation: saved }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/hq/allocations]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
