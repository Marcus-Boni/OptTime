import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { project } from "@/lib/db/schema";
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
  status: z.enum(["open", "active", "archived", "completed"]).optional(),
});

type ProjectDTO = {
  id: string;
  name: string;
  code: string;
  color: string;
  status: string;
  billable: boolean;
  createdAt: string;
  integrationKey: string | null;
};

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

    const { cursor, limit: limitStr, status } = parsed.data;
    const limit = parseLimit(limitStr ?? null);

    const conditions = [];

    if (status) {
      conditions.push(eq(project.status, status));
    }

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(gt(project.id, decoded.id));
      }
    }

    const rows = await db
      .select({
        id: project.id,
        name: project.name,
        code: project.code,
        color: project.color,
        status: project.status,
        billable: project.billable,
        createdAt: project.createdAt,
        integrationKey: project.integrationKey,
      })
      .from(project)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(asc(project.id))
      .limit(limit + 1);

    const { data, nextCursor } = buildPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => r.id,
    );

    const dtos: ProjectDTO[] = data.map((r) => ({
      id: r.id,
      name: r.name,
      code: r.code,
      color: r.color,
      status: r.status,
      billable: r.billable,
      createdAt: new Date(r.createdAt).toISOString(),
      integrationKey: r.integrationKey,
    }));

    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/projects",
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(
      { data: dtos, nextCursor },
      {
        headers: {
          "Cache-Control": "private, max-age=30",
          ETag: `"projects-${Date.now()}"`,
          "X-Request-Id": requestId,
          ...getRateLimitHeaders(clientId),
        },
      },
    );
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/projects",
      durationMs: Date.now() - start,
      status: 500,
    });
    return toErrorResponse(error, requestId);
  }
}
