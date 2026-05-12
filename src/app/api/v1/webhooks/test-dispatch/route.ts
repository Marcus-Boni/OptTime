import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { webhookDelivery } from "@/lib/db/schema";
import { validateM2MToken } from "@/lib/integration/auth";
import { toErrorResponse } from "@/lib/integration/errors";
import {
  createRequestId,
  logRequest,
  logWebhookDelivery,
} from "@/lib/integration/logger";
import {
  checkRateLimit,
  getRateLimitHeaders,
} from "@/lib/integration/rate-limit";
import { requireScope, SCOPES } from "@/lib/integration/scopes";
import { sign } from "@/lib/integration/webhook-signer";

const bodySchema = z.object({
  url: z.string().url("must be a valid URL"),
  secret: z.string().min(16, "secret must be at least 16 characters"),
});

const DELIVERY_TIMEOUT_MS = 10_000;

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
    const parsed = bodySchema.safeParse(body);
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

    const { url, secret } = parsed.data;
    const deliveryId = randomUUID();
    const event = "ping";
    const timestamp = new Date().toISOString();

    const payload = {
      event,
      deliveryId,
      timestamp,
      data: { message: "OptSolv Time Tracker webhook test" },
    };

    const payloadStr = JSON.stringify(payload);
    const signature = sign(payloadStr, secret);

    // subscriptionId is null for ad-hoc test dispatches (no registered subscription)
    await db.insert(webhookDelivery).values({
      id: deliveryId,
      subscriptionId: null,
      event,
      payload: payloadStr,
      status: "pending",
      attempts: 0,
    });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

    let success = false;
    let responseStatus: number | undefined;
    let errorMsg: string | undefined;
    const deliveryStart = Date.now();

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-OptSolv-Event": event,
          "X-OptSolv-Signature": signature,
          "X-OptSolv-Delivery": deliveryId,
          "X-OptSolv-Timestamp": timestamp,
        },
        body: payloadStr,
        signal: controller.signal,
      });
      responseStatus = response.status;
      success = response.status >= 200 && response.status < 300;
    } catch (err) {
      errorMsg = err instanceof Error ? err.message : String(err);
    } finally {
      clearTimeout(timeout);
    }

    await db
      .update(webhookDelivery)
      .set({
        status: success ? "delivered" : "failed",
        attempts: 1,
        responseStatus: responseStatus ?? null,
        lastError: errorMsg ?? null,
        updatedAt: new Date(),
      })
      .where(eq(webhookDelivery.id, deliveryId));

    logWebhookDelivery({
      deliveryId,
      subscriptionId: "test-dispatch",
      event,
      targetUrl: url,
      attempt: 1,
      status: success ? "delivered" : "failed",
      durationMs: Date.now() - deliveryStart,
      error: errorMsg,
    });

    logRequest({
      requestId,
      clientId,
      route: "POST /api/v1/webhooks/test-dispatch",
      durationMs: Date.now() - start,
      status: 200,
    });

    return Response.json(
      {
        deliveryId,
        success,
        responseStatus: responseStatus ?? null,
        error: errorMsg ?? null,
      },
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
      route: "POST /api/v1/webhooks/test-dispatch",
      durationMs: Date.now() - start,
      status: 500,
    });
    return toErrorResponse(error, requestId);
  }
}
