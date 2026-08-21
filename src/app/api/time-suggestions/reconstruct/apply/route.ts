import { and, eq, isNull, sql } from "drizzle-orm";
import {
  canAccessProject,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { timeEntry, timeSuggestionFeedback } from "@/lib/db/schema";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";
import { applyDayPlanSchema } from "@/lib/validations/reconstruct.schema";

const MAX_DAY_MINUTES = 24 * 60;
const MAX_BACKFILL_DAYS = 30;

/**
 * POST - Applies an edited "Preencher meu dia" plan: creates every accepted
 * item as a time entry in one transaction and records acceptance feedback so
 * the suggestion engine keeps learning.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = applyDayPlanSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { date, items } = parsed.data;
    const today = todayInAppTimeZone();

    if (date > today) {
      return Response.json(
        { error: "Não é possível lançar horas em um dia futuro." },
        { status: 400 },
      );
    }

    if (date < shiftDay(today, -MAX_BACKFILL_DAYS)) {
      return Response.json(
        { error: "Lançamentos limitados aos últimos 30 dias." },
        { status: 400 },
      );
    }

    const lockStatus = await getWeeklyTimesheetStatusForDate(
      session.user.id,
      date,
    );
    if (lockStatus.locked) {
      return Response.json(
        { error: "Esse dia pertence a um timesheet já submetido ou aprovado." },
        { status: 409 },
      );
    }

    const actor = getActorContext(session.user);
    const uniqueProjectIds = [...new Set(items.map((item) => item.projectId))];

    for (const projectId of uniqueProjectIds) {
      if (!(await canAccessProject(actor, projectId))) {
        return Response.json(
          { error: "Você não tem acesso a um dos projetos do plano." },
          { status: 403 },
        );
      }
    }

    const [existingTotals] = await db
      .select({
        minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, session.user.id),
          eq(timeEntry.date, date),
          isNull(timeEntry.deletedAt),
        ),
      );

    const newMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
    if (Number(existingTotals?.minutes ?? 0) + newMinutes > MAX_DAY_MINUTES) {
      return Response.json(
        { error: "O total do dia ultrapassaria 24 horas." },
        { status: 400 },
      );
    }

    const createdIds = await db.transaction(async (tx) => {
      const ids: string[] = [];

      for (const item of items) {
        const id = crypto.randomUUID();
        ids.push(id);

        await tx.insert(timeEntry).values({
          id,
          userId: session.user.id,
          projectId: item.projectId,
          description: item.description.trim(),
          date,
          duration: item.minutes,
          billable: item.billable,
          azureWorkItemId: item.azureWorkItemId ?? null,
          azureWorkItemTitle: item.azureWorkItemTitle ?? null,
          azdoSyncStatus: item.azureWorkItemId ? "pending" : "none",
        });

        await tx.insert(timeSuggestionFeedback).values({
          id: crypto.randomUUID(),
          userId: session.user.id,
          date,
          suggestionFingerprint: `reconstruct:${date}:${item.projectId}:${item.source}`,
          action: "accepted",
          editedFields: null,
          sourceBreakdown: JSON.stringify({
            source: item.source,
            minutes: item.minutes,
            reconstruct: true,
          }),
          score: null,
        });
      }

      return ids;
    });

    const workItemIds = [
      ...new Set(
        items
          .map((item) => item.azureWorkItemId)
          .filter((id): id is number => id != null),
      ),
    ];

    if (workItemIds.length > 0) {
      triggerCompletedWorkSync(session.user.id, workItemIds);
    }

    console.info("[reconstruct_apply]", {
      userId: session.user.id,
      date,
      entries: createdIds.length,
      totalMinutes: newMinutes,
    });

    return Response.json(
      {
        created: createdIds.length,
        entryIds: createdIds,
        totalMinutes: newMinutes,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("[POST /api/time-suggestions/reconstruct/apply]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
