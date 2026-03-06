import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timesheet, user } from "@/lib/db/schema";

/**
 * GET - List all submitted timesheets pending approval (manager/admin only).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role as string;
  if (!["manager", "admin"].includes(role)) {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const pending = await db.query.timesheet.findMany({
      where: eq(timesheet.status, "submitted"),
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
