"use client";

/**
 * Record of operator actions this browser has already run.
 *
 * Conversations (including their confirmation cards) are persisted to
 * localStorage, so a card can render again after a reload or a remount. Without
 * a durable marker, a delegated action would silently execute a second time and
 * log the same hours twice. The marker lives next to the conversation data for
 * exactly that reason.
 */

const STORAGE_KEY = "optsolv:operator:executed:v1";
/** Bounded so the key cannot grow forever in a long-lived browser profile. */
const MAX_ENTRIES = 400;

export const EXECUTED_STORE_UPDATED_EVENT = "optsolv:operator-executed-updated";

let cache: string[] | null = null;

function read(): string[] {
  if (cache) return cache;
  if (typeof window === "undefined") return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];

    cache = Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    cache = [];
  }

  return cache;
}

function write(entries: string[]): void {
  cache = entries;

  if (typeof window === "undefined") return;

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (error: unknown) {
    // A full or blocked storage must not break the action itself.
    console.error("[executed-store] write:", error);
  }
}

export function hasExecuted(key: string): boolean {
  return read().includes(key);
}

export function getExecutedKeys(): string[] {
  return [...read()];
}

/**
 * Merges server-persisted executed action/plan keys into the local store so
 * historical confirmation cards loaded from the database on a new device never
 * auto-run a second time.
 */
export function hydrateExecutedKeys(keys: readonly string[]): void {
  if (keys.length === 0) return;

  const current = read();
  const seen = new Set(current);
  let changed = false;

  for (const key of keys) {
    if (typeof key === "string" && key.length > 0 && !seen.has(key)) {
      seen.add(key);
      current.push(key);
      changed = true;
    }
  }

  if (!changed) return;

  const bounded =
    current.length > MAX_ENTRIES ? current.slice(-MAX_ENTRIES) : [...current];
  write(bounded);
}

export function markExecuted(key: string): void {
  const entries = read();
  if (entries.includes(key)) return;

  const next = [...entries, key];
  write(next.length > MAX_ENTRIES ? next.slice(-MAX_ENTRIES) : next);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(EXECUTED_STORE_UPDATED_EVENT));
  }
}

/** Stable identity for a single action, derived from its own contents. */
export function actionKey(action: { kind: string }): string {
  try {
    return `action:${JSON.stringify(action)}`;
  } catch {
    return `action:${action.kind}`;
  }
}

export function planKey(planId: string): string {
  return `plan:${planId}`;
}
