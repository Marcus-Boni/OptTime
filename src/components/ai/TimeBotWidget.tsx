"use client";

import { Bot } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TimeBotChat } from "@/components/ai/TimeBotChat";

/** Ignore the shortcut while the user is typing somewhere else. */
function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tag = target.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || target.isContentEditable;
}

export function TimeBotWidget() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Ctrl/Cmd+J toggles the assistant; Escape closes it.
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const isToggle =
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        (event.key === "j" || event.key === "J");

      if (isToggle && !isTypingTarget(event.target)) {
        event.preventDefault();
        setIsOpen((previous) => !previous);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Abrir o TimeBot, assistente de IA (Ctrl+J)"
        title="TimeBot — assistente de IA (Ctrl+J)"
        style={{
          position: "fixed",
          bottom: "24px",
          right: "24px",
          zIndex: 9999,
          display: isOpen ? "none" : "flex",
        }}
        className="group h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-orange-600 text-white shadow-xl shadow-orange-500/30 transition-transform duration-300 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100 dark:from-orange-600 dark:to-orange-500"
      >
        <span className="relative flex items-center justify-center">
          <Bot className="h-6 w-6" aria-hidden="true" />
          <span className="-top-1 -right-1 absolute flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-200 opacity-75 motion-reduce:animate-none" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-300" />
          </span>
        </span>
      </button>

      <SheetContent
        side="right"
        showOverlay={false}
        className="z-[10000] flex w-full flex-col border-border/40 border-l bg-card p-0 shadow-2xl sm:max-w-md md:max-w-lg dark:border-white/10"
      >
        <TimeBotChat activePath={pathname} isOpen={isOpen} />
      </SheetContent>
    </Sheet>,
    document.body,
  );
}
