"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Lightbulb, X } from "lucide-react";
import Link from "next/link";
import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useOnboarding } from "@/hooks/use-onboarding";
import type { OnboardingOverview } from "@/lib/onboarding/types";
import { cn } from "@/lib/utils";

export interface OnboardingHintProps {
  /** Stable id. Dismissing it is remembered server-side, forever. */
  hintId: string;
  title: string;
  description: string;
  /** Optional call to action rendered beside the copy. */
  action?:
    | { label: string; href: string }
    | { label: string; onClick: () => void };
  /**
   * Extra condition on top of "not dismissed yet" — usually a signal, so the
   * hint disappears the moment the person does the thing it suggests.
   * Returning false keeps the hint hidden.
   */
  when?: (overview: OnboardingOverview) => boolean;
  className?: string;
}

/**
 * A contextual, dismissible nudge.
 *
 * Complements the tours: tours explain the product on demand, hints appear
 * exactly where someone is likely to get stuck. Dismissal is persisted with
 * the rest of the onboarding state, so a closed hint stays closed across
 * devices — an inline tip that keeps coming back reads as a bug.
 */
export function OnboardingHint({
  hintId,
  title,
  description,
  action,
  when,
  className,
}: OnboardingHintProps) {
  const { overview, send } = useOnboarding();
  const prefersReducedMotion = useReducedMotion();

  const handleDismiss = useCallback(() => {
    void send({ action: "dismiss_hint", hintId });
  }, [send, hintId]);

  const isDismissed = overview?.state.dismissedHints.includes(hintId) ?? true;
  const passesCondition = overview ? (when ? when(overview) : true) : false;
  const isVisible = !isDismissed && passesCondition;

  return (
    <AnimatePresence initial={false}>
      {isVisible ? (
        <motion.aside
          initial={
            prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }
          }
          animate={{ opacity: 1, y: 0 }}
          exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -8 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.28 }}
          className={cn(
            "flex items-start gap-3 rounded-xl border border-brand-500/25 bg-brand-500/5 px-4 py-3",
            className,
          )}
          aria-label={title}
        >
          <span
            className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand-500/15 text-brand-500"
            aria-hidden="true"
          >
            <Lightbulb className="h-3.5 w-3.5" />
          </span>

          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{title}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {description}
            </p>
          </div>

          {action ? (
            "href" in action ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-[11px] text-brand-500 hover:bg-brand-500/10 hover:text-brand-500"
                asChild
              >
                <Link href={action.href}>{action.label}</Link>
              </Button>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 shrink-0 px-2 text-[11px] text-brand-500 hover:bg-brand-500/10 hover:text-brand-500"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            )
          ) : null}

          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
            onClick={handleDismiss}
            aria-label={`Dispensar a dica "${title}"`}
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}

export default OnboardingHint;
