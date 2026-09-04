import { getISOWeek, getISOWeekYear, startOfISOWeek, subWeeks } from "date-fns";
import { and, eq, inArray } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getDirectReportIds,
  getManagedProjectIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { projectMember, timesheet, user } from "@/lib/db/schema";

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

    return Response.json({ timesheets: activePending });
  } catch (error) {
    console.error("[GET /api/timesheets/approvals]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
