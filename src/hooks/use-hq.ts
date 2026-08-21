"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  BatchApprovalResult,
  HqApprovalsResponse,
  HqHealthResponse,
  PortalLinkSummary,
  ScopeCreepResponse,
  WorkloadMatrixResponse,
} from "@/types/hq";

/** Shared fetch-state contract for every HQ resource. */
interface HqResource<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

function useHqResource<T>(url: string | null): HqResource<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(url));
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!url) {
      setData(null);
      setIsLoading(false);
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(url, {
        cache: "no-store",
        signal: controller.signal,
      });
      const payload = (await res.json()) as T & { error?: string };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha ao carregar dados.");
      }

      setData(payload);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      console.error(`[useHqResource] ${url}:`, err);
      setError(err instanceof Error ? err.message : "Erro desconhecido.");
    } finally {
      if (abortRef.current === controller) {
        setIsLoading(false);
      }
    }
  }, [url]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  return useMemo(
    () => ({ data, isLoading, error, refresh: load }),
    [data, isLoading, error, load],
  );
}

// ─── Health Radar ─────────────────────────────────────────────────────

export function useHqHealth(): HqResource<HqHealthResponse> {
  return useHqResource<HqHealthResponse>("/api/hq/health");
}

export function useScopeCreep(
  projectId: string,
  enabled: boolean,
): HqResource<ScopeCreepResponse> {
  return useHqResource<ScopeCreepResponse>(
    enabled ? `/api/hq/scope-creep?projectId=${projectId}` : null,
  );
}

// ─── Workload Matrix + allocations ────────────────────────────────────

export interface UpsertAllocationPayload {
  userId: string;
  projectId: string;
  week: string;
  plannedMinutes: number;
  note?: string | null;
}

export interface WorkloadController extends HqResource<WorkloadMatrixResponse> {
  upsertAllocation: (payload: UpsertAllocationPayload) => Promise<void>;
  removeAllocation: (allocationId: string) => Promise<void>;
}

export function useHqWorkload(past = 4, future = 4): WorkloadController {
  const resource = useHqResource<WorkloadMatrixResponse>(
    `/api/hq/workload?past=${past}&future=${future}`,
  );

  const upsertAllocation = useCallback(
    async (payload: UpsertAllocationPayload) => {
      const res = await fetch("/api/hq/allocations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Falha ao salvar alocação.");
      }

      await resource.refresh();
    },
    [resource],
  );

  const removeAllocation = useCallback(
    async (allocationId: string) => {
      const res = await fetch(`/api/hq/allocations/${allocationId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Falha ao remover alocação.");
      }

      await resource.refresh();
    },
    [resource],
  );

  return useMemo(
    () => ({ ...resource, upsertAllocation, removeAllocation }),
    [resource, upsertAllocation, removeAllocation],
  );
}

// ─── Approval Center ──────────────────────────────────────────────────

export interface ApprovalsController extends HqResource<HqApprovalsResponse> {
  approveBatch: (timesheetIds: string[]) => Promise<BatchApprovalResult[]>;
  approveOne: (timesheetId: string) => Promise<void>;
  rejectOne: (timesheetId: string, reason: string) => Promise<void>;
}

export function useHqApprovals(): ApprovalsController {
  const resource = useHqResource<HqApprovalsResponse>("/api/hq/approvals");

  const approveBatch = useCallback(
    async (timesheetIds: string[]) => {
      const res = await fetch("/api/hq/approvals/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timesheetIds }),
      });

      const payload = (await res.json().catch(() => ({}))) as {
        results?: BatchApprovalResult[];
        error?: string;
      };

      if (!res.ok) {
        throw new Error(payload.error ?? "Falha na aprovação em lote.");
      }

      await resource.refresh();
      return payload.results ?? [];
    },
    [resource],
  );

  const approveOne = useCallback(
    async (timesheetId: string) => {
      const res = await fetch(`/api/timesheets/${timesheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Falha ao aprovar timesheet.");
      }

      await resource.refresh();
    },
    [resource],
  );

  const rejectOne = useCallback(
    async (timesheetId: string, reason: string) => {
      const res = await fetch(`/api/timesheets/${timesheetId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", rejectionReason: reason }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Falha ao rejeitar timesheet.");
      }

      await resource.refresh();
    },
    [resource],
  );

  return useMemo(
    () => ({ ...resource, approveBatch, approveOne, rejectOne }),
    [resource, approveBatch, approveOne, rejectOne],
  );
}

// ─── Client Portal links ──────────────────────────────────────────────

export interface CreatePortalLinkPayload {
  projectId: string;
  label: string;
  password?: string | null;
  expiresInDays?: number | null;
  showBudget: boolean;
  showTeam: boolean;
  showDescriptions: boolean;
}

export interface CreatedPortalLink {
  id: string;
  url: string;
  hasPassword: boolean;
  expiresAt: string | null;
}

interface PortalLinksResponse {
  links: PortalLinkSummary[];
  manageableProjects: Array<{
    id: string;
    name: string;
    code: string;
    color: string;
  }>;
}

export interface PortalLinksController extends HqResource<PortalLinksResponse> {
  createLink: (payload: CreatePortalLinkPayload) => Promise<CreatedPortalLink>;
  revokeLink: (linkId: string) => Promise<void>;
  deleteLink: (linkId: string) => Promise<void>;
}

export function usePortalLinks(): PortalLinksController {
  const resource = useHqResource<PortalLinksResponse>("/api/hq/portal-links");

  const createLink = useCallback(
    async (payload: CreatePortalLinkPayload) => {
      const res = await fetch("/api/hq/portal-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const body = (await res.json().catch(() => ({}))) as {
        link?: CreatedPortalLink;
        error?: string;
      };

      if (!res.ok || !body.link) {
        throw new Error(body.error ?? "Falha ao criar o link do portal.");
      }

      await resource.refresh();
      return body.link;
    },
    [resource],
  );

  const revokeLink = useCallback(
    async (linkId: string) => {
      const res = await fetch(`/api/hq/portal-links/${linkId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "revoke" }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Falha ao revogar o link.");
      }

      await resource.refresh();
    },
    [resource],
  );

  const deleteLink = useCallback(
    async (linkId: string) => {
      const res = await fetch(`/api/hq/portal-links/${linkId}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "Falha ao excluir o link.");
      }

      await resource.refresh();
    },
    [resource],
  );

  return useMemo(
    () => ({ ...resource, createLink, revokeLink, deleteLink }),
    [resource, createLink, revokeLink, deleteLink],
  );
}
