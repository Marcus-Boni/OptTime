// biome-ignore-all lint/a11y/useSemanticElements: the resize handle follows the ARIA window-splitter pattern, which <hr> cannot express
"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { GripVertical } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  type AssistantPanelController,
  clampPanelWidth,
  PANEL_MAX_WIDTH,
  PANEL_MIN_WIDTH,
} from "@/hooks/use-assistant-panel";
import { cn } from "@/lib/utils";

/** Gap between the floating panel and the viewport edges, per mode. */
const DOCKED_GAP = 12;
const FULLSCREEN_GAP = 16;

const EASING = "cubic-bezier(0.16, 1, 0.3, 1)";
const GEOMETRY_TRANSITION = [
  `width 420ms ${EASING}`,
  `top 420ms ${EASING}`,
  `right 420ms ${EASING}`,
  `bottom 420ms ${EASING}`,
  `border-radius 420ms ${EASING}`,
].join(", ");

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "textarea:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/** True while a nested Radix dialog owns the Escape key. */
function hasOpenNestedDialog(): boolean {
  return Boolean(
    document.querySelector(
      '[data-slot="dialog-content"][data-state="open"], [data-slot="alert-dialog-content"][data-state="open"]',
    ),
  );
}

interface PanelGeometry {
  top: number;
  right: number;
  bottom: number;
  width: number;
  borderRadius: number;
}

export interface AssistantPanelProps {
  panel: AssistantPanelController;
  /** Id of the heading that names the panel. */
  labelledBy: string;
  children: React.ReactNode;
}

/**
 * Shell for the TimeBot assistant: a floating dock that the user can resize by
 * dragging (or with the keyboard) and expand to a fullscreen workspace.
 */
