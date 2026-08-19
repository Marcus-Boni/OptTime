"use client";

import { AnimatePresence } from "framer-motion";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FocusModeOverlay } from "@/components/focus/FocusModeOverlay";
import { FocusPill } from "@/components/focus/FocusPill";
import { TooltipProvider } from "@/components/ui/tooltip";
import { usePomodoro } from "@/hooks/use-pomodoro";
import { useFocusStore } from "@/stores/focus.store";

/** Global toggle for Focus Mode. Chosen to avoid every browser default. */
export const FOCUS_MODE_SHORTCUT = { ctrlOrCmd: true, shift: true, key: "l" };

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * Always-mounted entry point for Focus Mode.
 *
 * It owns only the persisted-state rehydration and the global shortcut. The
 * Pomodoro engine lives in `FocusModeSession`, which mounts on demand so an
 * unused Focus Mode costs nothing — in particular, no extra timer polling.
 */
export function FocusModeRoot() {
  const isOpen = useFocusStore((state) => state.isOpen);
  const hasSession = useFocusStore((state) => state.session !== null);
  const isHydrated = useFocusStore((state) => state.isHydrated);
  const open = useFocusStore((state) => state.open);
  const close = useFocusStore((state) => state.close);

  // Rehydrate after React hydration, mirroring ui.store.ts, then repair any
  // session that was persisted across a long gap.
  useEffect(() => {
    void useFocusStore.persist.rehydrate();
    useFocusStore.getState().reconcile();
    useFocusStore.getState().markHydrated();
  }, []);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (!modifier || !event.shiftKey) return;
      if (event.key.toLowerCase() !== FOCUS_MODE_SHORTCUT.key) return;
      if (isTypingTarget(event.target)) return;

      event.preventDefault();
      if (useFocusStore.getState().isOpen) close();
      else open();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, close]);

  if (!isHydrated) return null;
  if (!isOpen && !hasSession) return null;

  return <FocusModeSession isOpen={isOpen} onExpand={open} />;
}

interface FocusModeSessionProps {
  isOpen: boolean;
  onExpand: () => void;
}

/**
 * Hosts the Pomodoro engine for as long as Focus Mode is open or a session is
 * in flight, and renders whichever surface fits: the immersive overlay, or the
 * floating pill once minimised.
 */
function FocusModeSession({ isOpen, onExpand }: FocusModeSessionProps) {
  const controller = usePomodoro();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) return null;

  // These surfaces are portalled out of the shell, so they carry their own
  // tooltip provider — the app has no root one, and React context follows the
  // component tree rather than the DOM.
  return createPortal(
    <TooltipProvider delayDuration={300}>
      <AnimatePresence>
        {isOpen && (
          <FocusModeOverlay key="focus-mode-overlay" controller={controller} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isOpen && controller.hasSession && (
          <FocusPill
            key="focus-mode-pill"
            phase={controller.phase}
            countdown={controller.countdown}
            isRunning={controller.isRunning}
            onExpand={onExpand}
            onToggleRun={controller.toggleRun}
          />
        )}
      </AnimatePresence>
    </TooltipProvider>,
    document.body,
  );
}
