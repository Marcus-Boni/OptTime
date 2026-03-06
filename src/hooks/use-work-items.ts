"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { WorkItemSearchResult } from "@/types/azure-devops";

export function useWorkItems(projectName: string | null) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WorkItemSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (q: string) => {
      if (!projectName) return;
      setLoading(true);
      try {
        const params = new URLSearchParams({ project: projectName });
        if (q) params.set("q", q);
        const res = await fetch(
          `/api/integrations/azure-devops/work-items?${params.toString()}`,
        );
        if (!res.ok) {
          setResults([]);
          return;
        }
        const data = await res.json();
        setResults(data.workItems ?? []);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    [projectName],
  );

  // Load initial items when project changes
  useEffect(() => {
    if (!projectName) {
      setResults([]);
      return;
    }
    search("");
  }, [projectName, search]);

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => search(value), 300);
    },
    [search],
  );

  return { query, results, loading, setQuery: handleQueryChange };
}
