"use client";

/**
 * Tells the user their cached AI result no longer matches reality, and offers
 * the refresh — without taking it. Auto-refreshing here would discard whatever
 * they had already adjusted, which is the exact behaviour this whole cache
 * exists to prevent.
 */

import { motion, useReducedMotion } from "framer-motion";
import { History, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface StaleNoticeProps {
  reason: string;
  isRefreshing: boolean;
  onRegenerate: () => void;
  actionLabel?: string;
  className?: string;
}

export function StaleNotice({
  reason,
  isRefreshing,
  onRegenerate,
  actionLabel = "Atualizar",
  className,
}: StaleNoticeProps) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.output
      initial={prefersReducedMotion ? false : { opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      className={cn(
        "flex w-full flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2",
        className,
      )}
    >
      <History
        className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400"
        aria-hidden="true"
      />
      <p className="min-w-0 flex-1 text-[11px] text-amber-700 leading-relaxed dark:text-amber-300">
        {reason}
      </p>

      <Button
        type="button"
        variant="outline"
        size="xs"
        onClick={onRegenerate}
        disabled={isRefreshing}
        className="shrink-0 cursor-pointer gap-1.5 border-amber-500/40 bg-transparent text-[11px] text-amber-700 hover:bg-amber-500/15 hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
      >
        {isRefreshing ? (
          <Loader2
            className="size-3 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
        ) : (
          <RefreshCw className="size-3" aria-hidden="true" />
        )}
        {actionLabel}
      </Button>
    </motion.output>
  );
}

export default StaleNotice;
