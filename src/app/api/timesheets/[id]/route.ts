import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
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
  const session = await auth.api.getSession({ headers: req.headers });
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
          orderBy: (e, { desc }) => [desc(e.date)],
        },
      },
    });

    if (!ts) {
      return Response.json(
        { error: "Timesheet não encontrado." },
        { status: 404 },
      );
    }

    // Calcular os totais dinâmicos se o timesheet estiver open ou rejected
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

      // E popular "entries" com o resultado dinâmico na verdade?
      // Neste endpoint, "with: { entries {...} }" foi feito.
      // Mas essas entradas "entries" no momento não estão linkadas ao ts.id se o ts for open (except status rejected linked back).
      // Então precisamos buscar as entries manualmente se está open ou rejected
      const dynamicEntries = await db.query.timeEntry.findMany({
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
        orderBy: (e, { desc }) => [desc(e.date)],
      });

      ts.entries = dynamicEntries;
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
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const userRole = session.user.role as string;

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
      // Only the owner can submit
      if (ts.userId !== session.user.id) {
        return Response.json({ error: "Sem permissão." }, { status: 403 });
      }
      if (ts.status !== "open" && ts.status !== "rejected") {
        return Response.json(
          {
            error:
              "Apenas timesheets abertos ou rejeitados podem ser submetidos.",
          },
          { status: 400 },
        );
      }

      const { start, end } = getPeriodRange(ts.period, ts.periodType);

      // Link and move all relevant entries to submitted
      await db
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

      // Recalculate totals AFTER linking
      const [totals] = await db
        .select({
          totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
          billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
          entryCount: sql<number>`COUNT(*)`,
        })
        .from(timeEntry)
        .where(and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)));

      if ((totals?.entryCount ?? 0) === 0) {
        return Response.json(
          {
            error:
              "Não é possível submeter um timesheet sem entradas no período.",
          },
          { status: 400 },
        );
      }

      // Update timesheet status + totals
      const [updated] = await db
        .update(timesheet)
        .set({
          status: "submitted",
          submittedAt: new Date(),
          totalMinutes: totals?.totalMinutes ?? 0,
          billableMinutes: totals?.billableMinutes ?? 0,
        })
        .where(eq(timesheet.id, id))
        .returning();

      return Response.json({ timesheet: updated });
    }

    if (action === "approve") {
      if (!["manager", "admin"].includes(userRole)) {
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

      const [updated] = await db
        .update(timesheet)
        .set({
          status: "approved",
          approvedBy: session.user.id,
          approvedAt: new Date(),
          rejectionReason: null,
        })
        .where(eq(timesheet.id, id))
        .returning();

      // Mark all submitted entries for sync
      await db
        .update(timeEntry)
        .set({ azdoSyncStatus: "pending" })
        .where(and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)));

      // Trigger AzDO sync for all linked WI IDs (fire-and-forget)
      const linkedEntries = await db.query.timeEntry.findMany({
        where: and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)),
        columns: { azureWorkItemId: true },
      });
      const uniqueWiIds = [
        ...new Set(
          linkedEntries
            .map((e) => e.azureWorkItemId)
            .filter((id): id is number => id !== null && id !== undefined),
        ),
      ];
      for (const wiId of uniqueWiIds) {
        syncCompletedWorkToAzDO(ts.userId, wiId);
      }

      return Response.json({ timesheet: updated });
    }

    if (action === "reject") {
      if (!["manager", "admin"].includes(userRole)) {
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

      // No need to revert entries to draft since timeEntry status is removed

      return Response.json({ timesheet: updated });
    }

    return Response.json({ error: "Ação inválida." }, { status: 400 });
  } catch (error) {
    console.error("[PATCH /api/timesheets/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
