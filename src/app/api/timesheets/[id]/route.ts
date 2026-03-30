import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import {
  canManageUser,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { syncCompletedWorkToAzDO } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { timeEntry, timesheet } from "@/lib/db/schema";
import { getPeriodRange } from "@/lib/utils";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET - Get a timesheet with all its entries.
 */
export async function GET(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const ts = await db.query.timesheet.findFirst({
      where: and(eq(timesheet.id, id), eq(timesheet.userId, session.user.id)),
      with: {
        approver: { columns: { id: true, name: true } },
        entries: {
          where: isNull(timeEntry.deletedAt),
          with: {
            project: {
              columns: { id: true, name: true, code: true, color: true },
            },
          },
          orderBy: (entry, { desc }) => [desc(entry.date)],
        },
      },
    });

    if (!ts) {
      return Response.json(
        { error: "Timesheet não encontrado." },
        { status: 404 },
      );
    }

    if (ts.status === "open" || ts.status === "rejected") {
      const { start, end } = getPeriodRange(ts.period, ts.periodType);

      const result = await db
        .select({
          totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
          billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
        })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.userId, session.user.id),
            gte(timeEntry.date, start),
            lte(timeEntry.date, end),
            isNull(timeEntry.deletedAt),
            or(isNull(timeEntry.timesheetId), eq(timeEntry.timesheetId, ts.id)),
          ),
        );

      ts.totalMinutes = Number(result[0]?.totalMinutes || 0);
      ts.billableMinutes = Number(result[0]?.billableMinutes || 0);

      ts.entries = await db.query.timeEntry.findMany({
        where: and(
          eq(timeEntry.userId, session.user.id),
          gte(timeEntry.date, start),
          lte(timeEntry.date, end),
          isNull(timeEntry.deletedAt),
          or(isNull(timeEntry.timesheetId), eq(timeEntry.timesheetId, ts.id)),
        ),
        with: {
          project: {
            columns: { id: true, name: true, code: true, color: true },
          },
        },
        orderBy: (entry, { desc }) => [desc(entry.date)],
      });
    }

    return Response.json({ timesheet: ts });
  } catch (error) {
    console.error("[GET /api/timesheets/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH - Submit, approve, or reject a timesheet.
 * Body: { action: "submit" | "approve" | "reject", rejectionReason? }
 */
export async function PATCH(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const actor = getActorContext(session.user);

  try {
    const ts = await db.query.timesheet.findFirst({
      where: eq(timesheet.id, id),
    });

    if (!ts) {
      return Response.json(
        { error: "Timesheet não encontrado." },
        { status: 404 },
      );
    }

    const body = await req.json();
    const action = body.action as string;

    if (action === "submit") {
      if (ts.userId !== session.user.id) {
        return Response.json({ error: "Sem permissão." }, { status: 403 });
      }

      if (
        ts.status !== "open" &&
        ts.status !== "rejected" &&
        ts.status !== "submitted"
      ) {
        return Response.json(
          {
            error:
              "Apenas timesheets abertos, rejeitados ou submetidos podem ser submetidos.",
          },
          { status: 400 },
        );
      }

      const { start, end } = getPeriodRange(ts.period, ts.periodType);

      const updated = await db.transaction(async (tx) => {
        await tx
          .update(timeEntry)
          .set({ timesheetId: id })
          .where(
            and(
              eq(timeEntry.userId, ts.userId),
              gte(timeEntry.date, start),
              lte(timeEntry.date, end),
              or(isNull(timeEntry.timesheetId), eq(timeEntry.timesheetId, id)),
              isNull(timeEntry.deletedAt),
            ),
          );

        const [totals] = await tx
          .select({
            totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
            billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
            entryCount: sql<number>`COUNT(*)`,
          })
          .from(timeEntry)
          .where(and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)));

        if ((totals?.entryCount ?? 0) === 0) {
          throw new Error("EMPTY_TIMESHEET");
        }

        const [submittedTimesheet] = await tx
          .update(timesheet)
          .set({
            status: "submitted",
            submittedAt: new Date(),
            totalMinutes: totals?.totalMinutes ?? 0,
            billableMinutes: totals?.billableMinutes ?? 0,
            rejectionReason: null,
          })
          .where(eq(timesheet.id, id))
          .returning();

        return submittedTimesheet;
      });

      return Response.json({ timesheet: updated });
    }

    if (action === "approve") {
      if (actor.role !== "manager" && actor.role !== "admin") {
        return Response.json(
          { error: "Sem permissão para aprovar." },
          { status: 403 },
        );
      }

      if (ts.status !== "submitted") {
        return Response.json(
          { error: "Apenas timesheets submetidos podem ser aprovados." },
          { status: 400 },
        );
      }

      if (actor.role === "manager" && !(await canManageUser(actor, ts.userId))) {
        return Response.json(
          { error: "Você não pode aprovar timesheets fora do seu time." },
          { status: 403 },
        );
      }

      const updated = await db.transaction(async (tx) => {
        const [approvedTimesheet] = await tx
          .update(timesheet)
          .set({
            status: "approved",
            approvedBy: session.user.id,
            approvedAt: new Date(),
            rejectionReason: null,
          })
          .where(eq(timesheet.id, id))
          .returning();

        await tx
          .update(timeEntry)
          .set({ azdoSyncStatus: "pending" })
          .where(and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)));

        return approvedTimesheet;
      });

      const linkedEntries = await db.query.timeEntry.findMany({
        where: and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)),
        columns: { azureWorkItemId: true },
      });

      const uniqueWiIds = [
        ...new Set(
          linkedEntries
            .map((entry) => entry.azureWorkItemId)
            .filter((workItemId): workItemId is number => workItemId != null),
        ),
      ];

      for (const workItemId of uniqueWiIds) {
        syncCompletedWorkToAzDO(ts.userId, workItemId);
      }

      return Response.json({ timesheet: updated });
    }

    if (action === "reject") {
      if (actor.role !== "manager" && actor.role !== "admin") {
        return Response.json(
          { error: "Sem permissão para rejeitar." },
          { status: 403 },
        );
      }

      if (ts.status !== "submitted") {
        return Response.json(
          { error: "Apenas timesheets submetidos podem ser rejeitados." },
          { status: 400 },
        );
      }

      if (actor.role === "manager" && !(await canManageUser(actor, ts.userId))) {
        return Response.json(
          { error: "Você não pode rejeitar timesheets fora do seu time." },
          { status: 403 },
        );
      }

      const rejectionReason = body.rejectionReason as string | undefined;
      if (!rejectionReason?.trim()) {
        return Response.json(
          { error: "Motivo da rejeição é obrigatório." },
          { status: 400 },
        );
      }

      const [updated] = await db
        .update(timesheet)
        .set({
          status: "rejected",
          rejectionReason: rejectionReason.trim(),
        })
        .where(eq(timesheet.id, id))
        .returning();

      return Response.json({ timesheet: updated });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === "EMPTY_TIMESHEET") {
      return Response.json(
        {
          error:
            "Não é possível submeter um timesheet sem entradas no período.",
        },
        { status: 400 },
      );
    }

    console.error("[PATCH /api/timesheets/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
