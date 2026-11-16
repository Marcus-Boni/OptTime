import { and, eq, isNull } from "drizzle-orm";
import { canAccessProject, getActorContext } from "@/lib/access-control";
import { auth } from "@/lib/auth";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { project, projectMember, timeEntry } from "@/lib/db/schema";
import { LockedTimesheetPeriodError } from "@/lib/time-entry-locks";
import {
  getRetainedTimeEntryTimesheetId,
  lockTimeEntryForMutation,
} from "@/lib/time-entry-timesheet";
import { todayInAppTimeZone } from "@/lib/timezone";
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
    const actor = getActorContext(session.user);
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

    if (existing.source === "opt-rh" && actor.role !== "admin") {
      return Response.json(
        {
          error:
            "Lançamentos criados pelo OPT RH não podem ser alterados diretamente pelo colaborador.",
        },
        { status: 403 },
      );
    }

    const body = await req.json();
    const parsed = updateTimeEntrySchema.safeParse(body);

    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos.", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const data = parsed.data;
    if (data.date && data.date > todayInAppTimeZone()) {
      return Response.json(
        { error: "Não é possível lançar horas em um dia futuro." },
        { status: 400 },
      );
    }

    const nextDate = data.date ?? existing.date;
    const nextProjectId = data.projectId ?? existing.projectId;

    if (nextProjectId !== existing.projectId) {
      const targetProject = await db.query.project.findFirst({
        where: eq(project.id, nextProjectId),
        columns: { id: true, status: true },
      });

      if (!targetProject || targetProject.status !== "active") {
        return Response.json(
          { error: "Projeto não encontrado." },
          { status: 404 },
        );
      }

      if (!(await canAccessProject(actor, nextProjectId))) {
        return Response.json(
          { error: "Você não pode lançar horas neste projeto." },
          { status: 403 },
        );
      }

      if (actor.role === "member") {
        const membership = await db.query.projectMember.findFirst({
          where: and(
            eq(projectMember.projectId, nextProjectId),
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
    }

    const destination = { userId: session.user.id, date: nextDate };
    const result = await db.transaction(async (tx) => {
      const current = await lockTimeEntryForMutation(tx, existing, destination);
      if (!current) return null;

      const workItemChanged =
        data.azureWorkItemId !== undefined &&
        data.azureWorkItemId !== current.azureWorkItemId;
      const durationChanged =
        data.duration !== undefined && data.duration !== current.duration;
      const shouldSyncCompletedWork = workItemChanged || durationChanged;
      const nextAzureWorkItemId =
        data.azureWorkItemId !== undefined
          ? data.azureWorkItemId
          : current.azureWorkItemId;
      const nextAzdoSyncStatus = nextAzureWorkItemId
        ? shouldSyncCompletedWork
          ? "pending"
          : current.azdoSyncStatus
        : "none";
      const timesheetId = await getRetainedTimeEntryTimesheetId(
        tx,
        current,
        destination,
      );

      const [updated] = await tx
        .update(timeEntry)
        .set({ ...data, timesheetId, azdoSyncStatus: nextAzdoSyncStatus })
        .where(eq(timeEntry.id, id))
        .returning();

      return {
        updated,
        previousWorkItemId: current.azureWorkItemId,
        shouldSyncCompletedWork,
      };
    });

    if (!result) {
      return Response.json(
        {
          error:
            "O apontamento mudou durante a operação. Atualize e tente novamente.",
        },
        { status: 409 },
      );
    }

    if (result.shouldSyncCompletedWork) {
      triggerCompletedWorkSync(session.user.id, [
        result.previousWorkItemId,
        result.updated.azureWorkItemId,
      ]);
    }

    return Response.json({ entry: result.updated });
  } catch (error) {
    if (error instanceof LockedTimesheetPeriodError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

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

    const actor = getActorContext(session.user);
    if (existing.source === "opt-rh" && actor.role !== "admin") {
      return Response.json(
        {
          error:
            "Lançamentos criados pelo OPT RH não podem ser excluídos diretamente pelo colaborador.",
        },
        { status: 403 },
      );
    }

    const deleted = await db.transaction(async (tx) => {
      const current = await lockTimeEntryForMutation(tx, existing);
      if (!current) return null;

      await tx
        .update(timeEntry)
        .set({ deletedAt: new Date() })
        .where(eq(timeEntry.id, id));
      return current;
    });

    if (!deleted) {
      return Response.json(
        {
          error:
            "O apontamento mudou durante a operação. Atualize e tente novamente.",
        },
        { status: 409 },
      );
    }

    triggerCompletedWorkSync(session.user.id, [deleted.azureWorkItemId]);

    return Response.json({ success: true });
  } catch (error) {
    if (error instanceof LockedTimesheetPeriodError) {
      return Response.json({ error: error.message }, { status: 409 });
    }

    console.error("[DELETE /api/time-entries/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
