import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { project, timeEntry, timesheet, user } from "@/lib/db/schema";
import { validateM2MToken } from "@/lib/integration/auth";
import { ApiError, toErrorResponse } from "@/lib/integration/errors";
import { createRequestId, logRequest } from "@/lib/integration/logger";
import {
  checkRateLimit,
  getRateLimitHeaders,
} from "@/lib/integration/rate-limit";
import { requireScope, SCOPES } from "@/lib/integration/scopes";

type EntryStatus = "draft" | "submitted" | "approved" | "rejected";

type TimeEntryDTO = {
  id: string;
  userId: string;
  userEmail: string;
  projectId: string;
  projectCode: string;
  date: string;
  durationMinutes: number;
  billable: boolean;
  status: EntryStatus;
  description: string;
  createdAt: string;
};

function deriveStatus(timesheetStatus: string | null): EntryStatus {
  if (!timesheetStatus || timesheetStatus === "open") return "draft";
  if (
    timesheetStatus === "submitted" ||
    timesheetStatus === "approved" ||
    timesheetStatus === "rejected"
  ) {
    return timesheetStatus;
  }
  return "draft";
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = createRequestId(req);
  const start = Date.now();
  let clientId = "unknown";

  try {
    const ctx = await validateM2MToken(req);
    clientId = ctx.clientId;

    const rlHeaders = getRateLimitHeaders(clientId);
    if (!checkRateLimit(clientId)) {
      return Response.json(
        {
          error: {
            code: "RATE_LIMITED",
            message: "Too many requests",
            details: null,
          },
        },
        { status: 429, headers: { ...rlHeaders, "X-Request-Id": requestId } },
      );
    }

    requireScope(ctx.scopes, SCOPES.READ);

    const { id } = await params;

    const [row] = await db
      .select({
        id: timeEntry.id,
        userId: timeEntry.userId,
        projectId: timeEntry.projectId,
        description: timeEntry.description,
        date: timeEntry.date,
        duration: timeEntry.duration,
        billable: timeEntry.billable,
        createdAt: timeEntry.createdAt,
        userEmail: user.email,
        projectCode: project.code,
        timesheetStatus: timesheet.status,
      })
      .from(timeEntry)
      .innerJoin(user, eq(timeEntry.userId, user.id))
      .innerJoin(project, eq(timeEntry.projectId, project.id))
      .leftJoin(timesheet, eq(timeEntry.timesheetId, timesheet.id))
      .where(and(eq(timeEntry.id, id), isNull(timeEntry.deletedAt)))
      .limit(1);

    if (!row) {
      throw new ApiError("NOT_FOUND", "Time entry not found", 404);
    }

    const dto: TimeEntryDTO = {
      id: row.id,
      userId: row.userId,
      userEmail: row.userEmail,
      projectId: row.projectId,
      projectCode: row.projectCode,
      date: row.date,
      durationMinutes: row.duration,
      billable: row.billable,
      status: deriveStatus(row.timesheetStatus ?? null),
      description: row.description,
      createdAt: row.createdAt.toISOString(),
    };

    logRequest({
      requestId,
      clientId,
      route: `GET /api/v1/time-entries/${id}`,
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(dto, {
      headers: {
        "Cache-Control": "private, max-age=30",
        ETag: `"te-${row.id}"`,
        "X-Request-Id": requestId,
        ...getRateLimitHeaders(clientId),
      },
    });
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/time-entries/[id]",
      durationMs: Date.now() - start,
      status: 500,
    });
    return toErrorResponse(error, requestId);
  }
}
