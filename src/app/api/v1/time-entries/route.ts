import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { project, timeEntry, timesheet, user } from "@/lib/db/schema";
import { validateM2MToken } from "@/lib/integration/auth";
import { toErrorResponse } from "@/lib/integration/errors";
import { createRequestId, logRequest } from "@/lib/integration/logger";
import {
  buildPage,
  decodeCursor,
  parseLimit,
} from "@/lib/integration/pagination";
import {
  checkRateLimit,
  getRateLimitHeaders,
} from "@/lib/integration/rate-limit";
import { requireScope, SCOPES } from "@/lib/integration/scopes";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
  userId: z.string().optional(),
  projectId: z.string().optional(),
  projectCode: z.string().optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  status: z.enum(["draft", "submitted", "approved", "rejected"]).optional(),
  billable: z.enum(["true", "false"]).optional(),
});

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

export async function GET(req: Request): Promise<Response> {
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

    const { searchParams } = new URL(req.url);
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid query parameters",
            details: parsed.error.flatten(),
          },
        },
        { status: 400, headers: { "X-Request-Id": requestId } },
      );
    }

    const {
      cursor,
      limit: limitStr,
      userId,
      projectId,
      projectCode,
      from,
      to,
      status,
      billable,
    } = parsed.data;
    const limit = parseLimit(limitStr ?? null);

    const conditions = [isNull(timeEntry.deletedAt)];

    if (userId) conditions.push(eq(timeEntry.userId, userId));
    if (projectId) conditions.push(eq(timeEntry.projectId, projectId));
    if (projectCode) conditions.push(eq(project.code, projectCode));
    if (from) conditions.push(gte(timeEntry.date, from));
    if (to) conditions.push(lte(timeEntry.date, to));
    if (billable !== undefined)
      conditions.push(eq(timeEntry.billable, billable === "true"));

    // Filter by derived status at DB level via timesheet join
    if (status === "draft") {
      const draftCond = or(
        isNull(timeEntry.timesheetId),
        eq(timesheet.status, "open"),
      );
      if (draftCond) conditions.push(draftCond);
    } else if (status) {
      conditions.push(eq(timesheet.status, status));
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        const cursorTs = new Date(decoded.createdAt);
        const cursorCond = or(
          lt(timeEntry.createdAt, cursorTs),
          and(eq(timeEntry.createdAt, cursorTs), gt(timeEntry.id, decoded.id)),
        );
        if (cursorCond) conditions.push(cursorCond);
      }
    }

    const rows = await db
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
      .where(and(...conditions))
      .orderBy(desc(timeEntry.createdAt), asc(timeEntry.id))
      .limit(limit + 1);

    const { data, nextCursor } = buildPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => r.id,
    );

    const dtos: TimeEntryDTO[] = data.map((r) => ({
      id: r.id,
      userId: r.userId,
      userEmail: r.userEmail,
      projectId: r.projectId,
      projectCode: r.projectCode,
      date: r.date,
      durationMinutes: r.duration,
      billable: r.billable,
      status: deriveStatus(r.timesheetStatus ?? null),
      description: r.description,
      createdAt: r.createdAt.toISOString(),
    }));

    const rlHeadersFinal = getRateLimitHeaders(clientId);
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/time-entries",
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(
      { data: dtos, nextCursor },
      {
        headers: {
          "Cache-Control": "private, max-age=30",
          ETag: `"te-${Date.now()}"`,
          "X-Request-Id": requestId,
          ...rlHeadersFinal,
        },
      },
    );
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/time-entries",
      durationMs: Date.now() - start,
      status: 500,
    });
    return toErrorResponse(error, requestId);
  }
}
