"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { changeTheme, resolveTheme, type ThemePreference } from "@/lib/theme";

interface UIState {
  /** Sidebar collapsed state */
  sidebarCollapsed: boolean;
  /** Current theme */
  theme: ThemePreference;
  /** Active modal identifier */
  activeModal: string | null;
  /** Whether mobile sidebar is open */
  mobileSidebarOpen: boolean;
  /** Whether the quick time-entry dialog is open */
  quickEntryOpen: boolean;
  /** Whether the quick timer-start dialog is open */
  quickTimerOpen: boolean;
  /** Context used to prefill the quick time-entry dialog */
  quickEntryContext: {
    date?: string;
    initialValues?: {
      azureWorkItemId?: number;
      azureWorkItemTitle?: string;
      billable?: boolean;
      date?: string;
      description?: string;
      duration?: number;
      projectId?: string;
    };
    source?: string;
  } | null;
  /** Whether the command palette is open */
  commandPaletteOpen: boolean;
  /** Whether the keyboard shortcuts cheatsheet modal is open */
  shortcutsModalOpen: boolean;
  /** Whether the weekly AI digest dialog is open */
  weeklyDigestModalOpen: boolean;
  /** Currently selected date in the time workspace */
  timePageDate: string | null;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: ThemePreference) => void;
  toggleTheme: () => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  openQuickEntry: (context?: UIState["quickEntryContext"]) => void;
  closeQuickEntry: () => void;
  openQuickTimer: () => void;
  closeQuickTimer: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  openShortcutsModal: () => void;
  closeShortcutsModal: () => void;
  openWeeklyDigestModal: () => void;
  closeWeeklyDigestModal: () => void;
  setTimePageDate: (date: string | null) => void;
}

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set, get) => ({
      sidebarCollapsed: false,
      theme: "dark",
      activeModal: null,
      mobileSidebarOpen: false,
      quickEntryOpen: false,
      quickTimerOpen: false,
      quickEntryContext: null,
      commandPaletteOpen: false,
      shortcutsModalOpen: false,
      weeklyDigestModalOpen: false,
      timePageDate: null,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setTheme: (theme) => changeTheme(theme, () => set({ theme })),
      toggleTheme: () => {
        const current =
          typeof document === "undefined"
            ? resolveTheme(get().theme)
            : document.documentElement.classList.contains("dark")
              ? "dark"
              : "light";
        get().setTheme(current === "dark" ? "light" : "dark");
      },
      openModal: (id) => set({ activeModal: id }),
      closeModal: () => set({ activeModal: null }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      openQuickEntry: (context) =>
        set({ quickEntryOpen: true, quickEntryContext: context ?? null }),
      closeQuickEntry: () =>
        set({ quickEntryOpen: false, quickEntryContext: null }),
      openQuickTimer: () => set({ quickTimerOpen: true }),
      closeQuickTimer: () => set({ quickTimerOpen: false }),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
      openShortcutsModal: () => set({ shortcutsModalOpen: true }),
      closeShortcutsModal: () => set({ shortcutsModalOpen: false }),
      openWeeklyDigestModal: () => set({ weeklyDigestModalOpen: true }),
      closeWeeklyDigestModal: () => set({ weeklyDigestModalOpen: false }),
      setTimePageDate: (date) => set({ timePageDate: date }),
    }),
    {
      name: "optsolv-ui",
      storage: createJSONStorage(() => ({
        getItem: (name) => {
          try {
            return localStorage.getItem(name);
          } catch {
            return null;
          }
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, value);
          } catch {
            // Keep the current session usable when storage is blocked or full.
          }
        },
        removeItem: (name) => {
          try {
            localStorage.removeItem(name);
          } catch {
            // Persistence is optional; the in-memory preference still applies.
          }
        },
      })),
      partialize: (state) => ({
        sidebarCollapsed: state.sidebarCollapsed,
        theme: state.theme,
      }),
      // Prevent SSR/client hydration mismatch: persisted values (theme, sidebar)
      // differ from server defaults, which shifts React's useId() counter and
      // causes Radix UI IDs to differ. skipHydration keeps the default values
      // during SSR and the first client render; rehydrate() is called in a
      // useEffect after React hydration completes.
      skipHydration: true,
    },
  ),
);
