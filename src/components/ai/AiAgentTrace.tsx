"use client";

/**
 * Agent thinking wave & collapsible tool-execution trace inspired by
 * `@kokonutui/ai-loading`, `@kokonutui/ai-text-loading` and
 * `@kokonutui/ai-tool-approval`.
 */

import {
  AnimatePresence,
  MotionConfig,
  motion,
  type Variants,
} from "framer-motion";
import { ChevronDown } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ToolActivityItem } from "@/hooks/use-timebot";
import { cn } from "@/lib/utils";

const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const WAVE_STEP = 0.055;

const WAVE_CSS = `
@keyframes optsolv-ai-wave { 50% { opacity: 0.32; } }
.optsolv-ai-wave { animation: optsolv-ai-wave 1.5s ease-in-out infinite both; }
@media (prefers-reduced-motion: reduce) { .optsolv-ai-wave { animation: none; } }
`;

const wordVariants: Variants = {
  enter: {},
  shown: { transition: { staggerChildren: 0.016 } },
  exit: {
    opacity: 0,
    y: -5,
    filter: "blur(3px)",
    transition: { duration: 0.14, ease: EASE_OUT },
  },
};

const letterVariants: Variants = {
  enter: { opacity: 0, y: 6, filter: "blur(3px)" },
  shown: {
    opacity: 1,
    y: 0,
    filter: "blur(0px)",
    transition: { duration: 0.24, ease: EASE_OUT },
  },
};

function WaveText({ text }: { text: string }) {
  return (
    <span className="inline-flex whitespace-pre">
      {Array.from(text).map((char, index) => (
        <span
          // biome-ignore lint/suspicious/noArrayIndexKey: fixed character sequence within a single label
          key={index}
          className="optsolv-ai-wave inline-block"
          style={{ animationDelay: `${index * WAVE_STEP}s` }}
        >
          {char}
        </span>
      ))}
    </span>
  );
}

export interface AiTextLoadingProps {
  texts?: string[];
  interval?: number;
  label?: string;
  showElapsed?: boolean;
  className?: string;
}

/**
 * KokonutUI `ai-text-loading` adapted for TimeBot:
 * cycles status phrases letter-by-letter with an off-main-thread brightness wave.
 */
export function AiTextLoading({
  texts = [
    "Analisando seu pedido...",
    "Consultando lançamentos...",
    "Cruzando projetos e metas...",
    "Preparando resposta...",
  ],
  interval = 1800,
  label = "TimeBot está processando",
  showElapsed = true,
  className,
}: AiTextLoadingProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [seconds, setSeconds] = useState(0);

  const safeIndex = texts.length > 0 ? currentIndex % texts.length : 0;
  const activeText = texts[safeIndex] ?? "";

  useEffect(() => {
    if (texts.length < 2) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % texts.length);
    }, interval);
    return () => clearInterval(timer);
  }, [interval, texts.length]);

  useEffect(() => {
    if (!showElapsed) return;
    setSeconds(0);
    const startedAt = Date.now();
    const timer = setInterval(() => {
      setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 500);
    return () => clearInterval(timer);
  }, [showElapsed]);

  return (
    <output
      aria-live="polite"
      className={cn(
        "inline-flex items-center gap-2.5 py-0.5 font-medium text-neutral-600 text-xs dark:text-neutral-300",
        className,
      )}
    >
      <style href="optsolv-ai-wave" precedence="default">
        {WAVE_CSS}
      </style>
      <span className="sr-only">{label}</span>

      <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
        <svg
          aria-hidden="true"
          className="h-3.5 w-3.5 text-orange-500 motion-safe:animate-spin dark:text-orange-400"
          fill="none"
          style={{ animationDuration: "0.85s" }}
          viewBox="0 0 16 16"
        >
          <circle
            className="stroke-orange-500/20 dark:stroke-orange-400/20"
            cx="8"
            cy="8"
            r="6.25"
            strokeWidth="1.75"
          />
          <path
            className="stroke-orange-500 dark:stroke-orange-400"
            d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
            strokeLinecap="round"
            strokeWidth="1.75"
          />
        </svg>
      </span>

      <MotionConfig reducedMotion="user">
        <span aria-hidden="true" className="relative flex items-center">
          <AnimatePresence initial={false} mode="popLayout">
            <motion.span
              key={safeIndex}
              variants={wordVariants}
              initial="enter"
              animate="shown"
              exit="exit"
              className="flex min-w-max whitespace-pre"
            >
              {Array.from(activeText).map((char, index) => (
                <motion.span
                  // biome-ignore lint/suspicious/noArrayIndexKey: static character index inside phrase
                  key={index}
                  variants={letterVariants}
                  className="inline-block"
                >
                  <span
                    className="optsolv-ai-wave inline-block"
                    style={{ animationDelay: `${index * WAVE_STEP}s` }}
                  >
                    {char}
                  </span>
                </motion.span>
              ))}
            </motion.span>
          </AnimatePresence>
        </span>
      </MotionConfig>

      {showElapsed && seconds > 0 && (
        <span
          aria-hidden="true"
          className="font-mono text-[10px] text-neutral-400 tabular-nums dark:text-neutral-500"
        >
          {seconds}s
        </span>
      )}
    </output>
  );
}

