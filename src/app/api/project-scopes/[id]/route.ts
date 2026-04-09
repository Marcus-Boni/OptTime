import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/db/schema";
import { projectScopeSchema } from "@/lib/validations/project-scope.schema";

function safeParseStages(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * GET /api/project-scopes/[id]
 * Returns a single scope. Any authenticated user.
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const found = await db.query.projectScope.findFirst({
      where: eq(projectScope.id, id),
    });

    if (!found) {
      return Response.json({ error: "Escopo não encontrado." }, { status: 404 });
    }

    return Response.json({ scope: { ...found, stages: safeParseStages(found.stages) } });
  } catch (err) {
    console.error("[GET /api/project-scopes/[id]]:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/project-scopes/[id]
 * Updates a scope name, stages, or defaultStatus. Admin only.
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
  if (actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  const parsed = projectScopeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const existing = await db.query.projectScope.findFirst({
      where: eq(projectScope.id, id),
    });
    if (!existing) {
      return Response.json({ error: "Escopo não encontrado." }, { status: 404 });
    }

    const { name, stages, defaultStatus } = parsed.data;
    const [updated] = await db
      .update(projectScope)
      .set({ name, stages: JSON.stringify(stages), defaultStatus })
      .where(eq(projectScope.id, id))
      .returning();

    return Response.json({ scope: { ...updated, stages: safeParseStages(updated.stages) } });
  } catch (err) {
    console.error("[PUT /api/project-scopes/[id]]:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/project-scopes/[id]
 * Deletes a scope. Admin only. Projects with this scope will have scopeId set to NULL (ON DELETE SET NULL).
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
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const existing = await db.query.projectScope.findFirst({
      where: eq(projectScope.id, id),
    });
    if (!existing) {
      return Response.json({ error: "Escopo não encontrado." }, { status: 404 });
    }

    await db.delete(projectScope).where(eq(projectScope.id, id));
    return Response.json({ success: true });
  } catch (err) {
    console.error("[DELETE /api/project-scopes/[id]]:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
