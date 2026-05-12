// In-memory token bucket rate limiter keyed by clientId.
// Each bucket allows DEFAULT_LIMIT requests per WINDOW_MS (sliding window).
//
// NOTE: This implementation is process-local. For deployments with multiple
// Node.js instances (horizontal scaling), migrate to Redis or Upstash so
// limits are enforced globally across all pods.

type Bucket = {
  tokens: number;
  windowStart: number;
};

const WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 600;

const buckets = new Map<string, Bucket>();

export function checkRateLimit(
  clientId: string,
  limit = DEFAULT_LIMIT,
): boolean {
  const now = Date.now();
  const existing = buckets.get(clientId);

  if (!existing || now - existing.windowStart >= WINDOW_MS) {
    buckets.set(clientId, { tokens: limit - 1, windowStart: now });
    return true;
  }

  if (existing.tokens <= 0) return false;

  existing.tokens -= 1;
  return true;
}

export function getRateLimitHeaders(
  clientId: string,
  limit = DEFAULT_LIMIT,
): Record<string, string> {
  const bucket = buckets.get(clientId);
  const remaining = bucket ? Math.max(0, bucket.tokens) : limit;
  const reset = bucket
    ? Math.ceil((bucket.windowStart + WINDOW_MS) / 1000)
    : Math.ceil((Date.now() + WINDOW_MS) / 1000);
  return {
    "X-RateLimit-Limit": String(limit),
    "X-RateLimit-Remaining": String(remaining),
    "X-RateLimit-Reset": String(reset),
  };
}
