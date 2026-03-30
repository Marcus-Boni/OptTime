import { and, eq, inArray } from "drizzle-orm";
import {
  getActiveSession,
  getActorContext,
  getDirectReportIds,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { timesheet } from "@/lib/db/schema";

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
    const where =
      actor.role === "admin"
        ? eq(timesheet.status, "submitted")
        : await (async () => {
            const directReportIds = await getDirectReportIds(actor.userId);
            if (directReportIds.length === 0) {
              return null;
            }

            return and(
              eq(timesheet.status, "submitted"),
              inArray(timesheet.userId, directReportIds),
            );
          })();

    if (!where) {
      return Response.json({ timesheets: [] });
    }

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
          },
        },
        approver: { columns: { id: true, name: true } },
      },
      orderBy: (ts, { asc }) => [asc(ts.submittedAt)],
    });

    return Response.json({ timesheets: pending });
  } catch (error) {
    console.error("[GET /api/timesheets/approvals]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
