"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Rss, Sparkles } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ActionTooltip } from "@/components/ui/tooltip";
import { useChangelogNotification } from "@/hooks/use-changelog-notification";

export function ChangelogHeaderButton() {
  const { hasUnseen, latestVersion, markAsSeen } = useChangelogNotification();
  const prefersReducedMotion = useReducedMotion();

  const tooltipLabel = hasUnseen
    ? `Novidades e versões • Nova versão ${latestVersion} disponível!`
    : "Novidades e versões";

  const ariaLabel = hasUnseen
    ? `Ver changelog de versões (Nova versão ${latestVersion} disponível)`
    : "Ver changelog de versões";

  return (
    <ActionTooltip label={tooltipLabel} side="bottom">
      <Button
        variant="ghost"
        size="icon"
        className="relative hidden md:flex"
        aria-label={ariaLabel}
        asChild
        onClick={markAsSeen}
      >
        <Link href="/dashboard/releases">
          <motion.div
            whileHover={prefersReducedMotion ? undefined : { scale: 1.08 }}
            whileTap={prefersReducedMotion ? undefined : { scale: 0.94 }}
            className="relative flex items-center justify-center"
          >
            {hasUnseen ? (
              <Sparkles className="h-4.5 w-4.5 text-orange-500 dark:text-orange-400 transition-colors" />
            ) : (
              <Rss className="h-4.5 w-4.5 text-muted-foreground transition-colors group-hover:text-foreground" />
            )}

            <AnimatePresence>
              {hasUnseen ? (
                <motion.span
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ duration: 0.2 }}
                  className="absolute -top-1 -right-1 flex h-2.5 w-2.5 items-center justify-center"
                >
                  {!prefersReducedMotion ? (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75 duration-1000" />
                  ) : null}
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500 shadow-sm shadow-orange-500/50 ring-2 ring-background" />
                </motion.span>
              ) : null}
            </AnimatePresence>
          </motion.div>
        </Link>
      </Button>
    </ActionTooltip>
  );
}
