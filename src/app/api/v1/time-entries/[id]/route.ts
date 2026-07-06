import { and, eq, isNull, or } from "drizzle-orm";
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
  checkRateLimit,
  getRateLimitHeaders,
} from "@/lib/integration/rate-limit";
import { requireScope, SCOPES } from "@/lib/integration/scopes";
import {
  assertWeeklyTimesheetDateUnlocked,
  LockedTimesheetPeriodError,
} from "@/lib/time-entry-locks";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";

type EntryStatus = "draft" | "submitted" | "approved" | "rejected";

type TimeEntryDTO = {
  id: string;
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
        projectIntegrationKey: project.integrationKey,
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
      projectIntegrationKey: row.projectIntegrationKey,
      date: row.date,
      durationMinutes: row.duration,
      billable: row.billable,
      status: deriveStatus(row.timesheetStatus ?? null),
      description: row.description,
      createdAt: new Date(row.createdAt).toISOString(),
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

const updateV1TimeEntrySchema = z.object({
  email: z.string().trim().email("invalid email format").optional(),
  projectIntegrationKey: z
    .string()
    .trim()
    .min(1, "projectIntegrationKey cannot be empty")
    .optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "must be YYYY-MM-DD")
    .optional(),
  description: z
    .string()
    .trim()
    .min(1, "description cannot be empty")
    .optional(),
  durationMinutes: z.number().int().min(1).optional(),
  billable: z.boolean().optional(),
});

export async function PUT(
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

    requireScope(ctx.scopes, SCOPES.WRITE);

    const { id } = await params;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      throw new ApiError("VALIDATION_ERROR", "Invalid JSON payload", 400);
    }

    const parsed = updateV1TimeEntrySchema.safeParse(body);
    if (!parsed.success) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Validation failed",
        400,
        parsed.error.flatten(),
      );
    }

    const data = parsed.data;

    // 1. Fetch existing time entry
    const existing = await db.query.timeEntry.findFirst({
      where: and(eq(timeEntry.id, id), isNull(timeEntry.deletedAt)),
    });

    if (!existing) {
      throw new ApiError("NOT_FOUND", "Time entry not found", 404);
    }

    // 2. Resolve target user (either updated or existing owner)
    let targetUser = await db.query.user.findFirst({
      where: eq(user.id, existing.userId),
    });

    if (data.email) {
      const newUser = await db.query.user.findFirst({
        where: and(eq(user.email, data.email), eq(user.isActive, true)),
      });

      if (!newUser) {
        throw new ApiError(
          "VALIDATION_ERROR",
          `User with email ${data.email} not found or inactive`,
          400,
        );
      }
      targetUser = newUser;
    }

    if (!targetUser || !targetUser.isActive) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Owner of this time entry is inactive or not found",
        400,
      );
    }

    // 3. Resolve target project (either updated or existing project)
    let targetProject = await db.query.project.findFirst({
      where: eq(project.id, existing.projectId),
    });

    if (data.projectIntegrationKey) {
      const newProject = await db.query.project.findFirst({
        where: and(
          eq(project.integrationKey, data.projectIntegrationKey),
          or(eq(project.status, "open"), eq(project.status, "active")),
        ),
      });

      if (!newProject) {
        throw new ApiError(
          "VALIDATION_ERROR",
          `Project with integrationKey ${data.projectIntegrationKey} not found or inactive`,
          400,
        );
      }
      targetProject = newProject;
    }

    if (
      !targetProject ||
      (targetProject.status !== "open" && targetProject.status !== "active")
    ) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Project is inactive or archived",
        400,
      );
    }

    // 4. Access control: If targetUser is a member, verify project members list association
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

    // 5. Check Timesheet Locks
    try {
      await assertWeeklyTimesheetDateUnlocked(existing.userId, existing.date);

      const nextUserId = targetUser.id;
      const nextDate = data.date ?? existing.date;

      if (nextUserId !== existing.userId || nextDate !== existing.date) {
        await assertWeeklyTimesheetDateUnlocked(nextUserId, nextDate);
      }
    } catch (err) {
      if (err instanceof LockedTimesheetPeriodError) {
        throw new ApiError("VALIDATION_ERROR", err.message, 409);
      }
      throw err;
    }

    // 6. Handle Azure DevOps sync trigger if duration changes
    const durationChanged =
      data.durationMinutes !== undefined &&
      data.durationMinutes !== existing.duration;
    const shouldSyncCompletedWork =
      durationChanged && !!existing.azureWorkItemId;
    const nextAzdoSyncStatus = shouldSyncCompletedWork
      ? "pending"
      : existing.azdoSyncStatus;

    // 7. Update database
    const [entry] = await db
      .update(timeEntry)
      .set({
        userId: targetUser.id,
        projectId: targetProject.id,
        description:
          data.description !== undefined
            ? data.description
            : existing.description,
        date: data.date !== undefined ? data.date : existing.date,
        duration:
          data.durationMinutes !== undefined
            ? data.durationMinutes
            : existing.duration,
        billable:
          data.billable !== undefined ? data.billable : existing.billable,
        azdoSyncStatus: nextAzdoSyncStatus,
      })
      .where(eq(timeEntry.id, id))
      .returning();

    if (shouldSyncCompletedWork && existing.azureWorkItemId) {
      triggerCompletedWorkSync(targetUser.id, [existing.azureWorkItemId]);
    }

    const dto: TimeEntryDTO = {
      id: entry.id,
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
      route: `PUT /api/v1/time-entries/${id}`,
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(
      { data: dto },
      {
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
      route: "PUT /api/v1/time-entries/[id]",
      durationMs: Date.now() - start,
      status: error instanceof ApiError ? error.status : 500,
    });
    return toErrorResponse(error, requestId);
  }
}
