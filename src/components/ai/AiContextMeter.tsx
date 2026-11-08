"use client";

/**
 * Interactive context window meter inspired by `@kokonutui/ai-context-meter`.
 * Visualizes how much of TimeBot's active context window is occupied by system
 * rules, operator tools, page context, and conversation turns.
 */

import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface ContextSegment {
  id: string;
  label: string;
  tokens: number;
  color: string;
}

export interface AiContextMeterProps {
  /** Number of messages in the current conversation. */
  messageCount?: number;
  /** Approximate characters across the active conversation history. */
  conversationChars?: number;
  /** Characters currently typed in the composer draft. */
  draftChars?: number;
  /** Maximum context budget for the active turn window, in tokens. */
  limit?: number;
  /** Share of the window at which older turns start rolling off (0..1). */
  compactAt?: number;
  /** Clears/resets the conversation context. */
  onCompact?: () => void;
  className?: string;
}

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];

/** Eases a number toward its target so counts roll smoothly instead of jumping. */
function useTweened(target: number, duration = 420): number {
  const [value, setValue] = useState(target);
  const fromRef = useRef(target);
  const valueRef = useRef(target);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      valueRef.current = target;
      setValue(target);
      return;
    }

    fromRef.current = valueRef.current;
    const start = performance.now();
    let frameId = 0;

    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      valueRef.current = fromRef.current + (target - fromRef.current) * eased;
      setValue(valueRef.current);
      if (t < 1) {
        frameId = requestAnimationFrame(step);
      }
    };

    frameId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameId);
  }, [target, duration]);

  return value;
}

function formatTokens(tokens: number): string {
  return tokens >= 1000
    ? `${(tokens / 1000).toFixed(tokens >= 10_000 ? 0 : 1)}k`
    : `${Math.round(tokens)}`;
}

function levelColor(share: number, compactAt: number): string {
  if (share >= compactAt + (1 - compactAt) / 2) {
    return "text-red-600 dark:text-red-400";
  }
  if (share >= compactAt - 0.1) {
    return "text-orange-600 dark:text-orange-400";
  }
  return "text-neutral-600 dark:text-neutral-300";
}

