type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const suggestionCache = new Map<string, CacheEntry<unknown>>();

export function getCachedSuggestions<T>(key: string): T | null {
  const cached = suggestionCache.get(key);
  if (!cached) return null;

  if (cached.expiresAt < Date.now()) {
    suggestionCache.delete(key);
    return null;
  }

  return cached.value as T;
}

export function setCachedSuggestions<T>(key: string, value: T, ttlMs = 90_000) {
  suggestionCache.set(key, {
    expiresAt: Date.now() + ttlMs,
    value,
  });
}

export function clearCachedSuggestionsByPrefix(prefix: string) {
  for (const key of suggestionCache.keys()) {
    if (key.startsWith(prefix)) {
      suggestionCache.delete(key);
    }
  }
}
