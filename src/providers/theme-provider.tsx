"use client";

import { useEffect } from "react";
import { applyTheme, SYSTEM_THEME_QUERY } from "@/lib/theme";
import { useUIStore } from "@/stores/ui.store";

/**
 * Restores the persisted preference after hydration and follows OS changes.
 * User changes are applied synchronously by the existing store action.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const syncTheme = () => applyTheme(useUIStore.getState().theme);
    const unsubscribe = useUIStore.persist.onFinishHydration(syncTheme);
    void useUIStore.persist.rehydrate();

    const systemTheme = window.matchMedia(SYSTEM_THEME_QUERY);
    const onSystemChange = () => {
      if (useUIStore.getState().theme === "system") syncTheme();
    };
    systemTheme.addEventListener("change", onSystemChange);
    return () => {
      unsubscribe();
      systemTheme.removeEventListener("change", onSystemChange);
    };
  }, []);

  return <>{children}</>;
}
