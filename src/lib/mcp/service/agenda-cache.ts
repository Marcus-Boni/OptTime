import type { AgendaResult } from "./agenda-mapping";

/**
 * The 60-second agenda cache, in a module of its own.
 *
 * Every write that changes `loggedMinutes` — logging, editing or deleting an
 * entry, stopping a timer, applying suggestions — drops the user's cached
 * agendas. Those writes live in services that must not import the Graph client
 * just to reach a `Map`, so the cache sits here with nothing but a type import.
 */

/** How long a fetched agenda is reused. The assistant polls every few minutes. */
export const AGENDA_CACHE_TTL_MS = 60_000;
const AGENDA_CACHE_MAX_ENTRIES = 200;

interface CachedAgenda {
  expiresAt: number;
  value: AgendaResult;
}

const agendaCache = new Map<string, CachedAgenda>();

/** Cache key: the user first, so `clearAgendaCache(userId)` can sweep by prefix. */
export function agendaCacheKey(
  userId: string,
  parts: ReadonlyArray<string | number | boolean>,
): string {
  return [
    userId,
    ...parts.map((part) => (part === true ? 1 : part === false ? 0 : part)),
  ].join("|");
}

export function readAgendaCache(key: string, now: number): AgendaResult | null {
  const cached = agendaCache.get(key);
  return cached && cached.expiresAt > now ? cached.value : null;
}

export function writeAgendaCache(
  key: string,
  value: AgendaResult,
  now: number,
): void {
  if (agendaCache.size >= AGENDA_CACHE_MAX_ENTRIES) {
    const oldest = agendaCache.keys().next().value;
    if (oldest !== undefined) agendaCache.delete(oldest);
  }
  agendaCache.set(key, { expiresAt: now + AGENDA_CACHE_TTL_MS, value });
}

/**
 * Drops cached agendas — all of them, or one user's.
 *
 * Call it after any write that changes what has already been logged, so the
 * next read does not show minutes that are up to a minute out of date.
 */
export function clearAgendaCache(userId?: string): void {
  if (!userId) {
    agendaCache.clear();
    return;
  }

  for (const key of agendaCache.keys()) {
    if (key.startsWith(`${userId}|`)) agendaCache.delete(key);
  }
}
