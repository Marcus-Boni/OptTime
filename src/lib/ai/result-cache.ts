"use client";

/**
 * Durable cache for AI-generated artifacts.
 *
 * Generating a day plan or a weekly digest costs a fan-out of Azure DevOps and
 * Microsoft Graph calls plus a model round-trip — several seconds and real
 * money. Throwing that away because someone closed a modal is the wrong
 * default: the result should survive until the person asks for a new one, or
 * until the data behind it moves.
 *
 * Each namespace owns a single storage key holding a bounded map of entries.
 * Everything degrades quietly: a private window, a full quota or a browser
 * with storage disabled simply behaves like a cold cache.
 */

const STORAGE_PREFIX = "optsolv:ai-cache";

export interface CachedAiEntry<T> {
  value: T;
  /** ISO timestamp of when the value was produced. */
  generatedAt: string;
  /** Entries written by an older shape of `T` are dropped on read. */
  version: number;
  /**
   * Opaque marker of the inputs behind the value. When the caller's current
   * signature no longer matches, the entry is still served — but flagged as
   * outdated, so the user decides whether to spend a regeneration.
   */
  signature: string | null;
}

export interface AiResultCache<T> {
  /** Fresh entry for `key`, or null when absent, expired or stale-versioned. */
  read(key: string): CachedAiEntry<T> | null;
  write(key: string, value: T, signature?: string | null): CachedAiEntry<T>;
  /** Replaces the value while keeping the original generation timestamp. */
  amend(key: string, value: T): CachedAiEntry<T> | null;
  invalidate(key: string): void;
  clear(): void;
}

export interface AiResultCacheOptions {
  /** Unique per artifact type, e.g. "day-plan". */
  namespace: string;
  /** Bump whenever the cached shape changes. */
  version: number;
  /** Hard expiry. Past it an entry is discarded rather than shown. */
  ttlMs: number;
  /** Oldest entries are evicted past this count. */
  maxEntries?: number;
  storage?: "session" | "local";
}

type EntryMap<T> = Record<string, CachedAiEntry<T>>;

function resolveStorage(kind: "session" | "local"): Storage | null {
  if (typeof window === "undefined") return null;

  try {
    return kind === "local" ? window.localStorage : window.sessionStorage;
  } catch {
    // Storage blocked by browser settings — behave like a cold cache.
    return null;
  }
}

function isEntry<T>(candidate: unknown): candidate is CachedAiEntry<T> {
  if (typeof candidate !== "object" || candidate === null) return false;

  const entry = candidate as Partial<CachedAiEntry<T>>;
  return (
    typeof entry.generatedAt === "string" &&
    typeof entry.version === "number" &&
    entry.value !== undefined
  );
}

export function createAiResultCache<T>(
  options: AiResultCacheOptions,
): AiResultCache<T> {
  const {
    namespace,
    version,
    ttlMs,
    maxEntries = 12,
    storage: storageKind = "session",
  } = options;

  const storageKey = `${STORAGE_PREFIX}:${namespace}:v${version}`;

  function readAll(): EntryMap<T> {
    const storage = resolveStorage(storageKind);
    if (!storage) return {};

    try {
      const raw = storage.getItem(storageKey);
      if (!raw) return {};

      const parsed: unknown = JSON.parse(raw);
      if (typeof parsed !== "object" || parsed === null) return {};

      const entries: EntryMap<T> = {};
      for (const [key, candidate] of Object.entries(parsed)) {
        if (isEntry<T>(candidate) && candidate.version === version) {
          entries[key] = candidate;
        }
      }

      return entries;
    } catch (error: unknown) {
      console.error(`[ai-cache:${namespace}] readAll:`, error);
      return {};
    }
  }

  function writeAll(entries: EntryMap<T>): void {
    const storage = resolveStorage(storageKind);
    if (!storage) return;

    try {
      storage.setItem(storageKey, JSON.stringify(entries));
    } catch (error: unknown) {
      // A full quota must never break the feature that produced the value.
      console.error(`[ai-cache:${namespace}] writeAll:`, error);
    }
  }

  function isExpired(entry: CachedAiEntry<T>): boolean {
    const age = Date.now() - new Date(entry.generatedAt).getTime();
    return Number.isNaN(age) || age > ttlMs;
  }

  /** Drops expired entries and keeps the map within `maxEntries`. */
  function prune(entries: EntryMap<T>): EntryMap<T> {
    const alive = Object.entries(entries).filter(
      ([, entry]) => !isExpired(entry),
    );

    const newestFirst = alive.sort(
      ([, a], [, b]) =>
        new Date(b.generatedAt).getTime() - new Date(a.generatedAt).getTime(),
    );

    return Object.fromEntries(newestFirst.slice(0, maxEntries));
  }

  return {
    read(key) {
      const entry = readAll()[key];
      if (!entry || isExpired(entry)) return null;
      return entry;
    },

    write(key, value, signature = null) {
      const entry: CachedAiEntry<T> = {
        value,
        generatedAt: new Date().toISOString(),
        version,
        signature,
      };

      writeAll(prune({ ...readAll(), [key]: entry }));
      return entry;
    },

    amend(key, value) {
      const entries = readAll();
      const current = entries[key];
      if (!current) return null;

      const entry: CachedAiEntry<T> = { ...current, value };
      writeAll(prune({ ...entries, [key]: entry }));
      return entry;
    },

    invalidate(key) {
      const entries = readAll();
      if (!(key in entries)) return;

      delete entries[key];
      writeAll(entries);
    },

    clear() {
      const storage = resolveStorage(storageKind);
      if (!storage) return;

      try {
        storage.removeItem(storageKey);
      } catch (error: unknown) {
        console.error(`[ai-cache:${namespace}] clear:`, error);
      }
    },
  };
}
