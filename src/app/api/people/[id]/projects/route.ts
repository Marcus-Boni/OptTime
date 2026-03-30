import {
  canManageProject,
  canManageUser,
  getActiveSession,
  getActorContext,
  getManagedProjectIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, projectMember } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";

/**
 * GET /api/people/[id]/projects
 * Returns all projects with a flag indicating whether the target user is a member.
 * Restricted to admin / manager.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await params;

  try {
    const allowed = await canManageUser(actor, targetUserId);
    if (!allowed) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const managedProjectIds = await getManagedProjectIds(actor);
    const projectWhere =
      managedProjectIds === null
        ? undefined
        : managedProjectIds.length > 0
          ? inArray(project.id, managedProjectIds)
          : inArray(project.id, ["__no_project__"]);

    const [allProjects, memberships] = await Promise.all([
      db.query.project.findMany({
        where: projectWhere,
        columns: {
          id: true,
          name: true,
          color: true,
          source: true,
          clientName: true,
        },
        orderBy: (p, { asc }) => [asc(p.name)],
      }),
      db.query.projectMember.findMany({
        where: eq(projectMember.userId, targetUserId),
        columns: { projectId: true },
      }),
    ]);

    const memberProjectIds = new Set(memberships.map((m) => m.projectId));

    const result = allProjects.map((p) => ({
      ...p,
      isMember: memberProjectIds.has(p.id),
    }));

    return Response.json({ projects: result });
  } catch (error) {
    console.error("[GET /api/people/[id]/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/people/[id]/projects
 * Adds the target user as a member of a project.
 * Body: { projectId: string }
 * Restricted to admin / manager.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const body = await req.json();
  const { projectId } = body as { projectId?: string };

  if (!projectId || typeof projectId !== "string") {
    return Response.json(
      { error: "projectId é obrigatório." },
      { status: 400 },
    );
  }

  try {
    const allowed = await canManageUser(actor, targetUserId);
    if (!allowed || !(await canManageProject(actor, projectId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Ensure project exists
    const found = await db.query.project.findFirst({
      where: eq(project.id, projectId),
      columns: { id: true },
    });
    if (!found) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    // Idempotent — only insert if not already a member
    const existing = await db.query.projectMember.findFirst({
      where: and(
        eq(projectMember.projectId, projectId),
        eq(projectMember.userId, targetUserId),
      ),
      columns: { id: true },
    });

    if (!existing) {
      await db.insert(projectMember).values({
        id: crypto.randomUUID(),
        projectId,
        userId: targetUserId,
      });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/people/[id]/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/people/[id]/projects
 * Removes the target user from a project.
 * Body: { projectId: string }
 * Restricted to admin / manager.
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await params;
  const body = await req.json();
  const { projectId } = body as { projectId?: string };

  if (!projectId || typeof projectId !== "string") {
    return Response.json(
      { error: "projectId é obrigatório." },
      { status: 400 },
    );
  }

  try {
    const allowed = await canManageUser(actor, targetUserId);
    if (!allowed || !(await canManageProject(actor, projectId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    await db
      .delete(projectMember)
      .where(
        and(
          eq(projectMember.projectId, projectId),
          eq(projectMember.userId, targetUserId),
        ),
      );

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[DELETE /api/people/[id]/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
