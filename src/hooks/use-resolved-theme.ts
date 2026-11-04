"use client";

import { useSyncExternalStore } from "react";
import { type ResolvedTheme, SYSTEM_THEME_QUERY } from "@/lib/theme";
import { useUIStore } from "@/stores/ui.store";

function subscribe(onChange: () => void): () => void {
  const media = window.matchMedia(SYSTEM_THEME_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

function getSystemDark(): boolean {
  return window.matchMedia(SYSTEM_THEME_QUERY).matches;
}

function getServerDark(): boolean {
  return true;
}

export function useResolvedTheme(): ResolvedTheme {
  const theme = useUIStore((state) => state.theme);
  const systemDark = useSyncExternalStore(
    subscribe,
    getSystemDark,
    getServerDark,
  );
  return theme === "system" ? (systemDark ? "dark" : "light") : theme;
}
