import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { project, projectMember, timeEntry } from "@/lib/db/schema";
import { createTimeEntrySchema } from "@/lib/validations/time-entry.schema";

/**
 * GET - List time entries for the current user.
 * Query params: from, to (YYYY-MM-DD), projectId, status
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const projectId = searchParams.get("projectId");

  try {
    const conditions = [
      eq(timeEntry.userId, session.user.id),
      isNull(timeEntry.deletedAt),
    ];

    if (from) conditions.push(gte(timeEntry.date, from));
    if (to) conditions.push(lte(timeEntry.date, to));
    if (projectId) conditions.push(eq(timeEntry.projectId, projectId));

    const entries = await db.query.timeEntry.findMany({
      where: and(...conditions),
      with: {
        project: {
          columns: {
            id: true,
            name: true,
            code: true,
            color: true,
            azureProjectUrl: true,
          },
        },
        timesheet: {
          columns: {
            status: true,
          },
        },
      },
      orderBy: [desc(timeEntry.date), desc(timeEntry.createdAt)],
    });

    return Response.json({ entries });
  } catch (error) {
    console.error("[GET /api/time-entries]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST - Create a new time entry.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = createTimeEntrySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Verify user has access to the project
    const proj = await db.query.project.findFirst({
      where: eq(project.id, data.projectId),
      columns: { id: true, managerId: true },
    });

    if (!proj) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    // Check membership if not manager/admin
    const userRole = session.user.role as string;
    if (userRole === "member") {
      const membership = await db.query.projectMember.findFirst({
        where: and(
          eq(projectMember.projectId, data.projectId),
          eq(projectMember.userId, session.user.id),
        ),
      });
      if (!membership) {
        return Response.json(
          { error: "Você não é membro deste projeto." },
          { status: 403 },
        );
      }
    }

    const id = crypto.randomUUID();
    const [entry] = await db
      .insert(timeEntry)
      .values({
        id,
        userId: session.user.id,
        projectId: data.projectId,
        description: data.description,
        date: data.date,
        duration: data.duration,
        billable: data.billable,
        azureWorkItemId: data.azureWorkItemId,
        azureWorkItemTitle: data.azureWorkItemTitle,
        startTime: data.startTime ? new Date(data.startTime) : null,
        endTime: data.endTime ? new Date(data.endTime) : null,
        azdoSyncStatus: data.azureWorkItemId ? "pending" : "none",
      })
      .returning();

    triggerCompletedWorkSync(session.user.id, [entry.azureWorkItemId]);

    return Response.json({ entry }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/time-entries]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
