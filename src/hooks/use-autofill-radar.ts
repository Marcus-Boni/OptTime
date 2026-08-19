"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TIME_ENTRIES_UPDATED_EVENT } from "@/lib/time-events";
import type { AutofillProposal, AutofillRadarResponse } from "@/types/autofill";

const DEFAULT_DAYS = 7;

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

export interface AutofillRadarController {
  proposals: AutofillProposal[];
  isLoading: boolean;
  error: string | null;
  integrationReady: boolean;
  warnings: string[];
  from: string | null;
  to: string | null;
  refresh: () => Promise<void>;
  /** Removes a proposal locally after it was accepted. */
  resolve: (fingerprint: string) => void;
  /** Removes it locally and tells the server never to propose it again. */
  dismiss: (proposal: AutofillProposal) => Promise<void>;
}

export function useAutofillRadar(
  options: { days?: number; enabled?: boolean } = {},
): AutofillRadarController {
  const { days = DEFAULT_DAYS, enabled = true } = options;

  const [proposals, setProposals] = useState<AutofillProposal[]>([]);
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [integrationReady, setIntegrationReady] = useState(true);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [range, setRange] = useState<{ from: string; to: string } | null>(null);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    if (!enabled) {
      setProposals([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        days: String(days),
        timezone: resolveTimeZone(),
      });

      const res = await fetch(
        `/api/time-suggestions/autofill?${params.toString()}`,
        { cache: "no-store" },
      );

      const payload = (await res.json()) as AutofillRadarResponse & {
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao carregar sugestões.");
      }

      if (!mountedRef.current) return;

      setProposals(payload.proposals ?? []);
      setIntegrationReady(payload.integrationReady);
      setWarnings(payload.warnings ?? []);
      setRange({ from: payload.from, to: payload.to });
    } catch (err: unknown) {
      console.error("[useAutofillRadar] load:", err);
      if (!mountedRef.current) return;

      setProposals([]);
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, [days, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  // Logging hours anywhere else in the app can close a gap the radar is
  // currently showing, so it reloads on the shared update event.
  useEffect(() => {
    if (!enabled) return;

    function handleUpdate() {
      load();
    }

    window.addEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdate);
    };
  }, [enabled, load]);

  const resolve = useCallback((fingerprint: string) => {
    setProposals((current) =>
      current.filter((item) => item.fingerprint !== fingerprint),
    );
  }, []);

  const dismiss = useCallback(
    async (proposal: AutofillProposal) => {
      // Optimistic: the card disappears immediately, the server catches up.
      resolve(proposal.fingerprint);

      try {
        await fetch("/api/time-suggestions/autofill", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fingerprint: proposal.fingerprint,
            date: proposal.date,
            signal: proposal.signal,
            score: proposal.score,
          }),
        });
      } catch (err: unknown) {
        console.error("[useAutofillRadar] dismiss:", err);
      }
    },
    [resolve],
  );

  return useMemo(
    () => ({
      proposals,
      isLoading,
      error,
      integrationReady,
      warnings,
      from: range?.from ?? null,
      to: range?.to ?? null,
      refresh: load,
      resolve,
      dismiss,
    }),
    [
      proposals,
      isLoading,
      error,
      integrationReady,
      warnings,
      range,
      load,
      resolve,
      dismiss,
    ],
  );
}
