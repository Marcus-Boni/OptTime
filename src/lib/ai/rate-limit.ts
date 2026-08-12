/**
 * Per-user sliding-window limiter for the assistant endpoints.
 * In-memory by design: the app runs as a single Azure Web App instance and the
 * limit exists to stop runaway loops and accidental cost spikes, not to be a
 * distributed quota system.
 */

interface WindowState {
  timestamps: number[];
}

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const CLEANUP_INTERVAL_MS = 5 * 60_000;

const globalForRateLimit = globalThis as typeof globalThis & {
  __timebotRateLimit?: Map<string, WindowState>;
  __timebotRateLimitSweep?: number;
};

const buckets =
  globalForRateLimit.__timebotRateLimit ?? new Map<string, WindowState>();
globalForRateLimit.__timebotRateLimit = buckets;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  userId: string,
  maxRequests = MAX_REQUESTS_PER_WINDOW,
): RateLimitResult {
  const now = Date.now();
  sweepOccasionally(now);

  const state = buckets.get(userId) ?? { timestamps: [] };
  const recent = state.timestamps.filter((time) => now - time < WINDOW_MS);

  if (recent.length >= maxRequests) {
    const oldest = recent[0] ?? now;
    buckets.set(userId, { timestamps: recent });

    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((WINDOW_MS - (now - oldest)) / 1000),
      ),
    };
  }

  recent.push(now);
  buckets.set(userId, { timestamps: recent });

  return {
    allowed: true,
    remaining: maxRequests - recent.length,
    retryAfterSeconds: 0,
  };
}

function sweepOccasionally(now: number): void {
  const last = globalForRateLimit.__timebotRateLimitSweep ?? 0;
  if (now - last < CLEANUP_INTERVAL_MS) return;

  globalForRateLimit.__timebotRateLimitSweep = now;

  for (const [key, state] of buckets) {
    const recent = state.timestamps.filter((time) => now - time < WINDOW_MS);
    if (recent.length === 0) {
      buckets.delete(key);
    } else {
      buckets.set(key, { timestamps: recent });
    }
  }
}
