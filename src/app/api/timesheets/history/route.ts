import { and, desc, eq, inArray, or } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getDirectReportIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { timesheet } from "@/lib/db/schema";

/**
 * GET /api/timesheets/history
 * Returns approved and rejected timesheets within the actor's scope.
 * Admin → all users. Manager → direct reports only.
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
    const statusFilter = or(
      eq(timesheet.status, "approved"),
      eq(timesheet.status, "rejected"),
    );

    const where =
      actor.role === "admin"
        ? statusFilter
        : await (async () => {
            const directReportIds = await getDirectReportIds(actor.userId);
            if (directReportIds.length === 0) return null;
            return and(
              statusFilter,
              inArray(timesheet.userId, directReportIds),
            );
          })();

    if (!where) {
      return Response.json({ timesheets: [] });
    }

    const timesheets = await db.query.timesheet.findMany({
      where,
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            image: true,
            department: true,
          },
        },
        approver: { columns: { id: true, name: true } },
      },
      orderBy: (ts, { desc: d }) => [d(ts.approvedAt), d(ts.period)],
    });

    return Response.json({ timesheets });
  } catch (error) {
    console.error("[GET /api/timesheets/history]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
