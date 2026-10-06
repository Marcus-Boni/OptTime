"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkItemSearchResult } from "@/types/azure-devops";

type WorkItemsErrorCode =
  | "UNAUTHORIZED"
  | "INTEGRATION_NOT_CONFIGURED"
  | "INVALID_PAT"
  | "AZURE_AUTH_FAILED"
  | "AZURE_PROJECT_NOT_FOUND"
  | "BAD_REQUEST"
  | "UNKNOWN";

interface WorkItemsErrorState {
  code: WorkItemsErrorCode;
  message: string;
}

function normalizeErrorCode(code: unknown): WorkItemsErrorCode {
  switch (code) {
    case "UNAUTHORIZED":
    case "INTEGRATION_NOT_CONFIGURED":
    case "INVALID_PAT":
    case "AZURE_AUTH_FAILED":
    case "AZURE_PROJECT_NOT_FOUND":
    case "BAD_REQUEST":
      return code;
    default:
      return "UNKNOWN";
  }
}

/** @param azureProjectRef Azure DevOps project id or name */
export function useWorkItems(azureProjectRef: string | null) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkItemSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<WorkItemsErrorState | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (!azureProjectRef) return;
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({ project: azureProjectRef });
        if (q) params.set("q", q);
        const res = await fetch(
          `/api/integrations/azure-devops/work-items?${params.toString()}`,
        );
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            code?: unknown;
            error?: string;
          } | null;
          setResults([]);
          setError({
            code: normalizeErrorCode(data?.code),
            message:
              data?.error ??
              "Não foi possível carregar os work items deste projeto.",
          });
          return;
        }
        const data = (await res.json()) as {
          workItems?: WorkItemSearchResult[];
        };
        setResults(data.workItems ?? []);
        setError(null);
      } catch {
        setResults([]);
        setError({
          code: "UNKNOWN",
          message:
            "Não foi possível carregar os work items no momento. Tente novamente.",
        });
      } finally {
        setLoading(false);
      }
    },
    [azureProjectRef],
  );

  // Load initial items when project changes
  useEffect(() => {
    if (!azureProjectRef) {
      setQuery("");
      setResults([]);
      setError(null);
      return;
    }
    void search("");
  }, [azureProjectRef, search]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        void search(value);
      }, 300);
    },
    [search],
  );

  const refresh = useCallback(() => {
    if (!azureProjectRef) return;
    void search(query);
  }, [azureProjectRef, query, search]);

  return {
    query,
    results,
    loading,
    error,
    refresh,
    setQuery: handleQueryChange,
  };
}
