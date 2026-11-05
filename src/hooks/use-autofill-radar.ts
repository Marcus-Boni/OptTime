"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { TIME_ENTRIES_UPDATED_EVENT } from "@/lib/time-events";
import type { AutofillProposal, AutofillRadarResponse } from "@/types/autofill";

const DEFAULT_DAYS = 7;
const DISMISS_UNDO_MS = 4500;

function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

async function sendDismissRequest(proposal: AutofillProposal): Promise<void> {
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
  /** Removes it locally with an Undo window before persisting to the server. */
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
  const pendingDismissTimersRef = useRef<
    Map<
      string,
      { timerId: ReturnType<typeof setTimeout>; proposal: AutofillProposal }
    >
  >(new Map());

  useEffect(() => {
    mountedRef.current = true;
    const timersMap = pendingDismissTimersRef.current;

    return () => {
      mountedRef.current = false;
      for (const entry of timersMap.values()) {
        clearTimeout(entry.timerId);
        void sendDismissRequest(entry.proposal);
      }
      timersMap.clear();
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

      const pendingFingerprints = new Set(
        pendingDismissTimersRef.current.keys(),
      );
      const incoming = (payload.proposals ?? []).filter(
        (item) => !pendingFingerprints.has(item.fingerprint),
      );

      setProposals(incoming);
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

  const dismiss = useCallback(async (proposal: AutofillProposal) => {
    let removedIndex = -1;

    setProposals((current) => {
      removedIndex = current.findIndex(
        (item) => item.fingerprint === proposal.fingerprint,
      );
      return current.filter(
        (item) => item.fingerprint !== proposal.fingerprint,
      );
    });

    const existing = pendingDismissTimersRef.current.get(proposal.fingerprint);
    if (existing) {
      clearTimeout(existing.timerId);
    }

    const timerId = setTimeout(() => {
      pendingDismissTimersRef.current.delete(proposal.fingerprint);
      void sendDismissRequest(proposal);
    }, DISMISS_UNDO_MS);

    pendingDismissTimersRef.current.set(proposal.fingerprint, {
      timerId,
      proposal,
    });

    toast("Sugestão descartada", {
      description: `${proposal.projectName} · ${proposal.description}`,
      duration: DISMISS_UNDO_MS,
      action: {
        label: "Desfazer",
        onClick: () => {
          const pending = pendingDismissTimersRef.current.get(
            proposal.fingerprint,
          );
          if (pending) {
            clearTimeout(pending.timerId);
            pendingDismissTimersRef.current.delete(proposal.fingerprint);
          }

          if (!mountedRef.current) return;
          setProposals((current) => {
            if (
              current.some((item) => item.fingerprint === proposal.fingerprint)
            ) {
              return current;
            }
            const next = [...current];
            const insertAt =
              removedIndex >= 0 && removedIndex <= next.length
                ? removedIndex
                : 0;
            next.splice(insertAt, 0, proposal);
            return next;
          });
        },
      },
    });
  }, []);

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
