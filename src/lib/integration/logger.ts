import { randomUUID } from "crypto";

export type RequestLog = {
  requestId: string;
  clientId: string;
  route: string;
  durationMs: number;
  status: number;
};

export type WebhookDeliveryLog = {
  deliveryId: string;
  subscriptionId: string;
  event: string;
  targetUrl: string;
  attempt: number;
  status: "delivered" | "failed" | "retrying";
  durationMs: number;
  error?: string;
};

export function createRequestId(req: Request): string {
  return req.headers.get("x-request-id") ?? randomUUID();
}

export function logRequest(log: RequestLog): void {
  console.log(
    JSON.stringify({
      ...log,
      ts: new Date().toISOString(),
      type: "api_v1_request",
    }),
  );
}

export function logWebhookDelivery(log: WebhookDeliveryLog): void {
  console.log(
    JSON.stringify({
      ...log,
      ts: new Date().toISOString(),
      type: "webhook_delivery",
    }),
  );
}
