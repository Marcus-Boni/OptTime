import { eq } from "drizzle-orm";
import {
  canManageProject,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { allocation } from "@/lib/db/schema";
import { updateAllocationSchema } from "@/lib/validations/hq.schema";

type RouteContext = { params: Promise<{ id: string }> };

async function loadAuthorizedAllocation(
  req: Request,
  context: RouteContext,
): Promise<
  | { response: Response }
  | { allocationRow: typeof allocation.$inferSelect; response?: undefined }
> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return {
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return {
      response: Response.json({ error: "Sem permissão." }, { status: 403 }),
    };
  }

  const { id } = await context.params;
  const allocationRow = await db.query.allocation.findFirst({
    where: eq(allocation.id, id),
  });

  if (!allocationRow) {
    return {
      response: Response.json(
        { error: "Alocação não encontrada." },
        { status: 404 },
      ),
    };
  }

  if (!(await canManageProject(actor, allocationRow.projectId))) {
    return {
      response: Response.json(
        { error: "Você só pode alterar alocações de projetos que gerencia." },
        { status: 403 },
      ),
    };
  }

  return { allocationRow };
}

/** PATCH - Adjust planned minutes or the note of an allocation. */
export async function PATCH(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const result = await loadAuthorizedAllocation(req, context);
    if (result.response) return result.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const parsed = updateAllocationSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Payload inválido", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const [updated] = await db
      .update(allocation)
      .set({
        ...(parsed.data.plannedMinutes !== undefined
          ? { plannedMinutes: parsed.data.plannedMinutes }
          : {}),
        ...(parsed.data.note !== undefined ? { note: parsed.data.note } : {}),
        updatedAt: new Date(),
      })
      .where(eq(allocation.id, result.allocationRow.id))
      .returning();

    return Response.json({ allocation: updated });
  } catch (error) {
    console.error("[PATCH /api/hq/allocations/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** DELETE - Remove a planned allocation. */
export async function DELETE(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const result = await loadAuthorizedAllocation(req, context);
    if (result.response) return result.response;

    await db
      .delete(allocation)
      .where(eq(allocation.id, result.allocationRow.id));

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("[DELETE /api/hq/allocations/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
