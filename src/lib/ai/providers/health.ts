/**
 * Circuit breaker for the provider chain.
 *
 * Every call walks the chain in order, so a provider that is down — no
 * billing (402), a retired model (404), a revoked key (401/403) — used to
 * cost each request a full round-trip before the next one was tried. A
 * provider that fails like that is benched for a while; rate limits and
 * outages get a short pause instead. Per process and in memory: a restart
 * simply gives everyone a fresh chance.
 */

import type { ProviderName } from "@/lib/ai/types";
import type { ChatProvider } from "./base";
import { ProviderError } from "./base";

/** Billing, auth or model problems don't fix themselves within seconds. */
const PERMANENT_COOLDOWN_MS = 10 * 60_000;
/** Rate limits and 5xx usually clear quickly. */
const TRANSIENT_COOLDOWN_MS = 60_000;

const PERMANENT_STATUSES = new Set([401, 402, 403, 404]);

const benchedUntil = new Map<ProviderName, number>();

export function cooldownFor(status: number | undefined): number | null {
  if (status === undefined) return null;
  if (PERMANENT_STATUSES.has(status)) return PERMANENT_COOLDOWN_MS;
  if (status === 429 || status >= 500) return TRANSIENT_COOLDOWN_MS;
  return null;
}

export function isBenched(name: ProviderName, now = Date.now()): boolean {
  const until = benchedUntil.get(name);
  if (!until) return false;
  if (until <= now) {
    benchedUntil.delete(name);
    return false;
  }
  return true;
}

export function recordProviderFailure(
  name: ProviderName,
  status: number | undefined,
  now = Date.now(),
): void {
  const cooldown = cooldownFor(status);
  if (cooldown === null) return;
  benchedUntil.set(name, now + cooldown);
  console.warn(
    `[ai-providers] ${name} em pausa por ${Math.round(cooldown / 1000)}s após HTTP ${status}`,
  );
}

/** Wraps a provider so its HTTP failures feed the breaker. */
export function withHealthTracking(provider: ChatProvider): ChatProvider {
  return {
    name: provider.name,
    model: provider.model,
    async *streamChat(request) {
      try {
        yield* provider.streamChat(request);
        benchedUntil.delete(provider.name);
      } catch (error: unknown) {
        if (error instanceof ProviderError) {
          recordProviderFailure(provider.name, error.status);
        }
        throw error;
      }
    },
  };
}

/** Test hook: forget every pause. */
export function resetProviderHealth(): void {
  benchedUntil.clear();
}
