import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { project, projectMember } from "@/lib/db/schema";
import { projectSchema } from "@/lib/validations/project.schema";
import { eq, inArray, like } from "drizzle-orm";

/**
 * GET /api/projects
 * - admin / manager → all projects
 * - member → only projects where the user is a member
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const isPrivileged =
      session.user.role === "manager" || session.user.role === "admin";

    let projects;

    if (isPrivileged) {
      projects = await db.query.project.findMany({
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
        },
        orderBy: (p, { desc }) => [desc(p.updatedAt)],
      });
    } else {
      // Find project IDs the user is a member of
      const memberships = await db.query.projectMember.findMany({
        where: eq(projectMember.userId, session.user.id),
        columns: { projectId: true },
      });

      const projectIds = memberships.map((m) => m.projectId);
      if (projectIds.length === 0) {
        return Response.json({ projects: [] });
      }

      projects = await db.query.project.findMany({
        where: inArray(project.id, projectIds),
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
        },
        orderBy: (p, { desc }) => [desc(p.updatedAt)],
      });
    }

    return Response.json({ projects });
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
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (session.user.role !== "manager" && session.user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = projectSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const projectId = crypto.randomUUID();
    const data = parsed.data;

    // Auto-generate code from name if not provided
    let code = data.code;
    if (!code) {
      const base = data.name
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 20);

      // Check for duplicates and append suffix if needed
      const existing = await db.query.project.findMany({
        where: like(project.code, `${base}%`),
        columns: { code: true },
      });
      const existingCodes = new Set(existing.map((p) => p.code));
      code = base;
      let suffix = 1;
      while (existingCodes.has(code)) {
        code = `${base.slice(0, 17)}-${suffix}`;
        suffix++;
      }
    }

    const managerId = data.managerId || session.user.id;

    const [newProject] = await db
      .insert(project)
      .values({
        id: projectId,
        name: data.name,
        code,
        description: data.description || null,
        clientName: data.clientName || null,
        color: data.color,
        status: "active",
        billable: data.billable,
        budget: data.budget || null,
        source: "manual",
        azureProjectId: data.azureProjectId || null,
        managerId,
      })
      .returning();

    // Add members (always include the manager/creator)
    const memberSet = new Set([managerId, ...data.memberIds]);
    for (const userId of memberSet) {
      await db.insert(projectMember).values({
        id: crypto.randomUUID(),
        projectId,
        userId,
      });
    }

    return Response.json({ project: newProject }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/projects]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
