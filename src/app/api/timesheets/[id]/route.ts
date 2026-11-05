import { and, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  canManageUser,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { syncCompletedWorkToAzDO } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { timeEntry, timesheet } from "@/lib/db/schema";
import type { CelebrationPayload } from "@/lib/gamification";
import { awardWeekApproval, awardWeekSubmission } from "@/lib/gamification";
import {
  getTimesheetPeriodLabel,
  isPeriodOpenAfter,
} from "@/lib/timesheet-periods";
import { resolveClosedWeekAwardPeriod } from "@/lib/timesheet-week-closure";
import { todayInAppTimeZone } from "@/lib/timezone";
import { getPeriodRange } from "@/lib/utils";

type RouteContext = { params: Promise<{ id: string }> };

const timesheetActionSchema = z.object({
  action: z.enum(["submit", "approve", "reject", "reopen"]),
  rejectionReason: z.string().trim().max(1000).optional(),
  /** Confirms approving a period that still has days ahead of today. */
  force: z.boolean().optional(),
  /** Optional context recorded when a manager reopens an approved period. */
  reason: z.string().trim().max(500).optional(),
});

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
      where: eq(timesheet.id, id),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
            department: true,
            weeklyCapacity: true,
          },
        },
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

    const actor = getActorContext(session.user);
    const isOwner = ts.userId === session.user.id;
    const canView =
      isOwner ||
      actor.role === "admin" ||
      (actor.role === "manager" && (await canManageUser(actor, ts.userId)));

    if (!canView) {
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
            eq(timeEntry.userId, ts.userId),
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
          eq(timeEntry.userId, ts.userId),
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

    return Response.json({
      timesheet: { ...ts, weeklyCapacity: ts.user?.weeklyCapacity ?? 40 },
    });
  } catch (error) {
    console.error("[GET /api/timesheets/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PATCH - Submit, approve, reject, or reopen a timesheet.
 * Body: { action: "submit" | "approve" | "reject" | "reopen", rejectionReason?, force?, reason? }
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

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsedBody = timesheetActionSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return Response.json(
      { error: "Ação inválida.", details: parsedBody.error.flatten() },
      { status: 400 },
    );
  }

  const body = parsedBody.data;
  const action = body.action;

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

    if (action === "submit") {
      const isOwner = ts.userId === session.user.id;
      const canManage =
        actor.role === "admin" ||
        (actor.role === "manager" && (await canManageUser(actor, ts.userId)));

      if (!isOwner && !canManage) {
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
          .where(
            and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)),
          );

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

      // Gamification is a reward layer on top of the submission, never a
      // gate for it: a failure here must not fail the week the user closed.
      // A week split at a month boundary is credited once, when its last
      // slice with entries closes.
      let celebration: CelebrationPayload | null = null;
      try {
        const awardPeriod = await resolveClosedWeekAwardPeriod(
          ts.userId,
          ts.period,
          ts.periodType,
          ["submitted", "approved"],
        );
        if (awardPeriod) {
          celebration = await awardWeekSubmission({
            userId: ts.userId,
            period: awardPeriod,
            periodType: ts.periodType,
            submittedAt: updated?.submittedAt ?? new Date(),
            totalMinutes: updated?.totalMinutes ?? 0,
          });
        }
      } catch (error: unknown) {
        console.error("[PATCH /api/timesheets/:id] gamification:", error);
      }

      return Response.json({ timesheet: updated, celebration });
    }

    if (action === "approve") {
      if (actor.role !== "manager" && actor.role !== "admin") {
        return Response.json(
          { error: "Sem permissão para aprovar." },
          { status: 403 },
        );
      }

      if (
        ts.status !== "submitted" &&
        ts.status !== "open" &&
        ts.status !== "rejected"
      ) {
        return Response.json(
          {
            error:
              "Apenas timesheets submetidos, abertos ou rejeitados podem ser aprovados.",
          },
          { status: 400 },
        );
      }

      if (
        actor.role === "manager" &&
        !(await canManageUser(actor, ts.userId))
      ) {
        return Response.json(
          { error: "Você não pode aprovar timesheets fora do seu time." },
          { status: 403 },
        );
      }

      // Approving locks every day of the period. Days that have not happened
      // yet are almost always a mistake (closing the month early used to lock
      // the next month's days), so it needs an explicit confirmation.
      if (
        !body.force &&
        isPeriodOpenAfter(ts.period, ts.periodType, todayInAppTimeZone())
      ) {
        const { end } = getPeriodRange(ts.period, ts.periodType);
        return Response.json(
          {
            error: `${getTimesheetPeriodLabel(ts.period, ts.periodType)} ainda não terminou. Aprovar agora bloqueia os lançamentos até ${end}.`,
            code: "PERIOD_NOT_ENDED",
            periodEnd: end,
          },
          { status: 409 },
        );
      }

      const updated = await db.transaction(async (tx) => {
        if (ts.status === "open" || ts.status === "rejected") {
          const { start, end } = getPeriodRange(ts.period, ts.periodType);

          await tx
            .update(timeEntry)
            .set({ timesheetId: id })
            .where(
              and(
                eq(timeEntry.userId, ts.userId),
                gte(timeEntry.date, start),
                lte(timeEntry.date, end),
                or(
                  isNull(timeEntry.timesheetId),
                  eq(timeEntry.timesheetId, id),
                ),
                isNull(timeEntry.deletedAt),
              ),
            );

          const [totals] = await tx
            .select({
              totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
              billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
            })
            .from(timeEntry)
            .where(
              and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)),
            );

          await tx
            .update(timesheet)
            .set({
              totalMinutes: Number(totals?.totalMinutes ?? 0),
              billableMinutes: Number(totals?.billableMinutes ?? 0),
            })
            .where(eq(timesheet.id, id));
        }

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
          .where(
            and(eq(timeEntry.timesheetId, id), isNull(timeEntry.deletedAt)),
          );

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

      try {
        const awardPeriod = await resolveClosedWeekAwardPeriod(
          ts.userId,
          ts.period,
          ts.periodType,
          ["approved"],
        );
        if (awardPeriod) {
          await awardWeekApproval(ts.userId, awardPeriod, ts.periodType);
        }
      } catch (error: unknown) {
        console.error(
          "[PATCH /api/timesheets/:id] gamification approval:",
          error,
        );
      }

      return Response.json({ timesheet: updated });
    }

    if (action === "reopen") {
      if (actor.role !== "manager" && actor.role !== "admin") {
        return Response.json(
          { error: "Sem permissão para reabrir." },
          { status: 403 },
        );
      }

      if (ts.status !== "approved") {
        return Response.json(
          { error: "Apenas timesheets aprovados podem ser reabertos." },
          { status: 400 },
        );
      }

      if (
        actor.role === "manager" &&
        !(await canManageUser(actor, ts.userId))
      ) {
        return Response.json(
          { error: "Você não pode reabrir timesheets fora do seu time." },
          { status: 403 },
        );
      }

      // Entries keep their timesheet link: the next submission re-collects
      // them and recomputes totals. XP already credited is not clawed back —
      // reopening is a correction path, not a penalty.
      const [updated] = await db
        .update(timesheet)
        .set({
          status: "open",
          approvedBy: null,
          approvedAt: null,
          submittedAt: null,
          rejectionReason: null,
        })
        .where(and(eq(timesheet.id, id), eq(timesheet.status, "approved")))
        .returning();

      if (!updated) {
        return Response.json(
          { error: "O timesheet mudou de status. Atualize a página." },
          { status: 409 },
        );
      }

      console.info("[timesheet_reopened]", {
        timesheetId: id,
        ownerId: ts.userId,
        period: ts.period,
        reopenedBy: session.user.id,
        previousApprovedBy: ts.approvedBy,
        previousApprovedAt: ts.approvedAt?.toISOString() ?? null,
        reason: body.reason ?? null,
      });

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

      if (
        actor.role === "manager" &&
        !(await canManageUser(actor, ts.userId))
      ) {
        return Response.json(
          { error: "Você não pode rejeitar timesheets fora do seu time." },
          { status: 403 },
        );
      }

      const rejectionReason = body.rejectionReason;
      if (!rejectionReason) {
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
