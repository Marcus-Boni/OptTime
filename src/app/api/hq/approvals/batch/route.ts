import { and, eq, isNull } from "drizzle-orm";
import {
  canManageUser,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { syncCompletedWorkToAzDO } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { timeEntry, timesheet } from "@/lib/db/schema";
import { awardWeekApproval } from "@/lib/gamification";
import { batchApprovalSchema } from "@/lib/validations/hq.schema";
import type { BatchApprovalResult } from "@/types/hq";

/**
 * POST - Batch approval for the 1-click Approval Center.
 *
 * Mirrors the single-timesheet "approve" transition exactly (see
 * /api/timesheets/[id]): status flip + entry sync flags in one transaction per
 * timesheet, then fire-and-forget Azure DevOps sync and gamification. Each
 * item succeeds or fails independently so one bad timesheet never blocks the
 * other fourteen conformant ones.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json(
      { error: "Sem permissão para aprovar." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = batchApprovalSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const results: BatchApprovalResult[] = [];
    const uniqueIds = [...new Set(parsed.data.timesheetIds)];

    for (const timesheetId of uniqueIds) {
      try {
        const ts = await db.query.timesheet.findFirst({
          where: eq(timesheet.id, timesheetId),
        });

        if (!ts) {
          results.push({
            timesheetId,
            status: "failed",
            error: "Timesheet não encontrado.",
          });
          continue;
        }

        if (ts.status !== "submitted") {
          results.push({
            timesheetId,
            status: "failed",
            error: "Apenas timesheets submetidos entram na aprovação em lote.",
          });
          continue;
        }

        if (
          actor.role === "manager" &&
          !(await canManageUser(actor, ts.userId))
        ) {
          results.push({
            timesheetId,
            status: "failed",
            error: "Timesheet fora do seu time.",
          });
          continue;
        }

        await db.transaction(async (tx) => {
          await tx
            .update(timesheet)
            .set({
              status: "approved",
              approvedBy: session.user.id,
              approvedAt: new Date(),
              rejectionReason: null,
            })
            .where(eq(timesheet.id, timesheetId));

          await tx
            .update(timeEntry)
            .set({ azdoSyncStatus: "pending" })
            .where(
              and(
                eq(timeEntry.timesheetId, timesheetId),
                isNull(timeEntry.deletedAt),
              ),
            );
        });

        const linkedEntries = await db.query.timeEntry.findMany({
          where: and(
            eq(timeEntry.timesheetId, timesheetId),
            isNull(timeEntry.deletedAt),
          ),
          columns: { azureWorkItemId: true },
        });

        const uniqueWorkItemIds = [
          ...new Set(
            linkedEntries
              .map((entry) => entry.azureWorkItemId)
              .filter((workItemId): workItemId is number => workItemId != null),
          ),
        ];

        for (const workItemId of uniqueWorkItemIds) {
          syncCompletedWorkToAzDO(ts.userId, workItemId);
        }

        try {
          await awardWeekApproval(ts.userId, ts.period, ts.periodType);
        } catch (error: unknown) {
          console.error("[POST /api/hq/approvals/batch] gamification:", error);
        }

        results.push({ timesheetId, status: "approved", error: null });
      } catch (error: unknown) {
        console.error(
          `[POST /api/hq/approvals/batch] timesheet ${timesheetId}:`,
          error,
        );
        results.push({
          timesheetId,
          status: "failed",
          error: "Falha inesperada ao aprovar.",
        });
      }
    }

    const approved = results.filter((item) => item.status === "approved");

    console.info("[hq_batch_approval]", {
      userId: session.user.id,
      requested: uniqueIds.length,
      approved: approved.length,
    });

    return Response.json({
      results,
      approvedCount: approved.length,
      failedCount: results.length - approved.length,
    });
  } catch (error) {
    console.error("[POST /api/hq/approvals/batch]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