function Ring({ share }: { share: number }) {
  const radius = 6;
  const circumference = 2 * Math.PI * radius;

  return (
    <svg
      aria-hidden="true"
      className="-rotate-90 h-3.5 w-3.5 shrink-0"
      fill="none"
      viewBox="0 0 16 16"
    >
      <circle
        className="stroke-neutral-200 dark:stroke-neutral-700"
        cx="8"
        cy="8"
        r={radius}
        strokeWidth="2"
      />
      <circle
        className="stroke-current"
        cx="8"
        cy="8"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, share))}
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function AiContextMeter({
  messageCount = 0,
  conversationChars = 0,
  draftChars = 0,
  limit = 16_000,
  compactAt = 0.8,
  onCompact,
  className,
}: AiContextMeterProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();

  const [open, setOpen] = useState(false);
  const [activeSegment, setActiveSegment] = useState<string | null>(null);

  const historyTokens = Math.min(
    limit - 3200,
    Math.round(conversationChars / 3.6) + messageCount * 45,
  );
  const draftTokens = Math.round(draftChars / 3.6);

  const segments: ContextSegment[] = [
    {
      id: "system",
      label: "Sistema e políticas",
      tokens: 1150,
      color: "bg-neutral-400 dark:bg-neutral-500",
    },
    {
      id: "tools",
      label: "Ferramentas IA",
      tokens: 1850,
      color: "bg-amber-500 dark:bg-amber-400",
    },
    {
      id: "messages",
      label: "Conversa ativa",
      tokens: historyTokens + draftTokens,
      color: "bg-orange-500 dark:bg-orange-400",
    },
  ];

  const used = segments.reduce((sum, seg) => sum + seg.tokens, 0);
  const free = Math.max(0, limit - used);
  const share = Math.min(1, used / limit);
  const shownShare = useTweened(share);
  const shownUsed = useTweened(used);

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (rootRef.current?.contains(document.activeElement)) {
          triggerRef.current?.focus();
        }
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <MotionConfig reducedMotion="user">
      <div ref={rootRef} className={cn("relative inline-flex", className)}>
        <button
          ref={triggerRef}
          type="button"
          aria-controls={panelId}
          aria-expanded={open}
          aria-label={`Janela de contexto ${Math.round(share * 100)}% em uso. Ver detalhes`}
          onClick={() => setOpen((prev) => !prev)}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-lg px-2 text-[11px] outline-none transition-colors duration-150 hover:bg-neutral-200/70 focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:hover:bg-white/10",
            open && "bg-neutral-200/70 dark:bg-white/10",
            levelColor(share, compactAt),
          )}
        >
          <Ring share={shownShare} />
          <span className="font-mono font-medium tabular-nums">
            {Math.round(shownShare * 100)}%
          </span>
        </button>

        <AnimatePresence>
          {open && (
            <motion.div
              id={panelId}
              initial={{ opacity: 0, scale: 0.97, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: 4 }}
              transition={{ duration: 0.16, ease: EASE_OUT }}
              className="absolute bottom-full left-0 z-30 mb-2 w-72 origin-bottom-left rounded-xl bg-popover p-3 text-popover-foreground shadow-xl ring-1 ring-black/10 dark:bg-neutral-900 dark:ring-white/10"
            >
              <div className="mb-2.5 flex items-baseline justify-between">
                <p className="font-semibold text-foreground text-xs">
                  Janela de contexto
                </p>
                <p className="font-mono text-[11px] text-neutral-500 tabular-nums dark:text-neutral-400">
                  {formatTokens(shownUsed)} de {formatTokens(limit)}
                </p>
              </div>

              <div
                className="relative"
                onPointerLeave={() => setActiveSegment(null)}
              >
                <div className="flex h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-white/10">
                  {segments.map((segment, index) => (
                    <span
                      key={segment.id}
                      onPointerEnter={() => setActiveSegment(segment.id)}
                      className={cn(
                        "h-full transition-[width,opacity] duration-500 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none",
                        index > 0 && segment.tokens > 0 && "ml-px",
                        segment.color,
                        activeSegment &&
                          activeSegment !== segment.id &&
                          "opacity-30",
                      )}
                      style={{
                        width: `${Math.min(100, (segment.tokens / limit) * 100)}%`,
                      }}
                    />
                  ))}
                </div>
                <span
                  aria-hidden="true"
                  className="absolute -top-1 -bottom-1 w-px bg-neutral-400 dark:bg-neutral-500"
                  style={{ left: `${compactAt * 100}%` }}
                />
              </div>

              <p className="mt-1.5 text-right text-[10px] text-neutral-400 dark:text-neutral-500">
                Janela desliza após {Math.round(compactAt * 100)}%
              </p>

              <ul className="mt-2 space-y-0.5">
                {segments.map((segment) => (
                  <li
                    key={segment.id}
                    onPointerEnter={() => setActiveSegment(segment.id)}
                    onPointerLeave={() => setActiveSegment(null)}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-1.5 py-1 text-[11px] transition-colors duration-150",
                      activeSegment === segment.id &&
                        "bg-neutral-100 dark:bg-white/5",
                    )}
                  >
                    <span
                      className={cn("h-2 w-2 rounded-[3px]", segment.color)}
                    />
                    <span className="text-neutral-700 dark:text-neutral-300">
                      {segment.label}
                    </span>
                    <span className="ml-auto font-mono text-neutral-500 tabular-nums dark:text-neutral-400">
                      {formatTokens(segment.tokens)}
                    </span>
                    <span className="w-10 text-right font-mono text-neutral-400 tabular-nums dark:text-neutral-500">
                      {((segment.tokens / limit) * 100).toFixed(1)}%
                    </span>
                  </li>
                ))}

                <li className="flex items-center gap-2 px-1.5 py-1 text-[11px]">
                  <span className="h-2 w-2 rounded-[3px] ring-1 ring-neutral-300 ring-inset dark:ring-neutral-600" />
                  <span className="text-neutral-500 dark:text-neutral-400">
                    Livre
                  </span>
                  <span className="ml-auto font-mono text-neutral-500 tabular-nums dark:text-neutral-400">
                    {formatTokens(free)}
                  </span>
                  <span className="w-10 text-right font-mono text-neutral-400 tabular-nums dark:text-neutral-500">
                    {((free / limit) * 100).toFixed(1)}%
                  </span>
                </li>
              </ul>

              {onCompact && messageCount > 0 && (
                <div className="mt-2.5 flex items-center justify-between border-border/60 border-t pt-2.5 dark:border-white/10">
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                    {messageCount} msg na conversa
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      onCompact();
                      setOpen(false);
                    }}
                    className="h-7 cursor-pointer rounded-lg bg-neutral-900 px-2.5 font-medium text-[11px] text-white outline-none transition-colors hover:bg-neutral-700 focus-visible:ring-2 focus-visible:ring-orange-500/50 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-200"
                  >
                    Limpar contexto
                  </button>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
