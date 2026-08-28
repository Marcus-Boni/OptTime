"use client";

import { useCallback, useEffect } from "react";
import { create } from "zustand";
import type {
  OnboardingAction,
  OnboardingOverview,
} from "@/lib/onboarding/types";
import {
  TIME_ENTRIES_UPDATED_EVENT,
  TIMESHEETS_UPDATED_EVENT,
} from "@/lib/time-events";

interface OnboardingCacheState {
  overview: OnboardingOverview | null;
  loading: boolean;
  error: string | null;
  /** In-flight GET, so concurrent mounts share one request. */
  inflight: Promise<void> | null;
}

interface OnboardingCacheActions {
  fetchOverview: (force?: boolean) => Promise<void>;
  send: (action: OnboardingAction) => Promise<void>;
}

/**
 * Shared onboarding cache.
 *
 * The overview is read by several surfaces at once — the host, the header help
 * menu, the dashboard checklist, the help hub. A module-level store keeps that
 * to a single request and a single source of truth, so ticking a task updates
 * every surface at the same instant.
 */
const useOnboardingCache = create<
  OnboardingCacheState & OnboardingCacheActions
>()((set, get) => ({
  overview: null,
  loading: true,
  error: null,
  inflight: null,

  fetchOverview: async (force = false) => {
    const { inflight, overview } = get();
    if (inflight) return inflight;
    if (overview && !force) return;

    const request = (async () => {
      try {
        const res = await fetch("/api/onboarding");
        if (!res.ok) throw new Error("Falha ao carregar seu onboarding");

        const data = (await res.json()) as OnboardingOverview;
        set({ overview: data, error: null });
      } catch (error: unknown) {
        console.error("[useOnboarding] fetchOverview:", error);
        set({
          error:
            error instanceof Error
              ? error.message
              : "Erro ao carregar seu onboarding",
        });
      } finally {
        set({ loading: false, inflight: null });
      }
    })();

    set({ inflight: request });
    return request;
  },

  send: async (action) => {
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action),
      });

      if (!res.ok) throw new Error("Não foi possível salvar seu progresso");

      const data = (await res.json()) as OnboardingOverview;
      set({ overview: data, error: null, loading: false });
    } catch (error: unknown) {
      console.error("[useOnboarding] send:", error);
      set({
        error:
          error instanceof Error
            ? error.message
            : "Erro ao salvar seu progresso",
      });
    }
  },
}));

export interface UseOnboardingOptions {
  enabled?: boolean;
}

export interface UseOnboardingResult {
  overview: OnboardingOverview | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  /** Sends an action and adopts the overview the server returns. */
  send: (action: OnboardingAction) => Promise<void>;
}

/**
 * Server-backed onboarding state.
 *
 * Progress lives in PostgreSQL rather than in browser storage, so the tour does
 * not replay when someone switches device. Mutations are fire-and-adopt: the
 * route returns the recomputed overview, which becomes the new cache entry
 * without a second round trip.
 */
export function useOnboarding(
  options: UseOnboardingOptions = {},
): UseOnboardingResult {
  const enabled = options.enabled ?? true;

  const overview = useOnboardingCache((state) => state.overview);
  const loading = useOnboardingCache((state) => state.loading);
  const error = useOnboardingCache((state) => state.error);
  const fetchOverview = useOnboardingCache((state) => state.fetchOverview);
  const send = useOnboardingCache((state) => state.send);

  useEffect(() => {
    if (!enabled) return;
    void fetchOverview();
  }, [enabled, fetchOverview]);

  // Checklist rows are derived from real product usage, so they have to
  // re-resolve whenever hours or timesheets change anywhere in the app.
  useEffect(() => {
    if (!enabled) return;

    const handler = () => {
      void fetchOverview(true);
    };

    window.addEventListener(TIME_ENTRIES_UPDATED_EVENT, handler);
    window.addEventListener(TIMESHEETS_UPDATED_EVENT, handler);

    return () => {
      window.removeEventListener(TIME_ENTRIES_UPDATED_EVENT, handler);
      window.removeEventListener(TIMESHEETS_UPDATED_EVENT, handler);
    };
  }, [enabled, fetchOverview]);

  const refetch = useCallback(async () => {
    await fetchOverview(true);
  }, [fetchOverview]);

  return { overview, loading: loading && !overview, error, refetch, send };
}

/** Resets the cache on sign-out so the next account starts clean. */
export function resetOnboardingCache(): void {
  useOnboardingCache.setState({
    overview: null,
    loading: true,
    error: null,
    inflight: null,
  });
}
