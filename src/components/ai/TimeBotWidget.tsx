"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AssistantPanel } from "@/components/ai/AssistantPanel";
import { VoiceCommandOverlay } from "@/components/ai/operator/VoiceCommandOverlay";
import { TimeBotChat } from "@/components/ai/TimeBotChat";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useAssistantPanel } from "@/hooks/use-assistant-panel";
import { useModifierKey } from "@/hooks/use-modifier-key";
import { useOperatorPolicy } from "@/hooks/use-operator-policy";
import {
  ASSISTANT_REVEAL_EVENT,
  type AssistantRevealDetail,
} from "@/lib/ai/operator/ui-bridge";
import { queueVoiceCommand } from "@/lib/ai/operator/voice-events";

/** Ignore the shortcut while the user is typing somewhere else. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export function TimeBotWidget() {
  const [mounted, setMounted] = useState(false);
  const [isVoiceModeOpen, setIsVoiceModeOpen] = useState(false);
  const pathname = usePathname();
  const panel = useAssistantPanel();
  const { settings } = useOperatorPolicy();
  const modifier = useModifierKey();
  const titleId = useId();

  const { isOpen, toggle, open, close, mode, setMode, isCompactViewport } =
    panel;

  /** True when voice mode took over an open panel and should hand it back. */
  const shouldRestorePanelRef = useRef(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // An action the assistant runs on its own (opening a screen, popping a
  // dialog) is worthless if the panel is covering it. The executors announce
  // what they are about to do and the shell makes room.
  useEffect(() => {
    function handleReveal(event: Event) {
      const detail = (event as CustomEvent<AssistantRevealDetail>).detail;

      if (detail?.closePanel || isCompactViewport) {
        close();
        return;
      }

      // Docked is enough on a wide screen: the chat stays visible next to the
      // page it just opened.
      if (mode === "fullscreen") setMode("docked");
    }

    window.addEventListener(ASSISTANT_REVEAL_EVENT, handleReveal);
    return () =>
      window.removeEventListener(ASSISTANT_REVEAL_EVENT, handleReveal);
  }, [close, isCompactViewport, mode, setMode]);

  // Voice mode owns the whole screen, so the panel steps aside while it runs
  // and comes back if the user leaves without speaking a command.
  const openVoiceMode = useCallback(() => {
    shouldRestorePanelRef.current = isOpen;
    close();
    setIsVoiceModeOpen(true);
  }, [close, isOpen]);

  const closeVoiceMode = useCallback(() => {
    setIsVoiceModeOpen(false);

    if (shouldRestorePanelRef.current) {
      shouldRestorePanelRef.current = false;
      open();
    }
  }, [open]);

  // Ctrl/Cmd+Shift+V opens hands-free voice command mode from anywhere.
  useEffect(() => {
    if (!settings.voiceEnabled) return;

    function handleKeyDown(event: KeyboardEvent) {
      const isVoiceShortcut =
        (event.ctrlKey || event.metaKey) &&
        event.shiftKey &&
        (event.key === "v" || event.key === "V");

      if (!isVoiceShortcut) return;

      event.preventDefault();

      if (isVoiceModeOpen) {
        closeVoiceMode();
        return;
      }

      openVoiceMode();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [closeVoiceMode, isVoiceModeOpen, openVoiceMode, settings.voiceEnabled]);

  // The spoken command is parked, then the panel takes over to show the plan.
  const handleVoiceCommand = useCallback(
    (text: string) => {
      // The panel is about to open with the result, so the restore is moot.
      shouldRestorePanelRef.current = false;
      queueVoiceCommand(text);
      open();
    },
    [open],
  );

  // Ctrl/Cmd+J toggles the assistant from anywhere in the app.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isToggle =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        (event.key === "j" || event.key === "J");

      if (!isToggle) return;
      // While the panel is open the composer is the expected typing target.
      if (!isOpen && isTypingTarget(event.target)) return;

      event.preventDefault();
      toggle();
    }

    function handleOpenEvent() {
      open();
    }

    function handleVoiceEvent() {
      openVoiceMode();
    }

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("timebot:open", handleOpenEvent);
    window.addEventListener("timebot:voice", handleVoiceEvent);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("timebot:open", handleOpenEvent);
      window.removeEventListener("timebot:voice", handleVoiceEvent);
    };
  }, [isOpen, open, openVoiceMode, toggle]);

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {!isOpen && (
            <ActionTooltip
              label="TimeBot — Assistente de IA"
              shortcut={`${modifier}+J`}
              side="left"
            >
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 12 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={panel.open}
                aria-label={`Abrir o TimeBot, assistente de IA (${modifier}+J)`}
                style={{
                  position: "fixed",
                  bottom: "24px",
                  right: "24px",
                  zIndex: 9990,
                }}
                className="group flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl shadow-orange-500/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 dark:from-orange-600 dark:to-orange-500"
              >
                <span className="relative flex items-center justify-center">
                  <Bot className="h-6 w-6" aria-hidden="true" />
                  <span className="-top-1 -right-1 absolute flex h-3 w-3">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-200 opacity-75 motion-reduce:animate-none" />
                    <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-300" />
                  </span>
                </span>
              </motion.button>
            </ActionTooltip>
          )}
        </AnimatePresence>,
        document.body,
      )}

      <AssistantPanel panel={panel} labelledBy={titleId}>
        <TimeBotChat
          activePath={pathname}
          isOpen={panel.isOpen}
          mode={panel.mode}
          isCompactViewport={panel.isCompactViewport}
          titleId={titleId}
          onToggleFullscreen={panel.toggleFullscreen}
          onClose={panel.close}
          onOpenVoiceMode={settings.voiceEnabled ? openVoiceMode : undefined}
        />
      </AssistantPanel>

      {createPortal(
        <VoiceCommandOverlay
          open={isVoiceModeOpen}
          locale={settings.voiceLocale}
          onClose={closeVoiceMode}
          onSubmit={handleVoiceCommand}
        />,
        document.body,
      )}
    </>
  );
}