// ─── Step status icon (KokonutUI ai-loading SVG icons) ───────────────

function StepStatusIcon({ status }: { status: ToolActivityItem["status"] }) {
  return (
    <span className="relative flex h-4 w-4 shrink-0 items-center justify-center">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={status}
          initial={{ opacity: 0, filter: "blur(2px)" }}
          animate={{ opacity: 1, filter: "blur(0px)" }}
          exit={{ opacity: 0, filter: "blur(2px)" }}
          transition={{ duration: 0.18, ease: EASE_OUT }}
          className="absolute inset-0 flex items-center justify-center"
        >
          {status === "running" && (
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5 motion-safe:animate-spin"
              fill="none"
              style={{ animationDuration: "0.8s" }}
              viewBox="0 0 16 16"
            >
              <circle
                className="stroke-neutral-300 dark:stroke-neutral-700"
                cx="8"
                cy="8"
                r="6.25"
                strokeWidth="1.5"
              />
              <path
                className="stroke-orange-500 dark:stroke-orange-400"
                d="M8 1.75a6.25 6.25 0 0 1 6.25 6.25"
                strokeLinecap="round"
                strokeWidth="1.5"
              />
            </svg>
          )}
          {status === "done" && (
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400"
              fill="none"
              viewBox="0 0 16 16"
            >
              <motion.path
                d="M3.5 8.5 6.5 11.5 12.5 4.5"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.28, ease: EASE_OUT }}
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="1.75"
              />
            </svg>
          )}
          {status === "failed" && (
            <svg
              aria-hidden="true"
              className="h-3.5 w-3.5 text-red-500 dark:text-red-400"
              fill="none"
              viewBox="0 0 16 16"
            >
              <path
                d="M4.5 4.5l7 7m0-7-7 7"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.75"
              />
            </svg>
          )}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}

export interface AiAgentTraceProps {
  tools: ToolActivityItem[];
  collapseWhenDone?: boolean;
  className?: string;
}

/**
 * Collapsible tool-call trace inspired by `@kokonutui/ai-loading`:
 * stays open while tools run, then folds into a single-line summary pill
 * so completed queries never clutter the conversation with wide banners.
 */
