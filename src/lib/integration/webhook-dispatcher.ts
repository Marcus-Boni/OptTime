import { randomUUID } from "crypto";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { webhookDelivery, webhookSubscription } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { logWebhookDelivery } from "./logger";
import { sign } from "./webhook-signer";

export type WebhookEvent = "ping" | string;

type EventPayload = Record<string, unknown>;

// Backoff schedule: 1, 2, 4, 8, 16 minutes
const RETRY_DELAYS_MS = [
  1 * 60 * 1000,
  2 * 60 * 1000,
  4 * 60 * 1000,
  8 * 60 * 1000,
  16 * 60 * 1000,
];
const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
const DELIVERY_TIMEOUT_MS = 10_000;

function nextRetryDelay(attempt: number): number | null {
  const delay = RETRY_DELAYS_MS[attempt];
  return delay ?? null;
}

async function deliverOnce(
  deliveryId: string,
  url: string,
  event: WebhookEvent,
  payload: EventPayload,
  secret: string,
  attempt: number,
): Promise<{ success: boolean; responseStatus?: number; error?: string }> {
  const body = JSON.stringify(payload);
  const signature = sign(body, secret);
  const timestamp = new Date().toISOString();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);

  const start = Date.now();

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
      body,
      signal: controller.signal,
    });

    const success = response.status >= 200 && response.status < 300;
    logWebhookDelivery({
      deliveryId,
      subscriptionId: (payload["subscriptionId"] as string) ?? "",
      event,
      targetUrl: url,
      attempt,
      status: success ? "delivered" : "retrying",
      durationMs: Date.now() - start,
      error: success ? undefined : `HTTP ${response.status}`,
    });

    return { success, responseStatus: response.status };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logWebhookDelivery({
      deliveryId,
      subscriptionId: (payload["subscriptionId"] as string) ?? "",
      event,
      targetUrl: url,
      attempt,
      status: "failed",
      durationMs: Date.now() - start,
      error,
    });
    return { success: false, error };
  } finally {
    clearTimeout(timeout);
  }
}

export async function dispatch(
  event: WebhookEvent,
  payload: EventPayload,
): Promise<void> {
  // Find active subscriptions for this event
  const subscriptions = await db.query.webhookSubscription.findMany({
    where: and(
      eq(webhookSubscription.active, true),
      sql`${webhookSubscription.events} @> ARRAY[${event}]::text[]`,
    ),
  });

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      const deliveryId = randomUUID();
      const fullPayload = { ...payload, subscriptionId: sub.id };

      // Create pending delivery record
      await db.insert(webhookDelivery).values({
        id: deliveryId,
        subscriptionId: sub.id,
        event,
        payload: JSON.stringify(fullPayload),
        status: "pending" as const,
        attempts: 0,
      });

      const plainSecret = decrypt(sub.secret);
      const result = await deliverOnce(
        deliveryId,
        sub.url,
        event,
        fullPayload,
        plainSecret,
        1,
      );

      if (result.success) {
        await db
          .update(webhookDelivery)
          .set({
            status: "delivered",
            attempts: 1,
            responseStatus: result.responseStatus,
            updatedAt: new Date(),
          })
          .where(eq(webhookDelivery.id, deliveryId));
      } else {
        const delay = nextRetryDelay(1);
        const nextRetry = delay ? new Date(Date.now() + delay) : null;

        await db
          .update(webhookDelivery)
          .set({
            status: nextRetry ? "pending" : "failed",
            attempts: 1,
            responseStatus: result.responseStatus ?? null,
            lastError: result.error ?? null,
            nextRetryAt: nextRetry,
            updatedAt: new Date(),
          })
          .where(eq(webhookDelivery.id, deliveryId));
      }
    }),
  );
}

export async function retryPendingDeliveries(): Promise<void> {
  const now = new Date();

  const pending = await db.query.webhookDelivery.findMany({
    where: and(
      eq(webhookDelivery.status, "pending"),
      or(
        isNull(webhookDelivery.nextRetryAt),
        lte(webhookDelivery.nextRetryAt, now),
      ),
    ),
    with: { subscription: true },
  });

  await Promise.allSettled(
    pending.map(async (delivery) => {
      const { subscription } = delivery;

      // Deliveries without a subscription (e.g. ad-hoc test dispatches) cannot be retried
      if (!subscription) {
        await db
          .update(webhookDelivery)
          .set({
            status: "failed",
            lastError: "No subscription linked",
            updatedAt: new Date(),
          })
          .where(eq(webhookDelivery.id, delivery.id));
        return;
      }

      if (!subscription.active) {
        await db
          .update(webhookDelivery)
          .set({
            status: "failed",
            lastError: "Subscription deactivated",
            updatedAt: new Date(),
          })
          .where(eq(webhookDelivery.id, delivery.id));
        return;
      }

      const attempt = delivery.attempts + 1;
      const payload = JSON.parse(delivery.payload) as EventPayload;
      const plainSecret = decrypt(subscription.secret);

      const result = await deliverOnce(
        delivery.id,
        subscription.url,
        delivery.event,
        payload,
        plainSecret,
        attempt,
      );

      if (result.success) {
        await db
          .update(webhookDelivery)
          .set({
            status: "delivered",
            attempts: attempt,
            responseStatus: result.responseStatus,
            nextRetryAt: null,
            updatedAt: new Date(),
          })
          .where(eq(webhookDelivery.id, delivery.id));
      } else {
        const delay = nextRetryDelay(attempt);
        const nextRetry = delay ? new Date(Date.now() + delay) : null;
        const isFinal = attempt >= MAX_ATTEMPTS;

        await db
          .update(webhookDelivery)
          .set({
            status: isFinal ? "failed" : "pending",
            attempts: attempt,
            responseStatus: result.responseStatus ?? null,
            lastError: result.error ?? null,
            nextRetryAt: isFinal ? null : nextRetry,
            updatedAt: new Date(),
          })
          .where(eq(webhookDelivery.id, delivery.id));
      }
    }),
  );
}
