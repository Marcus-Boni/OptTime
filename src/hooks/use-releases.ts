import { useCallback, useEffect, useState } from "react";
import type { AppReleaseStatus } from "@/lib/db/schema";
import type {
  CreateReleaseInput,
  UpdateReleaseInput,
} from "@/lib/validations/release.schema";

export interface Release {
  id: string;
  versionTag: string;
  title: string;
  description: string;
  videoUrl?: string | null;
  status: AppReleaseStatus;
  authorId: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    name: string;
    image: string | null;
  };
}

interface UseReleasesReturn {
  releases: Release[];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  createRelease: (data: CreateReleaseInput) => Promise<Release>;
  updateRelease: (id: string, data: UpdateReleaseInput) => Promise<Release>;
  deleteRelease: (id: string) => Promise<void>;
  publishRelease: (
    id: string,
    notifyUsers: boolean,
  ) => Promise<{
    release: Release;
    email: { sent: number; failed: number } | null;
  }>;
}

export function useReleases(): UseReleasesReturn {
  const [releases, setReleases] = useState<Release[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReleases = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/releases");
      if (!res.ok) throw new Error("Erro ao carregar releases");
      const json = (await res.json()) as { releases: Release[] };
      setReleases(json.releases);
    } catch (err: unknown) {
      console.error("[useReleases] fetchReleases:", err);
      setError(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchReleases();
    return () => {
      // no subscriptions to clean up
    };
  }, [fetchReleases]);

  const createRelease = useCallback(
    async (data: CreateReleaseInput): Promise<Release> => {
      const res = await fetch("/api/releases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: unknown };
        throw new Error(
          typeof body.error === "string" ? body.error : "Erro ao criar release",
        );
      }
      const json = (await res.json()) as { release: Release };
      await fetchReleases();
      return json.release;
    },
    [fetchReleases],
  );

  const updateRelease = useCallback(
    async (id: string, data: UpdateReleaseInput): Promise<Release> => {
      const res = await fetch(`/api/releases/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: unknown };
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Erro ao atualizar release",
        );
      }
      const json = (await res.json()) as { release: Release };
      await fetchReleases();
      return json.release;
    },
    [fetchReleases],
  );

  const deleteRelease = useCallback(
    async (id: string): Promise<void> => {
      const res = await fetch(`/api/releases/${id}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) {
        const body = (await res.json()) as { error: unknown };
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Erro ao excluir release",
        );
      }
      await fetchReleases();
    },
    [fetchReleases],
  );

  const publishRelease = useCallback(
    async (
      id: string,
      notifyUsers: boolean,
    ): Promise<{
      release: Release;
      email: { sent: number; failed: number } | null;
    }> => {
      const res = await fetch(`/api/releases/${id}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notifyUsers }),
      });
      if (!res.ok) {
        const body = (await res.json()) as { error: unknown };
        throw new Error(
          typeof body.error === "string"
            ? body.error
            : "Erro ao publicar release",
        );
      }
      const json = (await res.json()) as {
        release: Release;
        email: { sent: number; failed: number } | null;
      };
      await fetchReleases();
      return json;
    },
    [fetchReleases],
  );

  return {
    releases,
    isLoading,
    error,
    refetch: fetchReleases,
    createRelease,
    updateRelease,
    deleteRelease,
    publishRelease,
  };
}