export function AssistantPanel({
  panel,
  labelledBy,
  children,
}: AssistantPanelProps) {
  const {
    isOpen,
    mode,
    width,
    isResizing,
    isCompactViewport,
    close,
    setMode,
    setWidth,
    nudgeWidth,
    resetWidth,
    setResizing,
    keyboardStep,
  } = panel;

  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const [mounted, setMounted] = useState(false);
  const [viewport, setViewport] = useState({ width: 1280, height: 800 });

  const isModal = mode === "fullscreen" || isCompactViewport;

  useEffect(() => {
    setMounted(true);
  }, []);

  // Geometry is computed in pixels so every mode change animates smoothly.
  useEffect(() => {
    function syncViewport() {
      setViewport({ width: window.innerWidth, height: window.innerHeight });
    }

    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const geometry: PanelGeometry = isCompactViewport
    ? { top: 0, right: 0, bottom: 0, width: viewport.width, borderRadius: 0 }
    : mode === "fullscreen"
      ? {
          top: FULLSCREEN_GAP,
          right: FULLSCREEN_GAP,
          bottom: FULLSCREEN_GAP,
          width: Math.max(viewport.width - FULLSCREEN_GAP * 2, PANEL_MIN_WIDTH),
          borderRadius: 24,
        }
      : {
          top: DOCKED_GAP,
          right: DOCKED_GAP,
          bottom: DOCKED_GAP,
          width: clampPanelWidth(width, viewport.width),
          borderRadius: 18,
        };

  // Escape steps back: fullscreen collapses to the dock, the dock closes.
  useEffect(() => {
    if (!isOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (event.defaultPrevented || hasOpenNestedDialog()) return;

      event.preventDefault();

      if (mode === "fullscreen" && !isCompactViewport) {
        setMode("docked");
        return;
      }

      close();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, isCompactViewport, isOpen, mode, setMode]);

  // Focus trap — only while the panel behaves as a modal surface.
  useEffect(() => {
    if (!isOpen || !isModal) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Tab") return;

      const container = containerRef.current;
      if (!container) return;

      const focusable = Array.from(
        container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
      ).filter((element) => element.offsetParent !== null);

      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
        return;
      }

      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isModal]);

  // Give focus back to whatever opened the panel.
  useEffect(() => {
    if (isOpen) {
      restoreFocusRef.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
      return;
    }

    const target = restoreFocusRef.current;
    restoreFocusRef.current = null;

    if (target?.isConnected) target.focus({ preventScroll: true });
  }, [isOpen]);

  // Keep the cursor consistent while dragging, even outside the handle.
  useEffect(() => {
    if (!isResizing) return;

    const previousCursor = document.body.style.cursor;
    const previousSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelect;
    };
  }, [isResizing]);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (mode !== "docked" || isCompactViewport) return;

      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      setResizing(true);
    },
    [isCompactViewport, mode, setResizing],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing) return;
      setWidth(window.innerWidth - event.clientX - DOCKED_GAP);
    },
    [isResizing, setWidth],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setResizing(false);
    },
    [setResizing],
  );

  const handleHandleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "ArrowLeft":
          event.preventDefault();
          nudgeWidth(keyboardStep);
          break;
        case "ArrowRight":
          event.preventDefault();
          nudgeWidth(-keyboardStep);
          break;
        case "Home":
          event.preventDefault();
          setWidth(PANEL_MAX_WIDTH);
          break;
        case "End":
          event.preventDefault();
          setWidth(PANEL_MIN_WIDTH);
          break;
        case "Enter":
          event.preventDefault();
          resetWidth();
          break;
        default:
          break;
      }
    },
    [keyboardStep, nudgeWidth, resetWidth, setWidth],
  );

  if (!mounted) return null;

  const showResizeHandle = mode === "docked" && !isCompactViewport;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {isModal && (
            <motion.button
              type="button"
              key="assistant-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: prefersReducedMotion ? 0 : 0.25 }}
              onClick={close}
              aria-label="Fechar o assistente"
              tabIndex={-1}
              className="fixed inset-0 z-[9998] cursor-default bg-neutral-950/60 backdrop-blur-sm"
            />
          )}

          <motion.div
            key="assistant-panel"
            ref={containerRef}
            role="dialog"
            aria-modal={isModal}
            aria-labelledby={labelledBy}
            initial={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, x: 28, scale: 0.98 }
            }
            animate={
              prefersReducedMotion
                ? { opacity: 1 }
                : { opacity: 1, x: 0, scale: 1 }
            }
            exit={
              prefersReducedMotion
                ? { opacity: 0 }
                : { opacity: 0, x: 28, scale: 0.98 }
            }
            transition={
              prefersReducedMotion
                ? { duration: 0 }
                : { type: "spring", stiffness: 320, damping: 32, mass: 0.9 }
            }
            style={{
              position: "fixed",
              top: geometry.top,
              right: geometry.right,
              bottom: geometry.bottom,
              width: geometry.width,
              borderRadius: geometry.borderRadius,
              transition:
                isResizing || prefersReducedMotion
                  ? "none"
                  : GEOMETRY_TRANSITION,
            }}
            className={cn(
              "z-[9999] flex overflow-hidden border border-border/60 bg-card shadow-2xl shadow-black/25 dark:border-white/10",
              isResizing && "select-none",
            )}
          >
            {showResizeHandle && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-label="Redimensionar o painel do assistente"
                aria-valuenow={geometry.width}
                aria-valuemin={PANEL_MIN_WIDTH}
                aria-valuemax={PANEL_MAX_WIDTH}
                tabIndex={0}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerUp}
                onDoubleClick={resetWidth}
                onKeyDown={handleHandleKeyDown}
                title="Arraste para redimensionar · duplo clique para restaurar"
                className={cn(
                  "group absolute inset-y-0 left-0 z-20 flex w-3 cursor-col-resize touch-none items-center justify-center outline-none",
                  "focus-visible:bg-orange-500/15",
                )}
              >
                <span
                  className={cn(
                    "flex h-12 w-1 items-center justify-center rounded-full bg-border/70 transition-all duration-200 group-hover:h-20 group-hover:bg-orange-500 group-focus-visible:h-20 group-focus-visible:bg-orange-500 dark:bg-white/15",
                    isResizing && "h-24 bg-orange-500 dark:bg-orange-500",
                  )}
                >
                  <GripVertical
                    className={cn(
                      "h-3 w-3 shrink-0 text-white opacity-0 transition-opacity duration-200 group-hover:opacity-90",
                      isResizing && "opacity-90",
                    )}
                    aria-hidden="true"
                  />
                </span>
              </div>
            )}

            <AnimatePresence>
              {isResizing && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="pointer-events-none absolute top-1/2 left-4 z-30 rounded-lg bg-neutral-900/90 px-2 py-1 font-mono text-[11px] text-white tabular-nums shadow-lg dark:bg-neutral-800"
                >
                  {geometry.width} px
                </motion.span>
              )}
            </AnimatePresence>

            <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body,
  );
}
