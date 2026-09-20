"use client";

/**
 * React binding for {@link AiResultCache}.
 *
 * Encodes the product rule shared by every AI surface in the app: **generate
 * once, keep it until the person asks again**. Reopening a panel restores what
 * was already produced — including any edits made to it — and regeneration is
 * always an explicit act.
 *
 * A cached result is never silently replaced. When the underlying data moves
 * the entry is flagged as outdated and the UI can offer a refresh; the choice
 * stays with the user.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiResultCache } from "@/lib/ai/result-cache";

export type CachedAiStatus =
  | "idle"
  | "loading"
  | "refreshing"
  | "ready"
  | "error";

export interface CachedAiResultController<T> {
  data: T | null;
  /** When the current value was produced, null when nothing is loaded. */
  generatedAt: Date | null;
  status: CachedAiStatus;
  /** First load: there is nothing to show yet. */
  isLoading: boolean;
  /** Regenerating on top of a value already on screen. */
  isRefreshing: boolean;
  /** The value is usable but the data behind it has moved on. */
  isStale: boolean;
  staleReason: string | null;
  error: string | null;
  /** Discards the cached value and produces a new one. */
  regenerate: () => Promise<T | null>;
  /** Persists a local edit without touching the generation timestamp. */
  update: (updater: (current: T) => T) => void;
  /** Flags the current value as outdated, e.g. after an external change. */
  markStale: (reason: string) => void;
  /** Forgets the cached value entirely. */
  discard: () => void;
}

export interface UseCachedAiResultOptions<T> {
  cache: AiResultCache<T>;
  /** Cache entry to bind to. `null` keeps the hook dormant. */
  key: string | null;
  fetcher: (signal: AbortSignal) => Promise<T>;
  /** Fetch automatically when the cache has nothing. Defaults to true. */
  enabled?: boolean;
  /** Marker of the inputs; a mismatch with the cached one flags staleness. */
  signature?: string | null;
  /** Age past which a cached value is flagged as outdated. */
  staleAfterMs?: number;
  /** Message shown when the value is older than `staleAfterMs`. */
  ageStaleReason?: string;
}

const DEFAULT_ERROR = "Não foi possível gerar o resultado.";

export function useCachedAiResult<T>({
  cache,
  key,
  fetcher,
  enabled = true,
  signature = null,
  staleAfterMs,
  ageStaleReason = "Este resultado já tem algum tempo.",
}: UseCachedAiResultOptions<T>): CachedAiResultController<T> {
  const [data, setData] = useState<T | null>(null);
  const [generatedAt, setGeneratedAt] = useState<Date | null>(null);
  const [status, setStatus] = useState<CachedAiStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [staleReason, setStaleReason] = useState<string | null>(null);

  // Latest values, read inside callbacks that must not re-create on every
  // render (the fetcher is typically an inline closure).
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  const signatureRef = useRef(signature);
  signatureRef.current = signature;

  const abortRef = useRef<AbortController | null>(null);
  /** Guards against the double-invoked effects of React strict mode. */
  const hydratedKeyRef = useRef<string | null>(null);

  // Mirrors `data` so callbacks can read the current value without a
  // side-effecting state updater (strict mode invokes those twice).
  const dataRef = useRef<T | null>(null);

  const commitData = useCallback((value: T | null) => {
    dataRef.current = value;
    setData(value);
  }, []);

  const run = useCallback(
    async (mode: "loading" | "refreshing"): Promise<T | null> => {
      if (!key) return null;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setStatus(mode);
      setError(null);

      try {
        const value = await fetcherRef.current(controller.signal);
        if (controller.signal.aborted) return null;

        const entry = cache.write(key, value, signatureRef.current);

        commitData(value);
        setGeneratedAt(new Date(entry.generatedAt));
        setStaleReason(null);
        setStatus("ready");
        return value;
      } catch (err: unknown) {
        if (controller.signal.aborted) return null;

        console.error("[useCachedAiResult] run:", err);
        setError(err instanceof Error ? err.message : DEFAULT_ERROR);
        setStatus("error");
        return null;
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [cache, key, commitData],
  );

  // Bind to the key: restore from cache when possible, generate when not.
  useEffect(() => {
    // A different key is a different artifact — drop what is on screen before
    // binding, so a stale day plan never flashes under a new date.
    if (hydratedKeyRef.current !== null && hydratedKeyRef.current !== key) {
      hydratedKeyRef.current = null;
      abortRef.current?.abort();
      commitData(null);
      setGeneratedAt(null);
      setStatus("idle");
      setError(null);
      setStaleReason(null);
    }

    if (!key || !enabled) return;
    if (hydratedKeyRef.current === key) return;
    hydratedKeyRef.current = key;

    const cached = cache.read(key);

    if (!cached) {
      void run("loading");
      return;
    }

    const cachedAt = new Date(cached.generatedAt);
    commitData(cached.value);
    setGeneratedAt(cachedAt);
    setStatus("ready");
    setError(null);

    const signatureDrifted =
      signatureRef.current !== null &&
      cached.signature !== null &&
      cached.signature !== signatureRef.current;

    const tooOld =
      staleAfterMs !== undefined &&
      Date.now() - cachedAt.getTime() > staleAfterMs;

    setStaleReason(
      signatureDrifted
        ? "Os dados por trás deste resultado mudaram."
        : tooOld
          ? ageStaleReason
          : null,
    );
  }, [cache, key, enabled, run, staleAfterMs, ageStaleReason, commitData]);

  // An unmount must not leave a request writing into a dead component.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  const regenerate = useCallback(async (): Promise<T | null> => {
    return run(data === null ? "loading" : "refreshing");
  }, [run, data]);

  const update = useCallback(
    (updater: (current: T) => T) => {
      const current = dataRef.current;
      if (current === null) return;

      const next = updater(current);
      commitData(next);
      if (key) cache.amend(key, next);
    },
    [cache, key, commitData],
  );

  // Nothing on screen, nothing to flag: a warning about a value the user
  // cannot see would only be noise.
  const markStale = useCallback((reason: string) => {
    if (dataRef.current === null) return;
    setStaleReason((current) => current ?? reason);
  }, []);

  const discard = useCallback(() => {
    if (key) cache.invalidate(key);

    hydratedKeyRef.current = null;
    commitData(null);
    setGeneratedAt(null);
    setStatus("idle");
    setStaleReason(null);
    setError(null);
  }, [cache, key, commitData]);

  return {
    data,
    generatedAt,
    status,
    isLoading: status === "loading",
    isRefreshing: status === "refreshing",
    isStale: staleReason !== null,
    staleReason,
    error,
    regenerate,
    update,
    markStale,
    discard,
  };
}
