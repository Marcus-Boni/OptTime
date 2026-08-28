"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  TeamHourEntry,
  TeamHoursCollaboratorResponse,
  TeamHoursEntriesResponse,
  TeamHoursSortOption,
  TeamHoursSummaryResponse,
} from "@/types/team-hours";

export type {
  TeamHourEntry,
  TeamHourProject,
  TeamHourUser,
} from "@/types/team-hours";

/** Filters shared by every team-hours request. */
export interface TeamHoursFilters {
  from?: string;
  to?: string;
  userId?: string;
  projectId?: string;
  search?: string;
}

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Which request `data` belongs to, so stale results are never trusted. */
  loadedUrl: string | null;
}

function buildParams(
  filters: TeamHoursFilters,
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams();

  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.userId && filters.userId !== "all") {
    params.set("userId", filters.userId);
  }
  if (filters.projectId && filters.projectId !== "all") {
    params.set("projectId", filters.projectId);
  }
  if (filters.search?.trim()) params.set("q", filters.search.trim());

  for (const [key, value] of Object.entries(extra)) {
    params.set(key, value);
  }

  return params.toString();
}

function messageForStatus(status: number): string {
  if (status === 401 || status === 403) {
    return "Acesso negado para visualizar estas informações.";
  }
  return "Falha ao carregar horas da equipe.";
}

/**
 * Fetches a team-hours endpoint, cancelling the previous in-flight request so
 * fast filter changes never render a stale response.
 */
function useTeamHoursResource<T>(url: string | null): {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
} {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: url !== null,
    error: null,
    loadedUrl: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!url) {
      setState({ data: null, loading: false, error: null, loadedUrl: null });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({ ...current, loading: true }));

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(messageForStatus(response.status));
      }

      const data = (await response.json()) as T;
      setState({ data, loading: false, error: null, loadedUrl: url });
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      console.error("[useTeamHours] load:", error);
      setState({
        data: null,
        loading: false,
        loadedUrl: url,
        error:
          error instanceof Error
            ? error.message
            : "Erro desconhecido ao buscar dados.",
      });
    }
  }, [url]);

  useEffect(() => {
    void load();

    return () => {
      abortRef.current?.abort();
    };
  }, [load]);

  // A changed `url` is already pending even though the effect has not run yet.
  // Reporting that synchronously is what stops an empty state from flashing
  // between the filter change and the first byte of the new response.
  const pending = url !== null && (state.loading || state.loadedUrl !== url);

  return {
    // Stale-while-revalidate: the previous result stays on screen while the
    // next one is in flight, so changing a filter never blanks the page.
    data: state.data,
    loading: pending,
    // An error only belongs to the request that produced it.
    error: pending ? null : state.error,
    refetch: load,
  };
}

/** KPI totals, collaborator rollup and filter options — all aggregated in SQL. */
export function useTeamHoursSummary(filters: TeamHoursFilters) {
  const url = useMemo(
    () => `/api/team-hours/summary?${buildParams(filters)}`,
    [filters],
  );

  return useTeamHoursResource<TeamHoursSummaryResponse>(url);
}

/** One page of the detailed table; search and sort run server-side. */
export function useTeamHoursEntries(
  filters: TeamHoursFilters,
  options: { page: number; pageSize: number; sort: TeamHoursSortOption },
  enabled = true,
) {
  const url = useMemo(() => {
    if (!enabled) return null;

    return `/api/team-hours?${buildParams(filters, {
      page: String(options.page),
      pageSize: String(options.pageSize),
      sort: options.sort,
    })}`;
  }, [enabled, filters, options.page, options.pageSize, options.sort]);

  return useTeamHoursResource<TeamHoursEntriesResponse>(url);
}

/** Every entry of the selected collaborator: weekly board + project breakdown. */
export function useTeamHoursCollaborator(
  filters: TeamHoursFilters,
  userId: string | null,
) {
  const url = useMemo(() => {
    if (!userId) return null;

    return `/api/team-hours/collaborator?${buildParams({
      ...filters,
      userId,
    })}`;
  }, [filters, userId]);

  return useTeamHoursResource<TeamHoursCollaboratorResponse>(url);
}

/**
 * Puts avatars back on entries the API deliberately shipped without them.
 *
 * The summary payload carries each person's image exactly once; the entry
 * endpoints omit it so a single avatar is never repeated across thousands of
 * rows. This is where the two halves meet.
 */
export function hydrateAvatars(
  entries: TeamHourEntry[],
  avatars: Map<string, string | null>,
): TeamHourEntry[] {
  if (avatars.size === 0) return entries;

  return entries.map((entry) =>
    entry.user.image
      ? entry
      : {
          ...entry,
          user: { ...entry.user, image: avatars.get(entry.user.id) ?? null },
        },
  );
}

/**
 * Pulls every entry matching the filters, page by page, for PDF export.
 * Kept out of render state on purpose — it only runs when the user exports.
 */
export async function fetchAllTeamHoursEntries(
  filters: TeamHoursFilters,
  sort: TeamHoursSortOption = "newest",
  maxEntries = 5000,
): Promise<TeamHourEntry[]> {
  const pageSize = 500;
  const entries: TeamHourEntry[] = [];

  for (let page = 0; entries.length < maxEntries; page += 1) {
    const response = await fetch(
      `/api/team-hours?${buildParams(filters, {
        page: String(page),
        pageSize: String(pageSize),
        sort,
      })}`,
    );

    if (!response.ok) {
      throw new Error(messageForStatus(response.status));
    }

    const data = (await response.json()) as TeamHoursEntriesResponse;
    entries.push(...data.entries);

    if (data.entries.length < pageSize || entries.length >= data.total) {
      break;
    }
  }

  return entries;
}
