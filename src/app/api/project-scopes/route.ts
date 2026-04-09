import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { projectScope } from "@/lib/db/schema";
import { projectScopeSchema } from "@/lib/validations/project-scope.schema";

/**
 * GET /api/project-scopes
 * Returns all project scopes. Any authenticated user can list them.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const scopes = await db.query.projectScope.findMany({
      orderBy: (table, { asc }) => [asc(table.name)],
    });

    // Parse stages JSON for each scope
    const parsed = scopes.map((s) => ({
      ...s,
      stages: safeParseStages(s.stages),
    }));

    return Response.json({ scopes: parsed });
  } catch (err) {
    console.error("[GET /api/project-scopes]:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/project-scopes
 * Creates a new scope. Admin only.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = projectScopeSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { name, stages, defaultStatus } = parsed.data;
    const [created] = await db
      .insert(projectScope)
      .values({
        id: crypto.randomUUID(),
        name,
        stages: JSON.stringify(stages),
        defaultStatus,
      })
      .returning();

    return Response.json(
      { scope: { ...created, stages: safeParseStages(created.stages) } },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/project-scopes]:", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

function safeParseStages(raw: string): string[] {
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as string[]) : [];
  } catch {
    return [];
  }
}
