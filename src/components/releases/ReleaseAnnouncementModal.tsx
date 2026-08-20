"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowRight, Check, History, Sparkles, X } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { extractReleaseHighlights } from "@/lib/changelog/highlights";
import type { PublishedRelease } from "@/lib/changelog/releases-cache";
import { normalizeVersionTag } from "@/lib/changelog/storage";
import { CHANGELOG_HREF } from "@/lib/version";
import { InlineMarkdown, ReleaseDescription } from "./ReleaseDescription";

/**
 * The Remotion player pulls in the whole video runtime. Loading it on demand
 * keeps it out of the dashboard shell bundle that mounts this modal.
 */
const ReleaseVideoPlayer = dynamic(
  () =>
    import("./ReleaseVideoPlayer").then((mod) => ({
      default: mod.ReleaseVideoPlayer,
    })),
  {
    ssr: false,
    loading: () => (
      <output
        className="my-4 block h-[68px] animate-pulse rounded-xl border border-brand-500/20 bg-brand-500/5"
        aria-label="Carregando player de vídeo"
      />
    ),
  },
);

export interface ReleaseAnnouncementModalProps {
  /** Release being announced — always the most recent published one. */
  release: PublishedRelease;
  /** Older unseen releases, shown as a pointer to the full changelog. */
  missedCount: number;
  open: boolean;
  /** Acknowledges the version; runs for every close path (button, Esc, overlay). */
  onDismiss: () => void;
}

const HIGHLIGHT_LIMIT = 5;

const listVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.08 } },
};

const highlightVariants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.35, ease: [0.16, 1, 0.3, 1] as const },
  },
};

function formatPublishedAt(iso: string | null): string | null {
  if (!iso) return null;

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;

  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

export function ReleaseAnnouncementModal({
  release,
  missedCount,
  open,
  onDismiss,
}: ReleaseAnnouncementModalProps) {
  const prefersReducedMotion = useReducedMotion();

  const versionLabel = normalizeVersionTag(release.versionTag);
  const publishedLabel = formatPublishedAt(release.publishedAt);
  const { intro, items, remaining } = extractReleaseHighlights(
    release.description,
    HIGHLIGHT_LIMIT,
  );

  // Notes that yield no highlight list (headings-only, tables, long prose) fall
  // back to the full renderer so the modal is never left with an empty body.
  const hasHighlights = items.length > 0;
  const headerIntro = hasHighlights ? intro : null;

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) onDismiss();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[88vh] w-full flex-col gap-0 overflow-hidden rounded-2xl border-border/60 p-0 shadow-2xl shadow-black/20 sm:max-w-2xl"
      >
        {/* Header */}
        <header className="relative shrink-0 overflow-hidden border-b border-border/60 bg-gradient-to-br from-brand-500/15 via-brand-500/5 to-transparent px-6 pt-6 pb-5">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-24 -right-16 h-48 w-48 rounded-full bg-brand-500/20 blur-3xl"
          />

          <div className="relative flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-500/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-brand-600 ring-1 ring-inset ring-brand-500/25 dark:text-brand-400">
                  <Sparkles className="h-3 w-3" aria-hidden="true" />
                  Novidades
                </span>
                <span className="rounded-full border border-border/60 bg-background/60 px-2 py-0.5 font-mono text-[11px] font-semibold text-foreground/80">
                  {versionLabel}
                </span>
                {publishedLabel ? (
                  <span className="text-xs text-muted-foreground">
                    {publishedLabel}
                  </span>
                ) : null}
              </div>

              <DialogTitle className="mt-3 font-display text-xl font-bold leading-tight text-foreground sm:text-2xl">
                {release.title}
              </DialogTitle>

              <DialogDescription className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                {headerIntro ? (
                  <InlineMarkdown text={headerIntro} />
                ) : (
                  `Confira o que mudou na versão ${versionLabel}.`
                )}
              </DialogDescription>
            </div>

            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onDismiss}
              aria-label="Fechar novidades da versão"
              className="-mt-1 -mr-2 shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          {release.videoUrl ? (
            <ReleaseVideoPlayer
              videoUrl={release.videoUrl}
              versionTag={versionLabel}
            />
          ) : null}

          {!hasHighlights ? (
            <ReleaseDescription text={release.description} />
          ) : null}

          {hasHighlights ? (
            <motion.ul
              variants={prefersReducedMotion ? undefined : listVariants}
              initial={prefersReducedMotion ? undefined : "hidden"}
              animate={prefersReducedMotion ? undefined : "visible"}
              className="space-y-2.5"
            >
              {items.map((item, index) => {
                const key = `highlight-${index}`;

                return (
                  <motion.li
                    key={key}
                    variants={
                      prefersReducedMotion ? undefined : highlightVariants
                    }
                    className="flex items-start gap-3 rounded-xl border border-border/50 bg-muted/30 px-3.5 py-2.5"
                  >
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-500/15 text-brand-600 dark:text-brand-400">
                      <Check className="h-3 w-3" aria-hidden="true" />
                    </span>
                    <span className="flex-1 text-sm leading-relaxed text-muted-foreground">
                      <InlineMarkdown text={item} />
                    </span>
                  </motion.li>
                );
              })}
            </motion.ul>
          ) : null}

          {remaining > 0 ? (
            <p className="mt-3 text-xs text-muted-foreground">
              +{remaining}{" "}
              {remaining === 1 ? "outra melhoria" : "outras melhorias"} nesta
              versão.
            </p>
          ) : null}

          {missedCount > 0 ? (
            <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-border/50 bg-muted/20 px-3.5 py-3">
              <History
                className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                aria-hidden="true"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                Você também tem{" "}
                <strong className="font-semibold text-foreground">
                  {missedCount}{" "}
                  {missedCount === 1 ? "versão anterior" : "versões anteriores"}
                </strong>{" "}
                para conferir no changelog.
              </p>
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <footer className="flex shrink-0 flex-col-reverse gap-3 border-t border-border/60 bg-muted/20 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Este resumo fica sempre disponível no changelog.
          </p>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <Button variant="outline" asChild onClick={onDismiss}>
              <Link href={CHANGELOG_HREF}>
                Ver changelog completo
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>

            <Button
              onClick={onDismiss}
              className="bg-brand-500 text-white hover:bg-brand-600"
            >
              Entendi
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
