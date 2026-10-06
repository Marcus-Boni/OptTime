import { count, eq } from "drizzle-orm";
import {
  canAccessProject,
  canManageProject,
  ensureManagerAssignableUsers,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import {
  activeTimer,
  allocation,
  portalLink,
  project,
  projectMember,
  timeEntry,
  user,
} from "@/lib/db/schema";
import {
  findLiveAzureLinkHolder,
  liveAzureLinkConflict,
  uniqueViolationResponse,
} from "@/lib/projects/azure-link";
import { isLiveProjectStatus } from "@/lib/projects/phases";
import { projectSchema } from "@/lib/validations/project.schema";

function safeParseStages(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

async function isProjectLeaderRole(userId: string): Promise<boolean> {
  const candidate = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { role: true, isActive: true },
  });
  return (
    candidate?.isActive === true &&
    (candidate.role === "admin" || candidate.role === "manager")
  );
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

    const [entryCount] = await db
      .select({ count: count() })
      .from(timeEntry)
      .where(eq(timeEntry.projectId, id));

    const timeEntriesCount = entryCount ? Number(entryCount.count) : 0;

    // Parse scope stages JSON
    const projectData = found.scope
      ? {
          ...found,
          scope: {
            ...found.scope,
            stages: safeParseStages(found.scope.stages),
          },
          timeEntriesCount,
        }
      : {
          ...found,
          timeEntriesCount,
        };

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
      actor.role === "manager"
        ? actor.userId
        : data.managerId || existing.managerId || actor.userId;

    const projectStatus = data.status ?? existing.status;
    const isManagerChanged = managerId !== existing.managerId;

    if (
      projectStatus !== "archived" &&
      isManagerChanged &&
      !(await isProjectLeaderRole(managerId))
    ) {
      return Response.json(
        { error: "O lider do projeto deve ser um admin ou gerente ativo." },
        { status: 400 },
      );
    }
    const nextAzureProjectId =
      data.azureProjectId !== undefined
        ? data.azureProjectId
        : existing.azureProjectId;
    if (isLiveProjectStatus(projectStatus)) {
      const holder = await findLiveAzureLinkHolder(nextAzureProjectId, id);
      if (holder) return liveAzureLinkConflict(holder.name);
    }

    const assigneeIds = [...new Set([managerId, ...data.memberIds])];

    if (!(await ensureManagerAssignableUsers(actor, assigneeIds))) {
      return Response.json(
        {
          error: "Gerentes só podem atribuir a si mesmos e aos seus liderados.",
        },
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
          azureProjectId: nextAzureProjectId,
          imageUrl: data.imageUrl ?? null,
          managerId,
          scopeId: data.scopeId ?? null,
          currentStage: data.currentStage ?? null,
          commercialName: data.commercialName ?? null,
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          integrationKey:
            data.integrationKey !== undefined
              ? data.integrationKey
              : existing.integrationKey,
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

    const projectData = updatedProject?.scope
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
    const conflict = uniqueViolationResponse(error);
    if (conflict) return conflict;

    console.error("[PUT /api/projects/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/projects/[id]
 * Permanently deletes a project. Restricted to admin only.
 * Blocked if the project has registered time entries.
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
      { error: "Apenas administradores podem excluir projetos." },
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

    const [entryCount] = await db
      .select({ count: count() })
      .from(timeEntry)
      .where(eq(timeEntry.projectId, id));

    const totalHoursCount = entryCount ? Number(entryCount.count) : 0;
    if (totalHoursCount > 0) {
      return Response.json(
        {
          error: `Não é possível excluir este projeto porque existem ${totalHoursCount} registro(s) de tempo associados a ele. Para preservar a integridade dos dados e o histórico financeiro, arquive o projeto ao invés de excluí-lo.`,
          code: "PROJECT_HAS_TIME_ENTRIES",
          timeEntriesCount: totalHoursCount,
        },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      await tx.delete(activeTimer).where(eq(activeTimer.projectId, id));
      await tx.delete(allocation).where(eq(allocation.projectId, id));
      await tx.delete(portalLink).where(eq(portalLink.projectId, id));
      await tx.delete(projectMember).where(eq(projectMember.projectId, id));
      await tx.delete(project).where(eq(project.id, id));
    });

    return Response.json({
      success: true,
      message: "Projeto excluído com sucesso.",
    });
  } catch (error) {
    console.error("[DELETE /api/projects/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
