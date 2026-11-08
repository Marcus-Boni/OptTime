/**
 * Process-local circuit breaker. Authentication/model errors pause Foundry
 * for ten minutes; rate limits, timeouts and outages pause it for one minute.
 * Callers use their deterministic fallbacks while the pause is active.
 */

import {
  type ChatProvider,
  ProviderError,
  type ProviderStreamChunk,
} from "@/lib/ai/providers/base";
import type { ProviderName } from "@/lib/ai/types";

/** Billing, auth or model problems don't fix themselves within seconds. */
const PERMANENT_COOLDOWN_MS = 10 * 60_000;
/** Rate limits and 5xx usually clear quickly. */
const TRANSIENT_COOLDOWN_MS = 60_000;

const PERMANENT_STATUSES = new Set([401, 402, 403, 404]);

const benchedUntil = new Map<ProviderName, number>();

export function cooldownFor(status: number | undefined): number | null {
  if (status === undefined) return null;
  if (PERMANENT_STATUSES.has(status)) return PERMANENT_COOLDOWN_MS;
  if (status === 408 || status === 429 || status >= 500)
    return TRANSIENT_COOLDOWN_MS;
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
    async *streamChat(request): AsyncGenerator<ProviderStreamChunk> {
      try {
        yield* provider.streamChat(request);
        benchedUntil.delete(provider.name);
      } catch (error: unknown) {
        if (!request.signal.aborted) {
          recordProviderFailure(
            provider.name,
            error instanceof ProviderError ? (error.status ?? 503) : 503,
          );
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
