"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

export type SuggestionConfidence = "high" | "medium" | "low";

export interface TimeSuggestion {
  fingerprint: string;
  projectId: string | null;
  projectName: string | null;
  description: string;
  date: string;
  duration: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  score: number;
  confidence: SuggestionConfidence;
  reasons: string[];
  sourceBreakdown: {
    commits: number;
    meetings: number;
    recency: number;
  };
  payload: {
    projectId: string;
    description: string;
    date: string;
    duration: number;
    billable: boolean;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
  } | null;
}

interface UseTimeSuggestionsOptions {
  date: string;
  timezone: string;
  enabled: boolean;
}

interface SuggestionsResponse {
  suggestions?: TimeSuggestion[];
}

export function useTimeSuggestions({
  date,
  timezone,
  enabled,
}: UseTimeSuggestionsOptions) {
  const [suggestions, setSuggestions] = useState<TimeSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    if (!enabled) {
      setSuggestions([]);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ date, timezone });
      const response = await fetch(
        `/api/time-suggestions?${params.toString()}`,
        {
          cache: "no-store",
        },
      );

      const payload = (await response.json()) as SuggestionsResponse & {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Falha ao carregar sugestões");
      }

      setSuggestions(payload.suggestions ?? []);
    } catch (err) {
      setSuggestions([]);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setLoading(false);
    }
  }, [date, enabled, timezone]);

  const sendFeedback = useCallback(
    async (
      suggestion: TimeSuggestion,
      action: "accepted" | "edited" | "rejected",
      editedFields?: string[],
    ) => {
      await fetch("/api/time-suggestions/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date,
          suggestionFingerprint: suggestion.fingerprint,
          action,
          editedFields,
          sourceBreakdown: suggestion.sourceBreakdown,
          score: suggestion.score,
        }),
      });
    },
    [date],
  );

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  const orderedSuggestions = useMemo(() => {
    return [...suggestions].sort((a, b) => b.score - a.score);
  }, [suggestions]);

  return {
    suggestions: orderedSuggestions,
    loading,
    error,
    refetch: fetchSuggestions,
    sendFeedback,
  };
}
