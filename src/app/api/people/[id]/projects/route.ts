import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { project, projectMember } from "@/lib/db/schema";
import { and, eq } from "drizzle-orm";

/**
 * GET /api/people/[id]/projects
 * Returns all projects with a flag indicating whether the target user is a member.
 * Restricted to admin / manager.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin" && session.user.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: targetUserId } = await params;

  try {
    const [allProjects, memberships] = await Promise.all([
      db.query.project.findMany({
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
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin" && session.user.role !== "manager") {
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
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "admin" && session.user.role !== "manager") {
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
