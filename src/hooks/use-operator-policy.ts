"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppRole } from "@/lib/access-control";
import { resolvePermission } from "@/lib/ai/operator/policy";
import {
  DEFAULT_OPERATOR_SETTINGS,
  type OperatorActionCategory,
  type OperatorPermission,
  type OperatorSettings,
} from "@/lib/ai/operator/types";
import type { OperatorActionKind } from "@/lib/ai/types";
import type { UpdateOperatorPolicyInput } from "@/lib/validations/operator.schema";

/** Action catalogue as served by the API for the current role. */
export interface OperatorActionOption {
  kind: OperatorActionKind;
  category: OperatorActionCategory;
  label: string;
  description: string;
  risk: "low" | "medium" | "high";
  reversible: boolean;
  outward: boolean;
  canAutoRun: boolean;
}

export const OPERATOR_POLICY_UPDATED_EVENT = "operator-policy:updated";

/** Keeps every mounted consumer in sync after a settings change. */
export function dispatchOperatorPolicyUpdated() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPERATOR_POLICY_UPDATED_EVENT));
}

interface PolicyResponse {
  settings: OperatorSettings;
  actions: OperatorActionOption[];
  role: AppRole;
}

export interface OperatorPolicyController {
  settings: OperatorSettings;
  actions: OperatorActionOption[];
  role: AppRole;
  isLoading: boolean;
  isSaving: boolean;
  /** Verdict for one action, using the same rules the server applies. */
  permissionFor: (kind: OperatorActionKind) => OperatorPermission;
  save: (input: UpdateOperatorPolicyInput) => Promise<boolean>;
  refresh: () => Promise<void>;
}

export function useOperatorPolicy(): OperatorPolicyController {
  const [settings, setSettings] = useState<OperatorSettings>(
    DEFAULT_OPERATOR_SETTINGS,
  );
  const [actions, setActions] = useState<OperatorActionOption[]>([]);
  const [role, setRole] = useState<AppRole>("member");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/operator/policy");
      if (!res.ok) return;

      const data = (await res.json()) as PolicyResponse;
      if (!mountedRef.current) return;

      setSettings(data.settings);
      setActions(data.actions);
      setRole(data.role);
    } catch (error: unknown) {
      console.error("[useOperatorPolicy] load:", error);
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Another surface (settings page, quick toggle) may change the policy while
  // this consumer is mounted.
  useEffect(() => {
    function handleUpdate() {
      load();
    }

    window.addEventListener(OPERATOR_POLICY_UPDATED_EVENT, handleUpdate);
    return () => {
      window.removeEventListener(OPERATOR_POLICY_UPDATED_EVENT, handleUpdate);
    };
  }, [load]);

  const save = useCallback(
    async (input: UpdateOperatorPolicyInput): Promise<boolean> => {
      setIsSaving(true);

      try {
        const res = await fetch("/api/operator/policy", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        });

        if (!res.ok) return false;

        const data = (await res.json()) as { settings: OperatorSettings };
        if (mountedRef.current) setSettings(data.settings);

        dispatchOperatorPolicyUpdated();
        return true;
      } catch (error: unknown) {
        console.error("[useOperatorPolicy] save:", error);
        return false;
      } finally {
        if (mountedRef.current) setIsSaving(false);
      }
    },
    [],
  );

  const permissionFor = useCallback(
    (kind: OperatorActionKind) => resolvePermission(kind, settings, role),
    [settings, role],
  );

  return useMemo(
    () => ({
      settings,
      actions,
      role,
      isLoading,
      isSaving,
      permissionFor,
      save,
      refresh: load,
    }),
    [settings, actions, role, isLoading, isSaving, permissionFor, save, load],
  );
}
