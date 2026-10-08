import {
  canAccessProject,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import {
  applyDayPlanEntries,
  CallAlreadyAppliedError,
  DayLimitError,
} from "@/lib/time-assistant/apply-day-plan";
import { clearCachedSuggestionsByPrefix } from "@/lib/time-assistant/cache";
import { MAX_BACKFILL_DAYS } from "@/lib/time-assistant/limits";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";
import { applyDayPlanSchema } from "@/lib/validations/reconstruct.schema";

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

    const { entryIds, totalMinutes } = await db.transaction((tx) =>
      applyDayPlanEntries(tx, {
        userId: session.user.id,
        date,
        items: items.map((item) => ({
          projectId: item.projectId,
          description: item.description,
          minutes: item.minutes,
          billable: item.billable,
          azureWorkItemId: item.azureWorkItemId,
          azureWorkItemTitle: item.azureWorkItemTitle,
          source: item.source,
          sourceId: item.sourceId,
        })),
      }),
    );
    clearCachedSuggestionsByPrefix(`${session.user.id}:`);

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
      entries: entryIds.length,
      totalMinutes,
    });

    return Response.json(
      {
        created: entryIds.length,
        entryIds,
        totalMinutes,
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof DayLimitError)
      return Response.json({ error: error.message }, { status: 400 });
    if (error instanceof CallAlreadyAppliedError) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    console.error("[POST /api/time-suggestions/reconstruct/apply]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
