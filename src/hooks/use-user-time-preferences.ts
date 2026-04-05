"use client";

import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { authClient, useSession } from "@/lib/auth-client";
import {
  resolveTimePreferences,
  saveLocalTimePreference,
} from "@/lib/time-preferences";
import type { UpdateProfileInput } from "@/lib/validations/profile.schema";
import type { User } from "@/types/user";

type PersistedTimePreferencePatch = Pick<
  UpdateProfileInput,
  | "timeAssistantEnabled"
  | "timeDefaultBillable"
  | "timeDefaultDuration"
  | "timeDefaultView"
  | "timeOutlookDefaultOpen"
  | "timeShowWeekends"
  | "timeSubmitMode"
>;

interface UpdateTimePreferencesOptions {
  errorMessage?: string;
  showErrorToast?: boolean;
}

export function useUserTimePreferences() {
  const { data: session } = useSession();
  const user = session?.user as unknown as User | undefined;
  const [isSaving, setIsSaving] = useState(false);

  const preferences = useMemo(() => resolveTimePreferences(user), [user]);

  const updatePreferences = useCallback(
    async (
      patch: Partial<PersistedTimePreferencePatch>,
      options?: UpdateTimePreferencesOptions,
    ) => {
      if (Object.keys(patch).length === 0) {
        return true;
      }

      setIsSaving(true);

      try {
        const response = await fetch("/api/user/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });

        if (!response.ok) {
          const payload = await response.json().catch(() => ({}));
          const message =
            typeof payload?.error === "string"
              ? payload.error
              : (options?.errorMessage ??
                "Nao foi possivel salvar suas preferencias.");

          if (options?.showErrorToast !== false) {
            toast.error(message);
          }

          return false;
        }

        await authClient.getSession({ query: { disableCookieCache: true } });
        return true;
      } catch (error) {
        console.error("[useUserTimePreferences] updatePreferences:", error);

        if (options?.showErrorToast !== false) {
          toast.error(
            options?.errorMessage ??
              "Nao foi possivel salvar suas preferencias.",
          );
        }

        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const saveLastProjectId = useCallback((projectId: string | null) => {
    saveLocalTimePreference("lastProjectId", projectId);
  }, []);

  return {
    isSaving,
    preferences,
    saveLastProjectId,
    updatePreferences,
    user,
  };
}
