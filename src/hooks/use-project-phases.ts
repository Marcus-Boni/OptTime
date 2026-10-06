"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProjectPhaseLineage } from "@/lib/projects/phases";

interface UseProjectPhasesResult {
  lineage: ProjectPhaseLineage | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

/** Phase history of a project (every phase sharing its lineage). */
export function useProjectPhases(
  projectId: string | null,
): UseProjectPhasesResult {
  const [lineage, setLineage] = useState<ProjectPhaseLineage | null>(null);
  const [loading, setLoading] = useState(Boolean(projectId));
  const [error, setError] = useState<string | null>(null);
  // Only the latest request may write state: navigating between phases
  // re-renders the same page with another id while a fetch is in flight.
  const requestIdRef = useRef(0);

  const refresh = useCallback(async (): Promise<void> => {
    if (!projectId) return;

    const requestId = ++requestIdRef.current;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/phases`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as ProjectPhaseLineage;
      if (requestId !== requestIdRef.current) return;
      setLineage(data);
      setError(null);
    } catch (fetchError: unknown) {
      if (requestId !== requestIdRef.current) return;
      console.error("[useProjectPhases] refresh:", fetchError);
      setError("Não foi possível carregar as fases do projeto.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    setLineage(null);
    setError(null);
    void refresh();
  }, [refresh]);

  return { lineage, loading, error, refresh };
}
