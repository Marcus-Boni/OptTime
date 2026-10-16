import { and, asc, desc, eq, gt, gte, isNull, lt, lte, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  project,
  projectMember,
  timeEntry,
  timesheet,
  user,
} from "@/lib/db/schema";
import { validateM2MToken } from "@/lib/integration/auth";
import { ApiError, toErrorResponse } from "@/lib/integration/errors";
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
import {
  assertWeeklyTimesheetDateUnlocked,
  LockedTimesheetPeriodError,
} from "@/lib/time-entry-locks";

const querySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
  userId: z.string().optional(),
  projectId: z.string().optional(),
  projectCode: z.string().optional(),
  projectIntegrationKey: z.string().optional(),
  externalId: z.string().optional(),
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
  externalId: string | null;
  source: string;
  userId: string;
  userEmail: string;
  projectId: string;
  projectCode: string;
  projectIntegrationKey: string | null;
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
      projectIntegrationKey,
      externalId,
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
    if (projectIntegrationKey)
      conditions.push(eq(project.integrationKey, projectIntegrationKey));
    if (externalId) conditions.push(eq(timeEntry.externalId, externalId));
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
        externalId: timeEntry.externalId,
        source: timeEntry.source,
        userId: timeEntry.userId,
        projectId: timeEntry.projectId,
        description: timeEntry.description,
        date: timeEntry.date,
        duration: timeEntry.duration,
        billable: timeEntry.billable,
        createdAt: timeEntry.createdAt,
        userEmail: user.email,
        projectCode: project.code,
        projectIntegrationKey: project.integrationKey,
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
      externalId: r.externalId,
      source: r.source,
      userId: r.userId,
      userEmail: r.userEmail,
      projectId: r.projectId,
      projectCode: r.projectCode,
      projectIntegrationKey: r.projectIntegrationKey,
      date: r.date,
      durationMinutes: r.duration,
      billable: r.billable,
      status: deriveStatus(r.timesheetStatus ?? null),
      description: r.description,
      createdAt: new Date(r.createdAt).toISOString(),
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

const createV1TimeEntrySchema = z.object({
  email: z.string().trim().email("invalid email format"),
  projectIntegrationKey: z
    .string()
    .trim()
    .min(1, "projectIntegrationKey is required"),
  externalId: z
    .string()
    .trim()
    .min(1, "externalId must not be empty")
    .max(255, "externalId must be at most 255 characters")
    .optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD"),
  description: z.string().trim().min(1, "description must not be empty"),
  durationMinutes: z.number().int().min(1).optional(),
  billable: z.boolean().optional(),
});

export async function POST(req: Request): Promise<Response> {
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

    requireScope(ctx.scopes, SCOPES.WRITE);

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload", 400);
    }

    const parsed = createV1TimeEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Validation failed",
        400,
        parsed.error.flatten(),
      );
    }

    const data = parsed.data;

    // Idempotency: replay existing time entry if externalId was already processed
    if (data.externalId) {
      const existingByExternalId = await db.query.timeEntry.findFirst({
        where: and(
          eq(timeEntry.externalId, data.externalId),
          isNull(timeEntry.deletedAt),
        ),
        with: {
          project: true,
          user: true,
          timesheet: true,
        },
      });

      if (existingByExternalId) {
        const existingDto: TimeEntryDTO = {
          id: existingByExternalId.id,
          externalId: existingByExternalId.externalId,
          source: existingByExternalId.source,
          userId: existingByExternalId.userId,
          userEmail: existingByExternalId.user.email,
          projectId: existingByExternalId.projectId,
          projectCode: existingByExternalId.project.code,
          projectIntegrationKey: existingByExternalId.project.integrationKey,
          date: existingByExternalId.date,
          durationMinutes: existingByExternalId.duration,
          billable: existingByExternalId.billable,
          status: deriveStatus(existingByExternalId.timesheet?.status ?? null),
          description: existingByExternalId.description,
          createdAt: new Date(existingByExternalId.createdAt).toISOString(),
        };

        logRequest({
          requestId,
          clientId,
          route: "POST /api/v1/time-entries (idempotent replay)",
          durationMs: Date.now() - start,
          status: 200,
        });

        return Response.json(
          { data: existingDto },
          {
            status: 200,
            headers: {
              "X-Request-Id": requestId,
              ...getRateLimitHeaders(clientId),
            },
          },
        );
      }
    }

    // Validate targetUser exists and is active
    const targetUser = await db.query.user.findFirst({
      where: and(eq(user.email, data.email), eq(user.isActive, true)),
    });

    if (!targetUser) {
      throw new ApiError(
        "NOT_FOUND",
        `User with email ${data.email} not found or inactive`,
        404,
      );
    }

    // Check Timesheet Lock for targetUser and entry date (returns 409 if week is closed)
    try {
      await assertWeeklyTimesheetDateUnlocked(targetUser.id, data.date);
    } catch (err) {
      if (err instanceof LockedTimesheetPeriodError) {
        throw new ApiError("LOCKED_PERIOD", err.message, 409);
      }
      throw err;
    }

    // Validate targetProject exists and is active/open
    const targetProject = await db.query.project.findFirst({
      where: and(
        eq(project.integrationKey, data.projectIntegrationKey),
        or(eq(project.status, "open"), eq(project.status, "active")),
      ),
    });

    if (!targetProject) {
      throw new ApiError(
        "VALIDATION_ERROR",
        `Project with integrationKey ${data.projectIntegrationKey} not found or inactive`,
        400,
      );
    }

    // Access control: If user is a member, they must be part of the project members list
    if (targetUser.role === "member") {
      const membership = await db.query.projectMember.findFirst({
        where: and(
          eq(projectMember.projectId, targetProject.id),
          eq(projectMember.userId, targetUser.id),
        ),
      });

      if (!membership) {
        throw new ApiError(
          "FORBIDDEN",
          "User does not have access to this project",
          403,
        );
      }
    }

    // Default duration and billable preference values
    const duration =
      data.durationMinutes ?? targetUser.timeDefaultDuration ?? 60;
    const billable =
      data.billable ??
      targetUser.timeDefaultBillable ??
      targetProject.billable ??
      true;

    const id = crypto.randomUUID();
    const [entry] = await db
      .insert(timeEntry)
      .values({
        id,
        externalId: data.externalId ?? null,
        source: "opt-rh",
        userId: targetUser.id,
        projectId: targetProject.id,
        description: data.description,
        date: data.date,
        duration,
        billable,
        azdoSyncStatus: "none",
      })
      .returning();

    const dto: TimeEntryDTO = {
      id: entry.id,
      externalId: entry.externalId,
      source: entry.source,
      userId: entry.userId,
      userEmail: targetUser.email,
      projectId: entry.projectId,
      projectCode: targetProject.code,
      projectIntegrationKey: targetProject.integrationKey,
      date: entry.date,
      durationMinutes: entry.duration,
      billable: entry.billable,
      status: "draft",
      description: entry.description,
      createdAt: new Date(entry.createdAt).toISOString(),
    };

    logRequest({
      requestId,
      clientId,
      route: "POST /api/v1/time-entries",
      durationMs: Date.now() - start,
      status: 201,
    });

    return Response.json(
      { data: dto },
      {
        status: 201,
        headers: {
          "X-Request-Id": requestId,
          ...getRateLimitHeaders(clientId),
        },
      },
    );
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId,
      route: "POST /api/v1/time-entries",
      durationMs: Date.now() - start,
      status: error instanceof ApiError ? error.status : 500,
    });
    return toErrorResponse(error, requestId);
  }
}
