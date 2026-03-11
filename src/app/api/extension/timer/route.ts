import { eq } from "drizzle-orm";
import {
  extensionJson,
  extensionOptions,
  resolveExtensionUser,
} from "@/lib/extension-auth";
export const dynamic = "force-dynamic";

import { and } from "drizzle-orm";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import {
  activeTimer,
  project,
  projectMember,
  timeEntry,
} from "@/lib/db/schema";
import { startTimerSchema } from "@/lib/validations/time-entry.schema";

export function OPTIONS() {
  return extensionOptions();
}

/**
 * GET /api/extension/timer
 * Returns the authenticated user's active timer (if any).
 */
export async function GET(req: Request): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser)
    return extensionJson({ error: "Unauthorized" }, { status: 401 });

  try {
    const timer = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, extUser.id),
      with: {
        project: { columns: { id: true, name: true, code: true, color: true } },
      },
    });
    return extensionJson({ timer: timer ?? null });
  } catch (error) {
    console.error("[GET /api/extension/timer]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/extension/timer
 * Starts a new timer for the authenticated user.
 * Body: { action: "start", projectId, description?, billable?, azureWorkItemId?, azureWorkItemTitle? }
 *   or  { action: "stop" }
 */
export async function POST(req: Request): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser)
    return extensionJson({ error: "Unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return extensionJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (body as Record<string, unknown>).action as string;

  // ── STOP ────────────────────────────────────────────────────────────────
  if (action === "stop") {
    try {
      const existing = await db.query.activeTimer.findFirst({
        where: eq(activeTimer.userId, extUser.id),
      });

      if (!existing) {
        return extensionJson({ error: "Nenhum timer ativo." }, { status: 404 });
      }

      const entry = await stopTimerAndSave(extUser.id, existing);
      return extensionJson({ entry });
    } catch (error) {
      console.error("[POST /api/extension/timer stop]:", error);
      return extensionJson({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  // ── START ────────────────────────────────────────────────────────────────
  const parsed = startTimerSchema.safeParse(body);
  if (!parsed.success) {
    return extensionJson(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    const proj = await db.query.project.findFirst({
      where: eq(project.id, data.projectId),
      columns: { id: true, status: true },
    });

    if (!proj || proj.status !== "active") {
      return extensionJson(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    if (extUser.role === "member") {
      const membership = await db.query.projectMember.findFirst({
        where: and(
          eq(projectMember.projectId, data.projectId),
          eq(projectMember.userId, extUser.id),
        ),
      });
      if (!membership) {
        return extensionJson(
          { error: "Você não é membro deste projeto." },
          { status: 403 },
        );
      }
    }

    // Stop existing timer first
    const existing = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, extUser.id),
    });
    if (existing) {
      await stopTimerAndSave(extUser.id, existing);
    }

    const id = crypto.randomUUID();
    const [timer] = await db
      .insert(activeTimer)
      .values({
        id,
        userId: extUser.id,
        projectId: data.projectId,
        description: data.description,
        billable: data.billable,
        azureWorkItemId: data.azureWorkItemId,
        azureWorkItemTitle: data.azureWorkItemTitle,
        startedAt: new Date(),
        accumulatedMs: 0,
      })
      .returning();

    return extensionJson({ timer }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/extension/timer start]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function stopTimerAndSave(
  userId: string,
  timer: typeof activeTimer.$inferSelect,
) {
  const now = new Date();
  let totalMs = timer.accumulatedMs;
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

  await db.delete(activeTimer).where(eq(activeTimer.userId, userId));
  triggerCompletedWorkSync(userId, [entry.azureWorkItemId]);

  return entry;
}
