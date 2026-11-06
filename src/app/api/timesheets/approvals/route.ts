import { eachDayOfInterval, isWeekend, subWeeks } from "date-fns";
import { and, gte, inArray, isNull, lte, or, sql } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getApprovalScopeUserIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { timeEntry, timesheet } from "@/lib/db/schema";
import { getWeekSegments } from "@/lib/timesheet-periods";
import { todayInAppTimeZone } from "@/lib/timezone";
import { getPeriodRange, getWeekPeriod, parseLocalDate } from "@/lib/utils";

const APPROVAL_QUEUE_STATUSES = ["submitted", "open", "rejected"];
const UNSUBMITTED_WEEKS_LOOKBACK = 4;

function segmentHasWeekday(start: string, end: string): boolean {
  try {
    const days = eachDayOfInterval({
      start: parseLocalDate(start),
      end: parseLocalDate(end),
    });
    return days.some((day) => !isWeekend(day));
  } catch {
    return true;
  }
}

/**
 * Timesheet keys of the recent weeks. A week that crosses a month boundary
 * contributes one key per month, and slices that have not started yet or only
 * cover weekend days are left out so the queue never provisions empty noise.
 */
function getRecentWeeklyPeriods(): string[] {
  const today = todayInAppTimeZone();
  const todayDate = parseLocalDate(today);
  return Array.from({ length: UNSUBMITTED_WEEKS_LOOKBACK }, (_, index) =>
    getWeekSegments(getWeekPeriod(subWeeks(todayDate, index))),
  )
    .flat()
    .filter(
      (segment) =>
        segment.start <= today && segmentHasWeekday(segment.start, segment.end),
    )
    .map((segment) => segment.period);
}

async function ensureRecentUnsubmittedWeeks(userIds: string[]) {
  if (userIds.length === 0) return;

  const periods = getRecentWeeklyPeriods();
  if (periods.length === 0) return;

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
 * GET - List timesheets pending approval inside the actor scope.
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
    const scopedUserIds = await getApprovalScopeUserIds(actor);
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

    const today = todayInAppTimeZone();

    const activePending = pending.filter((ts) => {
      if (!ts.user || ts.user.isActive === false) return false;
      try {
        const { start } = getPeriodRange(ts.period, ts.periodType);
        // Never surface periods that have not started yet in the approval queue
        if (start > today) return false;
      } catch {
        return false;
      }
      return true;
    });

    // Enriquecer timesheets em aberto ou rejeitados com os totais de horas das entradas
    const openOrRejected = activePending.filter(
      (ts) => ts.status === "open" || ts.status === "rejected",
    );

    let enrichedPending = activePending;

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

      enrichedPending = activePending.map((ts) => {
        if (ts.status === "open" || ts.status === "rejected") {
          const totals = totalsMap.get(`${ts.userId}:${ts.period}`);
          return {
            ...ts,
            totalMinutes: totals?.totalMinutes ?? 0,
            billableMinutes: totals?.billableMinutes ?? 0,
          };
        }
        return ts;
      });
    }

    // Only surface unsubmitted ("open") timesheets in the approval queue when
    // the collaborator actually logged hours in that period (totalMinutes > 0).
    // Empty "open" periods (especially split-week slices with 0h) have nothing
    // to approve and would prematurely lock the period if approved.
    const actionablePending = enrichedPending.filter(
      (ts) => ts.status !== "open" || ts.totalMinutes > 0,
    );

    return Response.json({ timesheets: actionablePending });
  } catch (error) {
    console.error("[GET /api/timesheets/approvals]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
