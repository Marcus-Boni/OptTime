import { and, asc, eq, gt, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
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
});

type UserDTO = {
  id: string;
  email: string;
  displayName: string;
  role: string;
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

    const { cursor, limit: limitStr } = parsed.data;
    const limit = parseLimit(limitStr ?? null);

    const conditions = [eq(user.isActive, true), isNotNull(user.email)];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(gt(user.id, decoded.id));
      }
    }

    const rows = await db
      .select({
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(and(...conditions))
      .orderBy(asc(user.id))
      .limit(limit + 1);

    const { data, nextCursor } = buildPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => r.id,
    );

    const dtos: UserDTO[] = data.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.name,
      role: r.role,
    }));

    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/users",
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(
      { data: dtos, nextCursor },
      {
        headers: {
          "Cache-Control": "private, max-age=30",
          ETag: `"users-${Date.now()}"`,
          "X-Request-Id": requestId,
          ...getRateLimitHeaders(clientId),
        },
      },
    );
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/users",
      durationMs: Date.now() - start,
      status: 500,
    });
    return toErrorResponse(error, requestId);
  }
}
