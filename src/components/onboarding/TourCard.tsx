"use client";

import { motion, useReducedMotion } from "framer-motion";
import { ArrowLeft, ArrowRight, Check, Lightbulb, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { TourStep } from "@/lib/onboarding/types";

export interface TourCardProps {
  /** Name of the tour, shown as an eyebrow above the step title. */
  tourTitle: string;
  step: TourStep;
  stepNumber: number;
  totalSteps: number;
  isFirst: boolean;
  isLast: boolean;
  /** 1 when moving forward, -1 when going back. Drives the slide direction. */
  direction: 1 | -1;
  onNext: () => void;
  onPrevious: () => void;
  onSkip: () => void;
}

/**
 * Progress across the whole tour.
 *
 * A bar rather than one dot per step: tours run from 4 to 12 steps, and a dot
 * row long enough for the longest tour pushes the actions out of a card whose
 * width is fixed. Animating `scaleX` keeps it off the layout path.
 */
function TourProgress({
  stepNumber,
  totalSteps,
}: {
  stepNumber: number;
  totalSteps: number;
}) {
  const prefersReducedMotion = useReducedMotion();
  const ratio = totalSteps > 0 ? stepNumber / totalSteps : 0;

  return (
    <div
      className="h-1 w-full overflow-hidden bg-border/60"
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={totalSteps}
      aria-valuenow={stepNumber}
      aria-label={`Passo ${stepNumber} de ${totalSteps}`}
    >
      <motion.div
        className="h-full origin-left bg-brand-500"
        initial={false}
        animate={{ scaleX: ratio }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.45,
          ease: [0.16, 1, 0.3, 1],
        }}
      />
    </div>
  );
}

/**
 * The step card of a running tour.
 *
 * Layout rule: the footer holds actions only, and every one of them is
 * `shrink-0`. Nothing else is allowed in that row, because the card has a
 * fixed width and `overflow-hidden` — anything that grows there gets clipped.
 */
export function TourCard({
  tourTitle,
  step,
  stepNumber,
  totalSteps,
  isFirst,
  isLast,
  direction,
  onNext,
  onPrevious,
  onSkip,
}: TourCardProps) {
  const prefersReducedMotion = useReducedMotion();
  const titleId = `tour-step-title-${step.id}`;
  const descriptionId = `tour-step-description-${step.id}`;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      className="pointer-events-auto overflow-hidden rounded-2xl border border-brand-500/25 bg-popover/95 shadow-2xl shadow-black/40 backdrop-blur-xl"
    >
      <TourProgress stepNumber={stepNumber} totalSteps={totalSteps} />

      <div className="flex items-center justify-between gap-3 px-5 pt-4">
        <p className="min-w-0 truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-brand-500">
          {tourTitle}
        </p>

        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
            {stepNumber}/{totalSteps}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={onSkip}
            aria-label="Encerrar o tour"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Remounting on `step.id` plays the enter animation only, so the card
          never collapses to zero height between steps. */}
      <motion.div
        key={step.id}
        initial={
          prefersReducedMotion
            ? { opacity: 0 }
            : { opacity: 0, x: direction * 14 }
        }
        animate={{ opacity: 1, x: 0 }}
        transition={{
          duration: prefersReducedMotion ? 0 : 0.32,
          ease: [0.16, 1, 0.3, 1],
        }}
        className="px-5 pt-1.5"
      >
        <h2
          id={titleId}
          className="font-display text-lg font-semibold leading-snug text-foreground"
        >
          {step.title}
        </h2>

        <p
          id={descriptionId}
          className="mt-2 text-sm leading-relaxed text-muted-foreground"
        >
          {step.description}
        </p>

        {step.hint ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-brand-500/20 bg-brand-500/5 px-3 py-2 text-xs">
            <Lightbulb
              className="mt-px h-3.5 w-3.5 shrink-0 text-brand-500"
              aria-hidden="true"
            />
            <span className="text-foreground/80">{step.hint}</span>
          </p>
        ) : null}
      </motion.div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/60 bg-muted/20 px-4 py-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 shrink-0 px-2 text-xs text-muted-foreground hover:text-foreground"
          onClick={onSkip}
        >
          Pular tour
        </Button>

        <div className="flex shrink-0 items-center gap-2">
          {!isFirst ? (
            <Button
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2.5 text-xs"
              onClick={onPrevious}
              aria-label="Passo anterior"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Voltar
            </Button>
          ) : null}

          <Button
            size="sm"
            className="h-8 shrink-0 gap-1 whitespace-nowrap bg-brand-500 px-3 text-xs text-white hover:bg-brand-600"
            onClick={onNext}
            autoFocus
          >
            {isLast ? "Concluir" : "Próximo"}
            {isLast ? (
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

export default TourCard;
