import { eq } from "drizzle-orm";
import {
  canAccessProject,
  canManageProject,
  ensureManagerAssignableUsers,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { project, projectMember } from "@/lib/db/schema";
import { projectSchema } from "@/lib/validations/project.schema";

function safeParseStages(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/projects/[id]
 * Returns full project details inside the actor scope.
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
  const { id } = await params;

  try {
    if (!(await canAccessProject(actor, id))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const found = await db.query.project.findFirst({
      where: eq(project.id, id),
      with: {
        members: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                department: true,
              },
            },
          },
        },
        manager: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        scope: true,
      },
    });

    if (!found) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    // Parse scope stages JSON
    const projectData = found.scope
      ? {
          ...found,
          scope: {
            ...found.scope,
            stages: safeParseStages(found.scope.stages),
          },
        }
      : found;

    return Response.json({ project: projectData });
  } catch (error) {
    console.error("[GET /api/projects/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/projects/[id]
 * Updates a project fully (including status and imageUrl). Restricted to project manager / admin.
 */
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = projectSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const existing = await db.query.project.findFirst({
      where: eq(project.id, id),
    });
    if (!existing) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    if (!(await canManageProject(actor, id))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const data = parsed.data;
    const managerId =
      actor.role === "manager" ? actor.userId : data.managerId || existing.managerId || actor.userId;
    const assigneeIds = [...new Set([managerId, ...data.memberIds])];

    if (!(await ensureManagerAssignableUsers(actor, assigneeIds))) {
      return Response.json(
        { error: "Gerentes só podem atribuir a si mesmos e aos seus liderados." },
        { status: 403 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(project)
        .set({
          name: data.name,
          code: data.code ?? existing.code,
          description: data.description ?? null,
          clientName: data.clientName ?? null,
          color: data.color,
          status: data.status ?? existing.status,
          billable: data.billable,
          budget: data.budget ?? null,
          azureProjectId: data.azureProjectId !== undefined ? data.azureProjectId : existing.azureProjectId,
          imageUrl: data.imageUrl ?? null,
          managerId,
          scopeId: data.scopeId ?? null,
          currentStage: data.currentStage ?? null,
          commercialName: data.commercialName ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
        })
        .where(eq(project.id, id));

      await tx.delete(projectMember).where(eq(projectMember.projectId, id));

      for (const userId of assigneeIds) {
        await tx.insert(projectMember).values({
          id: crypto.randomUUID(),
          projectId: id,
          userId,
        });
      }
    });

    const updatedProject = await db.query.project.findFirst({
      where: eq(project.id, id),
      with: {
        members: {
          with: {
            user: {
              columns: {
                id: true,
                name: true,
                email: true,
                image: true,
                role: true,
                department: true,
              },
            },
          },
        },
        manager: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
            role: true,
          },
        },
        scope: true,
      },
    });

    const projectData =
      updatedProject?.scope
        ? {
            ...updatedProject,
            scope: {
              ...updatedProject.scope,
              stages: safeParseStages(updatedProject.scope.stages),
            },
          }
        : updatedProject;

    return Response.json({ project: projectData });
  } catch (error) {
    console.error("[PUT /api/projects/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]
 * Soft-deletes (archives) a project. Restricted to admin only.
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
  if (actor.role !== "admin") {
    return Response.json(
      { error: "Forbidden — apenas administradores podem arquivar projetos" },
      { status: 403 },
    );
  }

  const { id } = await params;

  try {
    const existing = await db.query.project.findFirst({
      where: eq(project.id, id),
    });
    if (!existing) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    await db
      .update(project)
      .set({ status: "archived" })
      .where(eq(project.id, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
