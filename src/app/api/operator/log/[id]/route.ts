import { and, eq } from "drizzle-orm";
import { getActiveSession } from "@/lib/access-control";
import { db } from "@/lib/db";
import { operatorActionLog, timeEntry } from "@/lib/db/schema";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { getTimesheetStatusLabel } from "@/lib/timesheet-status";
import { undoOperatorLogSchema } from "@/lib/validations/operator.schema";

/** Actions we can genuinely put back the way they were. */
const UNDOABLE_KINDS = new Set([
  "create_time_entry",
  "stop_timer",
  "delete_time_entry",
]);

/**
 * PATCH - Undoes a logged action.
 *
 * Only entry-level changes are reversible: an entry the assistant created gets
 * soft-deleted, and one it deleted gets restored. Everything else is marked
 * non-reversible in the catalogue and never reaches this route.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (!undoOperatorLogSchema.safeParse(body).success) {
    return Response.json({ error: "Ação inválida" }, { status: 400 });
  }

  try {
    const { id } = await params;

    const log = await db.query.operatorActionLog.findFirst({
      where: and(
        eq(operatorActionLog.id, id),
        eq(operatorActionLog.userId, session.user.id),
      ),
    });

    if (!log) {
      return Response.json(
        { error: "Registro não encontrado" },
        { status: 404 },
      );
    }

    if (log.undoneAt) {
      return Response.json(
        { error: "Esta ação já foi desfeita" },
        { status: 409 },
      );
    }

    if (log.status !== "executed" || !log.resultId) {
      return Response.json(
        { error: "Esta ação não pode ser desfeita" },
        { status: 409 },
      );
    }

    if (!UNDOABLE_KINDS.has(log.kind)) {
      return Response.json(
        { error: "Esta ação não pode ser desfeita" },
        { status: 409 },
      );
    }

    const entry = await db.query.timeEntry.findFirst({
      where: and(
        eq(timeEntry.id, log.resultId),
        eq(timeEntry.userId, session.user.id),
      ),
      columns: { id: true, date: true, deletedAt: true },
    });

    if (!entry) {
      return Response.json(
        { error: "O lançamento não existe mais" },
        { status: 404 },
      );
    }

    // The week may have been submitted since the action ran; undoing would
    // silently change an already-approved timesheet.
    const lock = await getWeeklyTimesheetStatusForDate(
      session.user.id,
      entry.date,
    );

    if (lock.locked && lock.status) {
      return Response.json(
        {
          error: `A semana já foi ${getTimesheetStatusLabel(lock.status)} — não é possível desfazer.`,
        },
        { status: 409 },
      );
    }

    const restoring = log.kind === "delete_time_entry";

    if (restoring && !entry.deletedAt) {
      return Response.json(
        { error: "O lançamento já está ativo" },
        { status: 409 },
      );
    }

    if (!restoring && entry.deletedAt) {
      return Response.json(
        { error: "O lançamento já foi excluído" },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(timeEntry)
        .set({ deletedAt: restoring ? null : new Date() })
        .where(eq(timeEntry.id, entry.id));

      await tx
        .update(operatorActionLog)
        .set({ status: "undone", undoneAt: new Date() })
        .where(eq(operatorActionLog.id, log.id));
    });

    return Response.json({
      undone: true,
      restored: restoring,
      entryId: entry.id,
    });
  } catch (error) {
    console.error("[PATCH /api/operator/log/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
