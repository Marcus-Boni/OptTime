"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { PeoplePerformanceResponse } from "@/types/people-performance";

export function usePeoplePerformance() {
  const [data, setData] = useState<PeoplePerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const fetchPerformance = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);

    try {
      const response = await fetch("/api/people/performance", {
        cache: "no-store",
        signal: controller.signal,
      });

      if (!response.ok) {
        if (response.status === 401 || response.status === 403) {
          throw new Error(
            "Você não tem permissão para visualizar a performance da equipe.",
          );
        }

        throw new Error("Não foi possível carregar os indicadores da equipe.");
      }

      const nextData = (await response.json()) as PeoplePerformanceResponse;
      setData(nextData);
      setError(null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        return;
      }

      setError(
        err instanceof Error
          ? err.message
          : "Erro inesperado ao carregar a performance da equipe.",
      );
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void fetchPerformance();

    return () => {
      abortRef.current?.abort();
    };
  }, [fetchPerformance]);

  return {
    data,
    loading,
    error,
    refetch: fetchPerformance,
  };
}
