"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  /** Sidebar collapsed state */
  sidebarCollapsed: boolean;
  /** Current theme */
  theme: "dark" | "light";
  /** Active modal identifier */
  activeModal: string | null;
  /** Whether mobile sidebar is open */
  mobileSidebarOpen: boolean;
  /** Whether the quick time-entry dialog is open */
  quickEntryOpen: boolean;
  /** Whether the command palette is open */
  commandPaletteOpen: boolean;
}

interface UIActions {
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setTheme: (theme: "dark" | "light") => void;
  toggleTheme: () => void;
  openModal: (id: string) => void;
  closeModal: () => void;
  setMobileSidebarOpen: (open: boolean) => void;
  openQuickEntry: () => void;
  closeQuickEntry: () => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
}

export const useUIStore = create<UIState & UIActions>()(
  persist(
    (set) => ({
      sidebarCollapsed: false,
      theme: "dark",
      activeModal: null,
      mobileSidebarOpen: false,
      quickEntryOpen: false,
      commandPaletteOpen: false,

      toggleSidebar: () =>
        set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
      setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () =>
        set((s) => ({ theme: s.theme === "dark" ? "light" : "dark" })),
      openModal: (id) => set({ activeModal: id }),
      closeModal: () => set({ activeModal: null }),
      setMobileSidebarOpen: (open) => set({ mobileSidebarOpen: open }),
      openQuickEntry: () => set({ quickEntryOpen: true }),
      closeQuickEntry: () => set({ quickEntryOpen: false }),
      openCommandPalette: () => set({ commandPaletteOpen: true }),
      closeCommandPalette: () => set({ commandPaletteOpen: false }),
    }),
    {
      name: "optsolv-ui",
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
