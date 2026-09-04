import { getISOWeek, getISOWeekYear, startOfISOWeek, subWeeks } from "date-fns";
import { and, eq, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getDirectReportIds,
  getManagedProjectIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { projectMember, timeEntry, timesheet, user } from "@/lib/db/schema";
import { getPeriodRange } from "@/lib/utils";

const APPROVAL_QUEUE_STATUSES = ["submitted", "open", "rejected"];
const UNSUBMITTED_WEEKS_LOOKBACK = 4;

function getRecentWeeklyPeriods(): string[] {
  const currentWeekStart = startOfISOWeek(new Date());
  return Array.from({ length: UNSUBMITTED_WEEKS_LOOKBACK }, (_, index) => {
    const weekDate = subWeeks(currentWeekStart, index);
    return `${getISOWeekYear(weekDate)}-W${getISOWeek(weekDate).toString().padStart(2, "0")}`;
  });
}

async function getApprovalUserIds(actor: ReturnType<typeof getActorContext>) {
  if (actor.role === "admin") {
    const users = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.isActive, true));
    return users.map((person) => person.id);
  }

  const directReportIds = await getDirectReportIds(actor.userId);
  const managedProjectIds = (await getManagedProjectIds(actor)) ?? [];

  let memberIds: string[] = [];
  if (managedProjectIds.length > 0) {
    const members = await db.query.projectMember.findMany({
      where: inArray(projectMember.projectId, managedProjectIds),
      columns: { userId: true },
    });
    memberIds = members.map((m) => m.userId);
  }

  const candidateIds = Array.from(new Set([...directReportIds, ...memberIds]));
  if (candidateIds.length === 0) return [];

  const activeUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.id, candidateIds), eq(user.isActive, true)));

  return activeUsers.map((person) => person.id);
}

async function ensureRecentUnsubmittedWeeks(userIds: string[]) {
  if (userIds.length === 0) return;

  const periods = getRecentWeeklyPeriods();
  await db
    .insert(timesheet)
    .values(
      userIds.flatMap((userId) =>
        periods.map((period) => ({
          id: crypto.randomUUID(),
          userId,
          period,
          periodType: "weekly",
        })),
      ),
    )
    .onConflictDoNothing({
      target: [timesheet.userId, timesheet.period],
    });
}

/**
 * GET - List submitted timesheets pending approval inside the actor scope.
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
    const scopedUserIds = await getApprovalUserIds(actor);
    if (scopedUserIds.length === 0) {
      return Response.json({ timesheets: [] });
    }

    await ensureRecentUnsubmittedWeeks(scopedUserIds);

    const statusFilter = inArray(timesheet.status, APPROVAL_QUEUE_STATUSES);
    const where = and(statusFilter, inArray(timesheet.userId, scopedUserIds));

    const pending = await db.query.timesheet.findMany({
      where,
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
            department: true,
            isActive: true,
          },
        },
        approver: { columns: { id: true, name: true } },
      },
      orderBy: (ts, { desc, asc }) => [desc(ts.period), asc(ts.submittedAt)],
    });

    const activePending = pending.filter(
      (ts) => Boolean(ts.user) && ts.user?.isActive !== false,
    );

    // Enriquecer timesheets em aberto ou rejeitados com os totais de horas das entradas
    const openOrRejected = activePending.filter(
      (ts) => ts.status === "open" || ts.status === "rejected",
    );

    if (openOrRejected.length > 0) {
      const periodMap = new Map<
        string,
        {
          period: string;
          periodType: string;
          userIds: string[];
          timesheetIds: string[];
        }
      >();

      for (const ts of openOrRejected) {
        const key = `${ts.period}:${ts.periodType}`;
        const existing = periodMap.get(key);
        if (existing) {
          existing.userIds.push(ts.userId);
          existing.timesheetIds.push(ts.id);
        } else {
          periodMap.set(key, {
            period: ts.period,
            periodType: ts.periodType,
            userIds: [ts.userId],
            timesheetIds: [ts.id],
          });
        }
      }

      const totalsMap = new Map<
        string,
        { totalMinutes: number; billableMinutes: number }
      >();

      await Promise.all(
        Array.from(periodMap.values()).map(async (group) => {
          try {
            const { start, end } = getPeriodRange(
              group.period,
              group.periodType,
            );
            const uniqueUserIds = [...new Set(group.userIds)];
            const uniqueTsIds = [...new Set(group.timesheetIds)];

            const rows = await db
              .select({
                userId: timeEntry.userId,
                totalMinutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)`,
                billableMinutes: sql<number>`COALESCE(SUM(CASE WHEN ${timeEntry.billable} THEN ${timeEntry.duration} ELSE 0 END), 0)`,
              })
              .from(timeEntry)
              .where(
                and(
                  inArray(timeEntry.userId, uniqueUserIds),
                  gte(timeEntry.date, start),
                  lte(timeEntry.date, end),
                  isNull(timeEntry.deletedAt),
                  or(
                    isNull(timeEntry.timesheetId),
                    inArray(timeEntry.timesheetId, uniqueTsIds),
                  ),
                ),
              )
              .groupBy(timeEntry.userId);

            for (const row of rows) {
              totalsMap.set(`${row.userId}:${group.period}`, {
                totalMinutes: Number(row.totalMinutes || 0),
                billableMinutes: Number(row.billableMinutes || 0),
              });
            }
          } catch (err) {
            console.error(
              "[GET /api/timesheets/approvals] enrich period error:",
              err,
            );
          }
        }),
      );

      const enrichedPending = activePending.map((ts) => {
        if (ts.status === "open" || ts.status === "rejected") {
          const totals = totalsMap.get(`${ts.userId}:${ts.period}`);
          return {
            ...ts,
            totalMinutes: totals?.totalMinutes ?? ts.totalMinutes,
            billableMinutes: totals?.billableMinutes ?? ts.billableMinutes,
          };
        }
        return ts;
      });

      return Response.json({ timesheets: enrichedPending });
    }

    return Response.json({ timesheets: activePending });
  } catch (error) {
    console.error("[GET /api/timesheets/approvals]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
