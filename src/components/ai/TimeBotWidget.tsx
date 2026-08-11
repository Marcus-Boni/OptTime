"use client";

import { Bot, Sparkles } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { TimeBotChat } from "./TimeBotChat";

export function TimeBotWidget() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMounted(true);
  }, []);

  // Keyboard shortcut Ctrl+Shift+A or Ctrl+K to toggle TimeBot
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && (e.key === "k" || e.key === "K")) {
        // Only if not focused inside input/textarea
        const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      {/* Floating Action Button */}
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label="Abrir assistente virtual TimeBot"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            left: "auto",
            top: "auto",
            zIndex: 9999,
            display: isOpen ? "none" : "flex",
          }}
          className="h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-gradient-to-r from-orange-500 to-orange-600 text-white shadow-xl shadow-orange-500/30 transition-all duration-300 hover:scale-110 hover:shadow-orange-500/50 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 active:scale-95 dark:from-orange-600 dark:to-orange-500"
        >
          <span className="relative flex items-center justify-center">
            <Bot className="h-6 w-6" aria-hidden="true" />
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-200 opacity-75" />
              <span className="relative inline-flex h-3 w-3 rounded-full bg-amber-300" />
            </span>
          </span>
        </button>
      </SheetTrigger>

      {/* Sheet Content Drawer */}
      <SheetContent
        side="right"
        showOverlay={false}
        className="flex w-full flex-col p-0 sm:max-w-md md:max-w-lg border-l border-border/40 bg-card dark:border-white/10 z-[10000] shadow-2xl"
      >
        <SheetHeader className="border-b border-border/40 p-4 dark:border-white/10 bg-neutral-900 text-white">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/20 text-orange-400">
              <Bot className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <SheetTitle className="font-sora font-bold text-base text-white flex items-center gap-1.5">
                TimeBot
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500/20 px-2 py-0.5 font-medium text-[10px] text-orange-300">
                  <Sparkles className="h-3 w-3" /> IA
                </span>
              </SheetTitle>
              <SheetDescription className="text-neutral-400 text-xs">
                Assistente virtual do OptSolv Time Tracker
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Chat Body */}
        <div className="flex-1 overflow-hidden">
          <TimeBotChat activePath={pathname} />
        </div>
      </SheetContent>
    </Sheet>,
    document.body,
  );
}
