import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { and, eq, inArray, isNull } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getScopedUserIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { timeEntry, timesheet } from "@/lib/db/schema";
import {
  type AnomalyEntryInput,
  detectTimesheetAnomalies,
  isConformant,
} from "@/lib/hq/anomalies";
import { getPeriodRange, parseLocalDate } from "@/lib/utils";
import type { ApprovalInsight, HqApprovalsResponse } from "@/types/hq";

function buildPeriodLabel(period: string, periodType: string): string {
  try {
    const { start, end } = getPeriodRange(period, periodType);

    if (periodType === "monthly") {
      return format(parseLocalDate(start), "MMMM yyyy", { locale: ptBR });
    }

    const weekNumber = period.split("-W")[1] ?? "";
    const startLabel = format(parseLocalDate(start), "d MMM", { locale: ptBR });
    const endLabel = format(parseLocalDate(end), "d MMM", { locale: ptBR });
    return `Semana ${weekNumber} · ${startLabel} – ${endLabel}`;
  } catch {
    return period;
  }
}

/**
 * GET - Approval Center insights.
 *
 * Every submitted timesheet in the actor's scope, enriched with rule-based
 * anomaly findings. Conformant timesheets (no warnings) are eligible for the
 * one-click batch approval.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const scopedUserIds = await getScopedUserIds(actor);

    if (scopedUserIds !== null && scopedUserIds.length === 0) {
      const empty: HqApprovalsResponse = {
        generatedAt: new Date().toISOString(),
        pending: [],
        totals: {
          pending: 0,
          conformant: 0,
          withAnomalies: 0,
          totalMinutes: 0,
        },
      };
      return Response.json(empty);
    }

    const timesheetWhere =
      scopedUserIds === null
        ? eq(timesheet.status, "submitted")
        : and(
            eq(timesheet.status, "submitted"),
            inArray(timesheet.userId, scopedUserIds),
          );

    const pendingTimesheets = await db.query.timesheet.findMany({
      where: timesheetWhere,
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            image: true,
            weeklyCapacity: true,
            isActive: true,
          },
        },
        entries: {
          where: isNull(timeEntry.deletedAt),
          columns: {
            id: true,
            date: true,
            duration: true,
            description: true,
            projectId: true,
            azureWorkItemId: true,
            billable: true,
            createdAt: true,
          },
          with: {
            project: {
              columns: {
                id: true,
                name: true,
                color: true,
                azureProjectId: true,
              },
            },
          },
        },
      },
      orderBy: (fields, { asc }) => [asc(fields.submittedAt)],
    });

    const activePendingTimesheets = pendingTimesheets.filter(
      (ts) => Boolean(ts.user) && ts.user?.isActive !== false,
    );

    const insights: ApprovalInsight[] = activePendingTimesheets.map((ts) => {
      const anomalyEntries: AnomalyEntryInput[] = ts.entries.map((entry) => ({
        id: entry.id,
        date: entry.date,
        duration: entry.duration,
        description: entry.description,
        projectId: entry.projectId,
        azureWorkItemId: entry.azureWorkItemId,
        projectHasAzure: Boolean(entry.project?.azureProjectId),
        createdAt: entry.createdAt,
      }));

      const anomalies = detectTimesheetAnomalies({
        entries: anomalyEntries,
        weeklyCapacityMinutes: (ts.user?.weeklyCapacity ?? 40) * 60,
      });

      const minutesByProject = new Map<
        string,
        { name: string; color: string; minutes: number }
      >();
      for (const entry of ts.entries) {
        const key = entry.projectId;
        const bucket = minutesByProject.get(key) ?? {
          name: entry.project?.name ?? "Projeto",
          color: entry.project?.color ?? "#6366f1",
          minutes: 0,
        };
        bucket.minutes += entry.duration;
        minutesByProject.set(key, bucket);
      }

      return {
        timesheetId: ts.id,
        userId: ts.userId,
        userName: ts.user?.name ?? "Colaborador",
        userImage: ts.user?.image ?? null,
        period: ts.period,
        periodLabel: buildPeriodLabel(ts.period, ts.periodType),
        totalMinutes: ts.totalMinutes,
        billableMinutes: ts.billableMinutes,
        entryCount: ts.entries.length,
        submittedAt: ts.submittedAt?.toISOString() ?? null,
        projects: [...minutesByProject.values()].sort(
          (a, b) => b.minutes - a.minutes,
        ),
        anomalies,
        conformant: isConformant(anomalies),
      };
    });

    // Managers cannot approve their own timesheet — keep it out of the queue.
    const actionable =
      actor.role === "admin"
        ? insights
        : insights.filter((insight) => insight.userId !== actor.userId);

    const payload: HqApprovalsResponse = {
      generatedAt: new Date().toISOString(),
      pending: actionable,
      totals: {
        pending: actionable.length,
        conformant: actionable.filter((insight) => insight.conformant).length,
        withAnomalies: actionable.filter((insight) => !insight.conformant)
          .length,
        totalMinutes: actionable.reduce(
          (sum, insight) => sum + insight.totalMinutes,
          0,
        ),
      },
    };

    return Response.json(payload);
  } catch (error) {
    console.error("[GET /api/hq/approvals]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
