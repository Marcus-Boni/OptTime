"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { AssistantPanel } from "@/components/ai/AssistantPanel";
import { TimeBotChat } from "@/components/ai/TimeBotChat";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useAssistantPanel } from "@/hooks/use-assistant-panel";

/** Ignore the shortcut while the user is typing somewhere else. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export function TimeBotWidget() {
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const panel = useAssistantPanel();
  const titleId = useId();

  const { isOpen, toggle } = panel;

  useEffect(() => {
    setMounted(true);
  }, []);

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

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, toggle]);

  if (!mounted) return null;

  return (
    <>
      {createPortal(
        <AnimatePresence>
          {!isOpen && (
            <ActionTooltip label="TimeBot — Assistente de IA" shortcut="Ctrl+J" side="left">
              <motion.button
                type="button"
                initial={{ opacity: 0, scale: 0.8, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8, y: 12 }}
                transition={{ type: "spring", stiffness: 380, damping: 26 }}
                whileHover={{ scale: 1.08 }}
                whileTap={{ scale: 0.94 }}
                onClick={panel.open}
                aria-label="Abrir o TimeBot, assistente de IA (Ctrl+J)"
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
        />
      </AssistantPanel>
    </>
  );
}
