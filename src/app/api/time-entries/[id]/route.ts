import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { timeEntry } from "@/lib/db/schema";
import { updateTimeEntrySchema } from "@/lib/validations/time-entry.schema";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET - Get a single time entry by ID.
 */
export async function GET(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const entry = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, id),
        eq(timeEntry.userId, session.user.id),
        isNull(timeEntry.deletedAt),
      ),
      with: {
        project: {
          columns: { id: true, name: true, code: true, color: true },
        },
      },
    });

    if (!entry) {
      return Response.json(
        { error: "Entrada não encontrada." },
        { status: 404 },
      );
    }

    return Response.json({ entry });
  } catch (error) {
    console.error("[GET /api/time-entries/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH - Update a time entry. Only draft entries can be edited.
 */
export async function PATCH(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const existing = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, id),
        eq(timeEntry.userId, session.user.id),
        isNull(timeEntry.deletedAt),
      ),
    });

    if (!existing) {
      return Response.json(
        { error: "Entrada não encontrada." },
        { status: 404 },
      );
    }

    // Removed draft status check since status field is removed

    const body = await req.json();
    const parsed = updateTimeEntrySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const workItemChanged =
      data.azureWorkItemId !== undefined &&
      data.azureWorkItemId !== existing.azureWorkItemId;
    const durationChanged =
      data.duration !== undefined && data.duration !== existing.duration;
    const shouldSyncCompletedWork = workItemChanged || durationChanged;
    const nextAzureWorkItemId =
      data.azureWorkItemId !== undefined
        ? data.azureWorkItemId
        : existing.azureWorkItemId;
    const nextAzdoSyncStatus = nextAzureWorkItemId
      ? shouldSyncCompletedWork
        ? "pending"
        : existing.azdoSyncStatus
      : "none";

    const [updated] = await db
      .update(timeEntry)
      .set({
        ...data,
        azdoSyncStatus: nextAzdoSyncStatus,
      })
      .where(eq(timeEntry.id, id))
      .returning();

    if (shouldSyncCompletedWork) {
      triggerCompletedWorkSync(session.user.id, [
        existing.azureWorkItemId,
        updated.azureWorkItemId,
      ]);
    }

    return Response.json({ entry: updated });
  } catch (error) {
    console.error("[PATCH /api/time-entries/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE - Soft-delete a time entry. Only draft entries can be deleted.
 */
export async function DELETE(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const existing = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, id),
        eq(timeEntry.userId, session.user.id),
        isNull(timeEntry.deletedAt),
      ),
    });

    if (!existing) {
      return Response.json(
        { error: "Entrada não encontrada." },
        { status: 404 },
      );
    }

    // Removed draft status check since status field is removed

    await db
      .update(timeEntry)
      .set({ deletedAt: new Date() })
      .where(eq(timeEntry.id, id));

    triggerCompletedWorkSync(session.user.id, [existing.azureWorkItemId]);

    return Response.json({ success: true });
  } catch (error) {
    console.error("[DELETE /api/time-entries/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
