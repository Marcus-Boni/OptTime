import { and, eq, inArray, like } from "drizzle-orm";
import {
  ensureManagerAssignableUsers,
  getAccessibleProjectIds,
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
 * GET /api/projects
 * - admin -> all projects
 * - manager -> projects que gerencia ou dos quais participa
 * - member -> only projects where the user is a member
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get("status");
  const limitParam = searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : undefined;

  try {
    const actor = getActorContext(session.user);
    const accessibleProjectIds = await getAccessibleProjectIds(actor);

    if (accessibleProjectIds && accessibleProjectIds.length === 0) {
      return Response.json({ projects: [] });
    }

    let whereClause = accessibleProjectIds
      ? inArray(project.id, accessibleProjectIds)
      : undefined;

    if (statusParam) {
      const statusFilter = eq(project.status, statusParam);
      whereClause = whereClause ? and(whereClause, statusFilter) : statusFilter;
    }

    const projects = await db.query.project.findMany({
      where: whereClause,
      with: {
        members: {
          with: {
            user: {
              columns: { id: true, name: true, email: true, image: true },
            },
          },
        },
        manager: {
          columns: { id: true, name: true, email: true, image: true },
        },
        scope: true,
      },
      orderBy: (table, { desc }) => [desc(table.updatedAt)],
      limit,
    });

    // Parse scope stages JSON for each project
    const parsedProjects = projects.map((p) =>
      p.scope
        ? {
            ...p,
            scope: {
              ...p.scope,
              stages: safeParseStages(p.scope.stages),
            },
          }
        : p,
    );

    return Response.json({ projects: parsedProjects });
  } catch (error) {
    console.error("[GET /api/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/projects
 * Creates a new project. Restricted to manager / admin.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = projectSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const data = parsed.data;
    const managerId =
      actor.role === "manager" ? actor.userId : data.managerId || actor.userId;

    const assigneeIds = [...new Set([managerId, ...data.memberIds])];
    if (!(await ensureManagerAssignableUsers(actor, assigneeIds))) {
      return Response.json(
        { error: "Gerentes só podem atribuir a si mesmos e aos seus liderados." },
        { status: 403 },
      );
    }

    let code = data.code;
    if (!code) {
      const base = data.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20);

      const existing = await db.query.project.findMany({
        where: like(project.code, `${base}%`),
        columns: { code: true },
      });

      const existingCodes = new Set(existing.map((existingProject) => existingProject.code));
      code = base;
      let suffix = 1;
      while (existingCodes.has(code)) {
        code = `${base.slice(0, 17)}-${suffix}`;
        suffix += 1;
      }
    }

    const newProject = await db.transaction(async (tx) => {
      const projectId = crypto.randomUUID();
      const [createdProject] = await tx
        .insert(project)
        .values({
          id: projectId,
          name: data.name,
          code,
          description: data.description || null,
          clientName: data.clientName || null,
          color: data.color,
          status: data.status ?? "open",
          billable: data.billable,
          budget: data.budget || null,
          source: "manual",
          azureProjectId: data.azureProjectId || null,
          managerId,
          scopeId: data.scopeId || null,
          currentStage: data.currentStage || null,
          commercialName: data.commercialName || null,
          startDate: data.startDate || null,
          endDate: data.endDate || null,
        })
        .returning();

      for (const userId of assigneeIds) {
        await tx.insert(projectMember).values({
          id: crypto.randomUUID(),
          projectId,
          userId,
        });
      }

      return createdProject;
    });

    return Response.json({ project: newProject }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
