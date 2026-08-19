"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useFocusStore } from "@/stores/focus.store";
import { useUIStore } from "@/stores/ui.store";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target.getAttribute("role") === "slider") return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Linear-style global keyboard shortcuts listener.
 *
 * Supported shortcuts:
 * - `N`: New time entry dialog
 * - `T`: New timer entry dialog
 * - `F`: Toggle Focus Mode (Pomodoro)
 * - `?` or `Cmd+/` / `Ctrl+/`: Open keyboard shortcuts cheatsheet
 * - `G` then `D`: Go to Dashboard
 * - `G` then `T`: Go to Time Tracking
 * - `G` then `S`: Go to Timesheets
 * - `G` then `P`: Go to Projects
 * - `G` then `R`: Go to Reports
 */
export function useGlobalShortcuts(): void {
  const router = useRouter();
  const pendingSequenceRef = useRef<string | null>(null);
  const sequenceTimerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // Allow shortcuts with modifier keys (like Cmd+K, Cmd+J, Shift+Cmd+V) to pass through to their handlers
      const isCmdOrCtrl = event.metaKey || event.ctrlKey;

      // Handle Cmd+/ or Ctrl+/ for shortcuts modal
      if (isCmdOrCtrl && event.key === "/") {
        event.preventDefault();
        useUIStore.getState().openShortcutsModal();
        return;
      }

      // Ignore shortcuts if the user is typing in a form or input
      if (isTypingTarget(event.target)) return;
      if (event.altKey) return;

      // Question mark '?' opens shortcuts modal
      if (event.key === "?" && !isCmdOrCtrl) {
        event.preventDefault();
        useUIStore.getState().openShortcutsModal();
        return;
      }

      // Don't trigger single-key actions if Cmd/Ctrl is held down
      if (isCmdOrCtrl) return;

      const key = event.key.toLowerCase();

      // Handle sequence: 'G' followed by second key
      if (pendingSequenceRef.current === "g") {
        pendingSequenceRef.current = null;
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);

        switch (key) {
          case "d":
            event.preventDefault();
            router.push("/dashboard");
            return;
          case "t":
            event.preventDefault();
            router.push("/dashboard/time");
            return;
          case "s":
            event.preventDefault();
            router.push("/dashboard/timesheets");
            return;
          case "p":
            event.preventDefault();
            router.push("/dashboard/projects");
            return;
          case "r":
            event.preventDefault();
            router.push("/dashboard/reports");
            return;
        }
      }

      if (key === "g" && !event.shiftKey) {
        pendingSequenceRef.current = "g";
        if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
        sequenceTimerRef.current = setTimeout(() => {
          pendingSequenceRef.current = null;
        }, 1200);
        return;
      }

      // Single-key shortcuts
      switch (key) {
        case "n": {
          event.preventDefault();
          useUIStore.getState().openQuickEntry();
          break;
        }
        case "t": {
          event.preventDefault();
          useUIStore.getState().openQuickTimer();
          break;
        }
        case "f": {
          event.preventDefault();
          const focus = useFocusStore.getState();
          if (focus.session) focus.open();
          else focus.startSession();
          break;
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      if (sequenceTimerRef.current) clearTimeout(sequenceTimerRef.current);
    };
  }, [router]);
}
