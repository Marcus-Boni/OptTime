import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import {
  activeTimer,
  project,
  projectMember,
  timeEntry,
} from "@/lib/db/schema";
import { startTimerSchema } from "@/lib/validations/time-entry.schema";

/**
 * GET - Get the current user's active timer (if any).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const timer = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, session.user.id),
      with: {
        project: {
          columns: { id: true, name: true, code: true, color: true },
        },
      },
    });

    return Response.json({ timer: timer ?? null });
  } catch (error) {
    console.error("[GET /api/timer]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST - Start a new timer. Stops existing timer if any.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const parsed = startTimerSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;

    // Verify project access
    const proj = await db.query.project.findFirst({
      where: eq(project.id, data.projectId),
      columns: { id: true },
    });

    if (!proj) {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

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

    // Stop any existing timer first (convert to time entry)
    const existingTimer = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, session.user.id),
    });

    if (existingTimer) {
      await stopTimerAndSave(session.user.id, existingTimer);
    }

    const id = crypto.randomUUID();
    const [timer] = await db
      .insert(activeTimer)
      .values({
        id,
        userId: session.user.id,
        projectId: data.projectId,
        description: data.description,
        billable: data.billable,
        azureWorkItemId: data.azureWorkItemId,
        azureWorkItemTitle: data.azureWorkItemTitle,
        startedAt: new Date(),
      })
      .returning();

    return Response.json({ timer }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/timer]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH - Update a running timer (pause, resume, update description).
 * Body: { action: "pause" | "resume" | "update", description?, billable? }
 */
export async function PATCH(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, session.user.id),
    });

    if (!existing) {
      return Response.json({ error: "Nenhum timer ativo." }, { status: 404 });
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "pause") {
      if (existing.pausedAt) {
        return Response.json(
          { error: "Timer já está pausado." },
          { status: 400 },
        );
      }

      const now = new Date();
      const elapsed = now.getTime() - existing.startedAt.getTime();
      const accumulated = existing.accumulatedMs + elapsed;

      const [updated] = await db
        .update(activeTimer)
        // NOTE: startedAt is intentionally NOT overwritten here.
        // Overwriting it would corrupt the elapsed-time calculation on the next resume/poll.
        .set({ pausedAt: now, accumulatedMs: accumulated })
        .where(eq(activeTimer.id, existing.id))
        .returning();

      return Response.json({ timer: updated });
    }

    if (action === "resume") {
      if (!existing.pausedAt) {
        return Response.json(
          { error: "Timer não está pausado." },
          { status: 400 },
        );
      }

      const [updated] = await db
        .update(activeTimer)
        .set({ pausedAt: null, startedAt: new Date() })
        .where(eq(activeTimer.id, existing.id))
        .returning();

      return Response.json({ timer: updated });
    }

    if (action === "update") {
      const updates: Record<string, unknown> = {};
      if (typeof body.description === "string")
        updates.description = body.description;
      if (typeof body.billable === "boolean") updates.billable = body.billable;
      if (typeof body.azureWorkItemId === "number") {
        updates.azureWorkItemId = body.azureWorkItemId;
        updates.azureWorkItemTitle = body.azureWorkItemTitle ?? null;
      }

      if (Object.keys(updates).length === 0) {
        return Response.json({ timer: existing });
      }

      const [updated] = await db
        .update(activeTimer)
        .set(updates)
        .where(eq(activeTimer.id, existing.id))
        .returning();

      return Response.json({ timer: updated });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("[PATCH /api/timer]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE - Stop the timer and convert to a time entry.
 */
export async function DELETE(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const existing = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, session.user.id),
    });

    if (!existing) {
      return Response.json({ error: "Nenhum timer ativo." }, { status: 404 });
    }

    const entry = await stopTimerAndSave(session.user.id, existing);

    return Response.json({ entry });
  } catch (error) {
    console.error("[DELETE /api/timer]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * Stop a timer and save it as a time entry.
 */
async function stopTimerAndSave(
  userId: string,
  timer: typeof activeTimer.$inferSelect,
) {
  const now = new Date();
  let totalMs = timer.accumulatedMs;

  // If not paused, add time since last startedAt
  if (!timer.pausedAt) {
    totalMs += now.getTime() - timer.startedAt.getTime();
  }

  const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
  const dateStr = now.toISOString().slice(0, 10);

  const entryId = crypto.randomUUID();
  const [entry] = await db
    .insert(timeEntry)
    .values({
      id: entryId,
      userId,
      projectId: timer.projectId,
      description: timer.description || "Timer",
      date: dateStr,
      duration: durationMinutes,
      billable: timer.billable,
      azureWorkItemId: timer.azureWorkItemId,
      azureWorkItemTitle: timer.azureWorkItemTitle,
      startTime: timer.startedAt,
      endTime: now,
      azdoSyncStatus: timer.azureWorkItemId ? "pending" : "none",
    })
    .returning();

  // Delete the active timer
  await db.delete(activeTimer).where(eq(activeTimer.userId, userId));

  triggerCompletedWorkSync(userId, [entry.azureWorkItemId]);

  return entry;
}
