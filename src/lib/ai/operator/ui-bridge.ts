"use client";

/**
 * AI Operator — client-side execution of interface actions.
 *
 * Navigation and UI commands never touch the database, so they run entirely in
 * the browser: the router for screens, the Zustand stores for everything else.
 * They still go through the operator permission model, which is why they live
 * next to the write executors instead of inside a component.
 */

import { UI_COMMANDS } from "@/lib/ai/operator/ui-commands";
import type { UiCommandAction } from "@/lib/ai/types";
import { useFocusStore } from "@/stores/focus.store";
import { useUIStore } from "@/stores/ui.store";

/**
 * Asks the assistant shell to step aside so the user can actually see what the
 * assistant just did. Dispatched instead of imported because the panel state
 * lives in a hook owned by `TimeBotWidget`.
 */
export const ASSISTANT_REVEAL_EVENT = "timebot:reveal";

export interface AssistantRevealDetail {
  /** True when the panel must close outright (a modal is about to open). */
  closePanel: boolean;
}

export function revealApp(detail: AssistantRevealDetail): void {
  if (typeof window === "undefined") return;

  window.dispatchEvent(
    new CustomEvent<AssistantRevealDetail>(ASSISTANT_REVEAL_EVENT, { detail }),
  );
}

export interface UiCommandOutcome {
  /**
   * Puts the change back, when it is genuinely reversible. Commands that only
   * open a dialog return nothing: the dialog's own close is the way out.
   */
  undo: (() => void) | null;
}

/**
 * Runs one interface command. Synchronous by design: every target is a local
 * store mutation, so the UI reacts in the same frame the user's command lands.
 */
export function executeUiCommand(action: UiCommandAction): UiCommandOutcome {
  const meta = UI_COMMANDS[action.command];
  const ui = useUIStore.getState();
  const focus = useFocusStore.getState();

  // A modal opening behind the assistant panel would be invisible and would
  // fight it for focus, so the panel gets out of the way first.
  revealApp({ closePanel: meta?.opensOverlay ?? false });

  switch (action.command) {
    case "focus_mode":
      focus.open();
      return { undo: () => useFocusStore.getState().close() };

    case "focus_mode_start": {
      const hadSession = focus.session !== null;
      focus.open();
      if (!hadSession) focus.startSession();

      return {
        undo: () => {
          const store = useFocusStore.getState();
          store.close();
          // Only discard a session this command created.
          if (!hadSession) store.endSession();
        },
      };
    }

    case "focus_mode_exit":
      focus.close();
      return { undo: () => useFocusStore.getState().open() };

    case "quick_entry":
      ui.openQuickEntry({
        source: "timebot",
        date: action.payload?.date,
        initialValues: action.payload
          ? {
              projectId: action.payload.projectId,
              description: action.payload.description,
              date: action.payload.date,
              duration: action.payload.durationMinutes,
              billable: action.payload.billable,
            }
          : undefined,
      });
      return { undo: null };

    case "quick_timer":
      ui.openQuickTimer();
      return { undo: null };

    case "command_palette":
      ui.openCommandPalette();
      return { undo: null };

    case "weekly_digest":
      ui.openWeeklyDigestModal();
      return { undo: null };

    case "shortcuts":
      ui.openShortcutsModal();
      return { undo: null };

    case "theme_dark":
    case "theme_light":
    case "theme_toggle": {
      const previous = ui.theme;
      const next =
        action.command === "theme_toggle"
          ? previous === "dark"
            ? "light"
            : "dark"
          : action.command === "theme_dark"
            ? "dark"
            : "light";

      ui.setTheme(next);
      return { undo: () => useUIStore.getState().setTheme(previous) };
    }

    case "sidebar_toggle":
      ui.toggleSidebar();
      return { undo: () => useUIStore.getState().toggleSidebar() };

    default:
      return { undo: null };
  }
}

/** Confirmation copy shown in the card and in the toast. */
export function describeUiCommand(action: UiCommandAction): string {
  return UI_COMMANDS[action.command]?.doneLabel ?? "Comando executado";
}
