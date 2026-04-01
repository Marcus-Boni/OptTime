"use client";

import { useCallback, useEffect, useState } from "react";
import type { SuggestionStatus } from "@/lib/db/schema";
import type {
  CreateSuggestionInput,
  UpdateSuggestionStatusInput,
} from "@/lib/validations/suggestion.schema";

export interface SuggestionAuthor {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface SuggestionReviewer {
  id: string;
  name: string;
}

export interface Suggestion {
  id: string;
  userId: string;
  title: string;
  description: string;
  status: SuggestionStatus;
  adminNotes: string | null;
  reviewedById: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
  user: SuggestionAuthor;
  reviewedBy: SuggestionReviewer | null;
}

export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSuggestions = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/suggestions");
      if (!res.ok) throw new Error("Falha ao carregar sugestões");
      const data = await res.json();
      setSuggestions(data.suggestions ?? []);
    } catch (err: unknown) {
      console.error("[useSuggestions] fetchSuggestions:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSuggestions();
  }, [fetchSuggestions]);

  const createSuggestion = useCallback(
    async (data: CreateSuggestionInput): Promise<Suggestion> => {
      const res = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao criar sugestão");
      }
      const result = await res.json();
      await fetchSuggestions();
      return result.suggestion as Suggestion;
    },
    [fetchSuggestions],
  );

  const updateSuggestionStatus = useCallback(
    async (id: string, data: UpdateSuggestionStatusInput): Promise<void> => {
      const res = await fetch(`/api/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Falha ao atualizar sugestão");
      }
      await fetchSuggestions();
    },
    [fetchSuggestions],
  );

  return {
    suggestions,
    isLoading,
    error,
    refetch: fetchSuggestions,
    createSuggestion,
    updateSuggestionStatus,
  };
}
