"use client";

import { useCallback, useEffect, useState } from "react";

/** How the assistant panel occupies the screen. */
export type AssistantPanelMode = "docked" | "fullscreen";

export const PANEL_MIN_WIDTH = 380;
export const PANEL_MAX_WIDTH = 960;
export const PANEL_DEFAULT_WIDTH = 460;

/** Viewport below which the panel always takes the whole screen. */
export const PANEL_COMPACT_BREAKPOINT = 640;

/** Step applied when the resize handle is driven by the keyboard. */
const KEYBOARD_STEP = 32;

const STORAGE_KEY = "timebot_panel_v1";

interface PersistedPanelPreferences {
  mode: AssistantPanelMode;
  width: number;
}

/** Keep the panel inside the viewport while honouring the design bounds. */
export function clampPanelWidth(width: number, viewportWidth?: number): number {
  const viewport =
    viewportWidth ??
    (typeof window === "undefined" ? PANEL_MAX_WIDTH : window.innerWidth);

  const upperBound = Math.max(
    PANEL_MIN_WIDTH,
    Math.min(PANEL_MAX_WIDTH, viewport - 72),
  );

  return Math.round(Math.min(Math.max(width, PANEL_MIN_WIDTH), upperBound));
}

export interface AssistantPanelController {
  isOpen: boolean;
  mode: AssistantPanelMode;
  /** Docked width in pixels — ignored in fullscreen and on compact viewports. */
  width: number;
  isResizing: boolean;
  /** True while the viewport is too narrow for a docked panel. */
  isCompactViewport: boolean;
  /** False until the persisted preferences have been read. */
  isHydrated: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  setMode: (mode: AssistantPanelMode) => void;
  toggleFullscreen: () => void;
  setWidth: (width: number) => void;
  nudgeWidth: (delta: number) => void;
  resetWidth: () => void;
  setResizing: (value: boolean) => void;
  keyboardStep: number;
}

/**
 * Owns the assistant shell state: open/closed, docked vs fullscreen and the
 * user-chosen docked width. Preferences survive reloads via localStorage.
 */
export function useAssistantPanel(): AssistantPanelController {
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setModeState] = useState<AssistantPanelMode>("docked");
  const [width, setWidthState] = useState(PANEL_DEFAULT_WIDTH);
  const [isResizing, setIsResizing] = useState(false);
  const [isCompactViewport, setIsCompactViewport] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  // Restore preferences once, on mount.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);

      if (raw) {
        const parsed = JSON.parse(raw) as Partial<PersistedPanelPreferences>;

        if (parsed.mode === "docked" || parsed.mode === "fullscreen") {
          setModeState(parsed.mode);
        }
        if (typeof parsed.width === "number" && Number.isFinite(parsed.width)) {
          setWidthState(clampPanelWidth(parsed.width));
        }
      }
    } catch (error: unknown) {
      console.error("[useAssistantPanel] restore preferences:", error);
    } finally {
      setIsHydrated(true);
    }
  }, []);

  // Persist preferences, but never the transient resizing state.
  // Gated on the hydration *state* so the first render never writes the
  // defaults back over what was just restored.
  useEffect(() => {
    if (!isHydrated) return;

    try {
      const payload: PersistedPanelPreferences = { mode, width };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch (error: unknown) {
      console.error("[useAssistantPanel] persist preferences:", error);
    }
  }, [isHydrated, mode, width]);

  // Track compact viewports. The stored width is the user's *preference* and is
  // never rewritten here — the panel clamps it to the viewport when rendering,
  // so shrinking the window temporarily does not shrink the preference.
  useEffect(() => {
    const query = window.matchMedia(
      `(max-width: ${PANEL_COMPACT_BREAKPOINT - 1}px)`,
    );

    function syncViewport() {
      setIsCompactViewport(query.matches);
    }

    syncViewport();
    query.addEventListener("change", syncViewport);

    return () => query.removeEventListener("change", syncViewport);
  }, []);

  const open = useCallback(() => setIsOpen(true), []);

  const close = useCallback(() => {
    setIsOpen(false);
    setIsResizing(false);
  }, []);

  const toggle = useCallback(() => setIsOpen((previous) => !previous), []);

  const setMode = useCallback((next: AssistantPanelMode) => {
    setModeState(next);
  }, []);

  const toggleFullscreen = useCallback(() => {
    setModeState((previous) =>
      previous === "fullscreen" ? "docked" : "fullscreen",
    );
  }, []);

  const setWidth = useCallback((next: number) => {
    setWidthState(clampPanelWidth(next));
  }, []);

  const nudgeWidth = useCallback((delta: number) => {
    setWidthState((current) => clampPanelWidth(current + delta));
  }, []);

  const resetWidth = useCallback(() => {
    setWidthState(clampPanelWidth(PANEL_DEFAULT_WIDTH));
  }, []);

  return {
    isOpen,
    mode,
    width,
    isResizing,
    isCompactViewport,
    isHydrated,
    open,
    close,
    toggle,
    setMode,
    toggleFullscreen,
    setWidth,
    nudgeWidth,
    resetWidth,
    setResizing: setIsResizing,
    keyboardStep: KEYBOARD_STEP,
  };
}
