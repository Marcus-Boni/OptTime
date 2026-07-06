import { randomUUID } from "crypto";
import { and, asc, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { webhookSubscription } from "@/lib/db/schema";
import { encrypt } from "@/lib/encryption";
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

const listQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.string().optional(),
});

const createBodySchema = z.object({
  url: z.string().url("must be a valid URL"),
  secret: z.string().min(16, "secret must be at least 16 characters"),
  events: z.array(z.string().min(1)).min(1, "at least one event is required"),
});

type WebhookSubscriptionDTO = {
  id: string;
  subscriberAppId: string;
  url: string;
  events: string[];
  active: boolean;
  createdAt: string;
};

function toDTO(
  sub: typeof webhookSubscription.$inferSelect,
): WebhookSubscriptionDTO {
  return {
    id: sub.id,
    subscriberAppId: sub.subscriberAppId,
    url: sub.url,
    events: sub.events ?? [],
    active: sub.active,
    createdAt: new Date(sub.createdAt).toISOString(),
  };
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
    const parsed = listQuerySchema.safeParse(Object.fromEntries(searchParams));
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

    const conditions = [eq(webhookSubscription.subscriberAppId, clientId)];

    if (cursor) {
      const decoded = decodeCursor(cursor);
      if (decoded) {
        conditions.push(gt(webhookSubscription.id, decoded.id));
      }
    }

    const rows = await db
      .select()
      .from(webhookSubscription)
      .where(and(...conditions))
      .orderBy(asc(webhookSubscription.id))
      .limit(limit + 1);

    const { data, nextCursor } = buildPage(
      rows,
      limit,
      (r) => r.createdAt,
      (r) => r.id,
    );

    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/webhooks/subscriptions",
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(
      { data: data.map(toDTO), nextCursor },
      {
        headers: {
          "Cache-Control": "private, max-age=30",
          "X-Request-Id": requestId,
          ...getRateLimitHeaders(clientId),
        },
      },
    );
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId,
      route: "GET /api/v1/webhooks/subscriptions",
      durationMs: Date.now() - start,
      status: 500,
    });
    return toErrorResponse(error, requestId);
  }
}

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

    requireScope(ctx.scopes, SCOPES.ADMIN);

    const body = await req.json();
    const parsed = createBodySchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: parsed.error.flatten(),
          },
        },
        { status: 400, headers: { "X-Request-Id": requestId } },
      );
    }

    const { url, secret, events } = parsed.data;
    const encryptedSecret = encrypt(secret);

    const [created] = await db
      .insert(webhookSubscription)
      .values({
        id: randomUUID(),
        subscriberAppId: clientId,
        url,
        secret: encryptedSecret,
        events,
        active: true,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create subscription");
    }

    logRequest({
      requestId,
      clientId,
      route: "POST /api/v1/webhooks/subscriptions",
      durationMs: Date.now() - start,
      status: 201,
    });

    return Response.json(toDTO(created), {
      status: 201,
      headers: { "X-Request-Id": requestId, ...getRateLimitHeaders(clientId) },
    });
  } catch (error: unknown) {
    logRequest({
      requestId,
      clientId,
      route: "POST /api/v1/webhooks/subscriptions",
      durationMs: Date.now() - start,
      status: 500,
    });
    return toErrorResponse(error, requestId);
  }
}
