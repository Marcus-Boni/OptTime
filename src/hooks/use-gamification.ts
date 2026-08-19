"use client";

import { useCallback, useEffect, useState } from "react";
import { GAMIFICATION_UPDATED_EVENT } from "@/lib/gamification/celebration-bus";
import type {
  GamificationProfile,
  PersonalInsightsReport,
  TeamMural,
} from "@/lib/gamification/types";
import { TIMESHEETS_UPDATED_EVENT } from "@/lib/time-events";

interface UseGamificationOptions {
  enabled?: boolean;
}

/** Refetch whenever a week is closed or XP changes anywhere in the app. */
function useRefreshEvents(handler: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    window.addEventListener(GAMIFICATION_UPDATED_EVENT, handler);
    window.addEventListener(TIMESHEETS_UPDATED_EVENT, handler);
    return () => {
      window.removeEventListener(GAMIFICATION_UPDATED_EVENT, handler);
      window.removeEventListener(TIMESHEETS_UPDATED_EVENT, handler);
    };
  }, [handler, enabled]);
}

export interface UseGamificationProfileResult {
  profile: GamificationProfile | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  updatePreferences: (input: {
    publicProfile?: boolean;
    celebrationsEnabled?: boolean;
  }) => Promise<void>;
}

export function useGamificationProfile(
  options: UseGamificationOptions = {},
): UseGamificationProfileResult {
  const enabled = options.enabled ?? true;
  const [profile, setProfile] = useState<GamificationProfile | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchProfile = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/gamification/profile");
      if (!res.ok) throw new Error("Falha ao carregar sua jornada");
      const data = (await res.json()) as { profile: GamificationProfile };
      setProfile(data.profile);
      setError(null);
    } catch (err: unknown) {
      console.error("[useGamificationProfile] fetchProfile:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchProfile();
  }, [fetchProfile]);

  useRefreshEvents(
    useCallback(() => {
      void fetchProfile();
    }, [fetchProfile]),
    enabled,
  );

  const updatePreferences = useCallback(
    async (input: {
      publicProfile?: boolean;
      celebrationsEnabled?: boolean;
    }) => {
      // Optimistic: these toggles must feel instant.
      setProfile((current) =>
        current
          ? { ...current, preferences: { ...current.preferences, ...input } }
          : current,
      );

      const res = await fetch("/api/gamification/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        await fetchProfile();
        throw new Error("Não foi possível salvar a preferência.");
      }
    },
    [fetchProfile],
  );

  return { profile, loading, error, refetch: fetchProfile, updatePreferences };
}

export interface UseGamificationInsightsResult {
  report: PersonalInsightsReport | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useGamificationInsights(
  weeks?: number,
  options: UseGamificationOptions = {},
): UseGamificationInsightsResult {
  const enabled = options.enabled ?? true;
  const [report, setReport] = useState<PersonalInsightsReport | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchInsights = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      const query = weeks ? `?weeks=${weeks}` : "";
      const res = await fetch(`/api/gamification/insights${query}`);
      if (!res.ok) throw new Error("Falha ao carregar seus insights");
      const data = (await res.json()) as { report: PersonalInsightsReport };
      setReport(data.report);
      setError(null);
    } catch (err: unknown) {
      console.error("[useGamificationInsights] fetchInsights:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [enabled, weeks]);

  useEffect(() => {
    void fetchInsights();
  }, [fetchInsights]);

  useRefreshEvents(
    useCallback(() => {
      void fetchInsights();
    }, [fetchInsights]),
    enabled,
  );

  return { report, loading, error, refetch: fetchInsights };
}

export interface UseTeamMuralResult {
  mural: TeamMural | null;
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

export function useTeamMural(
  options: UseGamificationOptions = {},
): UseTeamMuralResult {
  const enabled = options.enabled ?? true;
  const [mural, setMural] = useState<TeamMural | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const fetchMural = useCallback(async () => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    try {
      const res = await fetch("/api/gamification/mural");
      if (!res.ok) throw new Error("Falha ao carregar o mural da equipe");
      const data = (await res.json()) as { mural: TeamMural };
      setMural(data.mural);
      setError(null);
    } catch (err: unknown) {
      console.error("[useTeamMural] fetchMural:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void fetchMural();
  }, [fetchMural]);

  useRefreshEvents(
    useCallback(() => {
      void fetchMural();
    }, [fetchMural]),
    enabled,
  );

  return { mural, loading, error, refetch: fetchMural };
}
