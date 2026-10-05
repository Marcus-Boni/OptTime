"use client";

/**
 * Shared state for the AI weekly digest.
 *
 * The digest summarises a week that has already closed — it does not change
 * from one minute to the next, and each generation costs a model call. So it
 * is produced once per audience per week and kept: the modal and the settings
 * card read the same cached result, and reopening either never re-spends a
 * generation. Refreshing is always a button the user presses.
 */

import { useCallback, useMemo } from "react";
import { useCachedAiResult } from "@/hooks/use-cached-ai-result";
import { createAiResultCache } from "@/lib/ai/result-cache";
import { useSession } from "@/lib/auth-client";
import { resolveWeeklyCapacityHours } from "@/lib/capacity";
import type { DigestAudience } from "@/lib/digest/types";
import { getWeekPeriod } from "@/lib/utils";
import type { DigestPreviewResponse } from "@/types/digest";
import type { User as UserType } from "@/types/user";

/** A closed week's summary stays valid; the key changes when the week does. */
const DIGEST_TTL_MS = 12 * 60 * 60 * 1000;
/** Past this the digest still shows, with a discreet offer to refresh. */
const DIGEST_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

const digestCache = createAiResultCache<DigestPreviewResponse>({
  namespace: "weekly-digest",
  version: 1,
  ttlMs: DIGEST_TTL_MS,
  maxEntries: 6,
  storage: "local",
});

export interface WeeklyDigestController {
  digest: DigestPreviewResponse | null;
  generatedAt: Date | null;
  isLoading: boolean;
  isRefreshing: boolean;
  isStale: boolean;
  staleReason: string | null;
  error: string | null;
  regenerate: () => void;
}

export interface UseWeeklyDigestOptions {
  audience: DigestAudience;
  /** Generate on first bind. Keep false while the surface is closed. */
  enabled: boolean;
}

export function getWeeklyDigestCacheKey(
  period: string,
  audience: DigestAudience,
  userId: string,
  weeklyCapacityHours: number | null | undefined,
): string {
  const capacity = resolveWeeklyCapacityHours(weeklyCapacityHours);

  return `digest:${period}:${audience}:user:${userId}:capacity:${capacity}`;
}

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

async function fetchDigest(
  audience: DigestAudience,
  signal: AbortSignal,
): Promise<DigestPreviewResponse> {
  const params = new URLSearchParams({
    audience,
    timezone: resolveTimeZone(),
  });

  const res = await fetch(`/api/digest/preview?${params.toString()}`, {
    cache: "no-store",
    signal,
  });

  const payload = (await res
    .json()
    .catch(() => ({}))) as DigestPreviewResponse & { error?: string };

  if (!res.ok) {
    throw new Error(payload.error ?? "Falha ao gerar o resumo semanal.");
  }

  return payload;
}

export function useWeeklyDigest({
  audience,
  enabled,
}: UseWeeklyDigestOptions): WeeklyDigestController {
  const { data: session, isPending } = useSession();
  const sessionUser: UserType | null = isPending
    ? null
    : ((session?.user as unknown as UserType | undefined) ?? null);

  // The week is part of the key: come Monday, the cached digest is about the
  // wrong period and must not be served.
  const period = useMemo(() => getWeekPeriod(new Date()), []);
  const digestKey = sessionUser?.id
    ? getWeeklyDigestCacheKey(
        period,
        audience,
        sessionUser.id,
        sessionUser.weeklyCapacity,
      )
    : null;
  const canGenerate = enabled && !isPending && sessionUser !== null;

  const fetcher = useCallback(
    (signal: AbortSignal) => fetchDigest(audience, signal),
    [audience],
  );

  const result = useCachedAiResult<DigestPreviewResponse>({
    cache: digestCache,
    key: digestKey,
    fetcher,
    enabled: canGenerate,
    staleAfterMs: DIGEST_STALE_AFTER_MS,
    ageStaleReason:
      "Este resumo foi gerado há algumas horas — atualize para incluir os lançamentos mais recentes.",
  });

  const regenerate = useCallback(() => {
    if (!digestKey) return;
    void result.regenerate();
  }, [digestKey, result]);

  return {
    digest: result.data,
    generatedAt: result.generatedAt,
    isLoading: (enabled && isPending) || result.isLoading,
    isRefreshing: result.isRefreshing,
    isStale: result.isStale,
    staleReason: result.staleReason,
    error: result.error,
    regenerate,
  };
}