export function AiAgentTrace({
  tools,
  collapseWhenDone = true,
  className,
}: AiAgentTraceProps) {
  const listId = useId();
  const running = tools.find((tool) => tool.status === "running");
  const failed = tools.find((tool) => tool.status === "failed");
  const isAllDone =
    tools.length > 0 && tools.every((tool) => tool.status !== "running");

  const shouldAutoCollapse = isAllDone && collapseWhenDone && !failed;
  const [isOpen, setIsOpen] = useState(!shouldAutoCollapse);
  const [prevAutoCollapse, setPrevAutoCollapse] = useState(shouldAutoCollapse);

  if (prevAutoCollapse !== shouldAutoCollapse) {
    setPrevAutoCollapse(shouldAutoCollapse);
    setIsOpen(!shouldAutoCollapse);
  }

  if (tools.length === 0) return null;

  let summaryTitle = "";
  if (running) {
    summaryTitle = running.label;
  } else if (failed) {
    summaryTitle = `Falha ao consultar: ${failed.label}`;
  } else if (tools.length === 1 && tools[0]) {
    summaryTitle = tools[0].label;
  } else {
    summaryTitle = `${tools.length} consultas concluídas`;
  }

  const headerStatus: ToolActivityItem["status"] = running
    ? "running"
    : failed
      ? "failed"
      : "done";

  return (
    <MotionConfig reducedMotion="user">
      <div className={cn("mb-2", className)}>
        <style href="optsolv-ai-wave" precedence="default">
          {WAVE_CSS}
        </style>

        <button
          type="button"
          aria-controls={listId}
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className={cn(
            "group/trace inline-flex max-w-full cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1 text-left font-medium text-[11px] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500/50",
            running
              ? "border-orange-500/30 bg-orange-500/10 text-orange-700 dark:text-orange-300"
              : failed
                ? "border-red-500/30 bg-red-500/10 text-red-600 dark:text-red-400"
                : "border-border/60 bg-neutral-100/80 text-neutral-600 hover:border-border hover:text-foreground dark:border-white/10 dark:bg-white/[0.04] dark:text-neutral-300 dark:hover:bg-white/[0.07]",
          )}
        >
          <StepStatusIcon status={headerStatus} />

          <output className="min-w-0 truncate">
            {running ? (
              <>
                <span className="sr-only">{summaryTitle}</span>
                <span aria-hidden="true">
                  <WaveText text={summaryTitle} />
                </span>
              </>
            ) : (
              summaryTitle
            )}
          </output>

          {!running && tools.length > 1 && (
            <span className="hidden truncate font-normal text-[10.5px] text-neutral-400 sm:inline dark:text-neutral-500">
              · {tools.map((t) => t.label.split(":")[0]).join(", ")}
            </span>
          )}

          <ChevronDown
            aria-hidden="true"
            className={cn(
              "ml-0.5 h-3.5 w-3.5 shrink-0 text-neutral-400 transition-transform duration-200 ease-[cubic-bezier(0.23,1,0.32,1)] group-hover/trace:text-foreground",
              isOpen && "rotate-180",
            )}
          />
        </button>

        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.ol
              id={listId}
              aria-label="Etapas executadas pelo assistente"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              className="mt-1.5 space-y-1 overflow-hidden pl-1.5"
            >
              {tools.map((tool, index) => {
                const isLast = index === tools.length - 1;

                return (
                  <li
                    key={tool.id}
                    className="relative flex items-start gap-2 text-[11px] leading-5"
                  >
                    {!isLast && (
                      <span
                        aria-hidden="true"
                        className="absolute top-4 bottom-0 left-[7.5px] w-px bg-neutral-200 dark:bg-white/10"
                      />
                    )}
                    <span className="mt-0.5">
                      <StepStatusIcon status={tool.status} />
                    </span>
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate transition-colors",
                        tool.status === "running"
                          ? "font-medium text-orange-600 dark:text-orange-300"
                          : tool.status === "failed"
                            ? "text-red-600 dark:text-red-400"
                            : "text-neutral-600 dark:text-neutral-300",
                      )}
                    >
                      {tool.status === "running" ? (
                        <>
                          <span className="sr-only">{tool.label}</span>
                          <span aria-hidden="true">
                            <WaveText text={tool.label} />
                          </span>
                        </>
                      ) : (
                        tool.label
                      )}
                    </span>
                  </li>
                );
              })}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
