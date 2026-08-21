import { eq } from "drizzle-orm";
import { canAccessProject } from "@/lib/access-control";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { activeTimer, project, timeEntry } from "@/lib/db/schema";
import {
  extensionJson,
  extensionOptions,
  resolveExtensionUser,
} from "@/lib/extension-auth";
import {
  assertWeeklyTimesheetDateUnlocked,
  LockedTimesheetPeriodError,
} from "@/lib/time-entry-locks";
import { todayInAppTimeZone } from "@/lib/timezone";
import { startTimerSchema } from "@/lib/validations/time-entry.schema";

export const dynamic = "force-dynamic";

export function OPTIONS() {
  return extensionOptions();
}

/**
 * Load the active timer with its project joined in.
 *
 * The extension's `ActiveTimer` type declares `project` as required, so every
 * response must carry it — `.returning()` on an insert yields only the bare
 * `active_timer` row.
 */
async function findActiveTimerWithProject(userId: string) {
  return db.query.activeTimer.findFirst({
    where: eq(activeTimer.userId, userId),
    with: {
      project: { columns: { id: true, name: true, code: true, color: true } },
    },
  });
}

/**
 * GET /api/extension/timer
 * Returns the authenticated user's active timer (if any).
 */
export async function GET(req: Request): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser) {
    return extensionJson({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const timer = await findActiveTimerWithProject(extUser.id);
    return extensionJson({ timer: timer ?? null });
  } catch (error) {
    console.error("[GET /api/extension/timer]:", error);
    return extensionJson({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/extension/timer
 * Starts or stops the timer for the authenticated user.
 */
export async function POST(req: Request): Promise<Response> {
  const extUser = await resolveExtensionUser(req);
  if (!extUser) {
    return extensionJson({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return extensionJson({ error: "Invalid JSON" }, { status: 400 });
  }

  const action = (body as Record<string, unknown>).action as string;

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
      if (error instanceof LockedTimesheetPeriodError) {
        return extensionJson({ error: error.message }, { status: 409 });
      }

      console.error("[POST /api/extension/timer stop]:", error);
      return extensionJson({ error: "Internal Server Error" }, { status: 500 });
    }
  }

  const parsed = startTimerSchema.safeParse(body);
  if (!parsed.success) {
    return extensionJson(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const data = parsed.data;

  try {
    await assertWeeklyTimesheetDateUnlocked(extUser.id, todayInAppTimeZone());

    const targetProject = await db.query.project.findFirst({
      where: eq(project.id, data.projectId),
      columns: { id: true, status: true },
    });

    if (!targetProject || targetProject.status !== "active") {
      return extensionJson(
        { error: "Projeto não encontrado." },
        { status: 404 },
      );
    }

    if (
      !(await canAccessProject(
        {
          role:
            extUser.role === "admin" || extUser.role === "manager"
              ? extUser.role
              : "member",
          userId: extUser.id,
        },
        data.projectId,
      ))
    ) {
      return extensionJson(
        { error: "Você não pode iniciar timer neste projeto." },
        { status: 403 },
      );
    }

    const existing = await db.query.activeTimer.findFirst({
      where: eq(activeTimer.userId, extUser.id),
    });
    if (existing) {
      await stopTimerAndSave(extUser.id, existing);
    }

    const id = crypto.randomUUID();
    await db.insert(activeTimer).values({
      id,
      userId: extUser.id,
      projectId: data.projectId,
      description: data.description,
      billable: data.billable,
      azureWorkItemId: data.azureWorkItemId,
      azureWorkItemTitle: data.azureWorkItemTitle,
      startedAt: new Date(),
      accumulatedMs: 0,
    });

    const timer = await findActiveTimerWithProject(extUser.id);

    return extensionJson({ timer }, { status: 201 });
  } catch (error) {
    if (error instanceof LockedTimesheetPeriodError) {
      return extensionJson({ error: error.message }, { status: 409 });
    }

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
  const dateStr = todayInAppTimeZone();

  await assertWeeklyTimesheetDateUnlocked(userId, dateStr);

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
