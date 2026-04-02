import { eq } from "drizzle-orm";
import {
  canAccessProject,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { activeTimer, project, timeEntry } from "@/lib/db/schema";
import { startTimerSchema } from "@/lib/validations/time-entry.schema";

function resolveTimeZone(headerValue: string | null): string {
  if (!headerValue) {
    return "UTC";
  }

  try {
    new Intl.DateTimeFormat("en-US", { timeZone: headerValue });
    return headerValue;
  } catch {
    return "UTC";
  }
}

function formatDateInTimeZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const year = parts.find((part) => part.type === "year")?.value ?? "1970";
  const month = parts.find((part) => part.type === "month")?.value ?? "01";
  const day = parts.find((part) => part.type === "day")?.value ?? "01";

  return `${year}-${month}-${day}`;
}

/**
 * GET - Get the current user's active timer (if any).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
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
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const timezone = resolveTimeZone(req.headers.get("x-timezone"));
    const body = await req.json();
    const parsed = startTimerSchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    const actor = getActorContext(session.user);
    const targetProject = await db.query.project.findFirst({
      where: eq(project.id, data.projectId),
      columns: { id: true, status: true },
    });

    if (!targetProject || targetProject.status !== "active") {
      return Response.json(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    if (!(await canAccessProject(actor, data.projectId))) {
      return Response.json(
        { error: "Você não pode iniciar timer neste projeto." },
        { status: 403 },
      );
    }

    const existingTimer = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, session.user.id),
    });

    if (existingTimer) {
      await stopTimerAndSave(session.user.id, existingTimer, timezone);
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
 */
export async function PATCH(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
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
 * DELETE - Stop the timer and convert it to a time entry.
 */
export async function DELETE(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const timezone = resolveTimeZone(req.headers.get("x-timezone"));
    const existing = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, session.user.id),
    });

    if (!existing) {
      return Response.json({ error: "Nenhum timer ativo." }, { status: 404 });
    }

    const entry = await stopTimerAndSave(session.user.id, existing, timezone);

    return Response.json({ entry });
  } catch (error) {
    console.error("[DELETE /api/timer]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function stopTimerAndSave(
  userId: string,
  timer: typeof activeTimer.$inferSelect,
  timezone: string,
) {
  const now = new Date();
  let totalMs = timer.accumulatedMs;

  if (!timer.pausedAt) {
    totalMs += now.getTime() - timer.startedAt.getTime();
  }

  const durationMinutes = Math.max(1, Math.round(totalMs / 60000));
  const dateStr = formatDateInTimeZone(now, timezone);

  const entry = await db.transaction(async (tx) => {
    const entryId = crypto.randomUUID();
    const [createdEntry] = await tx
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

    await tx.delete(activeTimer).where(eq(activeTimer.userId, userId));

    return createdEntry;
  });

  triggerCompletedWorkSync(userId, [entry.azureWorkItemId]);

  return entry;
}
