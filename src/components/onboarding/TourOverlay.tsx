"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { TourCard } from "@/components/onboarding/TourCard";
import {
  CARD_WIDTH,
  type CardPosition,
  COMPACT_BREAKPOINT,
  computeCardPosition,
  computeCompactPosition,
  measureTarget,
  type SpotlightRect,
  waitForElement,
} from "@/components/onboarding/tour-geometry";
import { getTour } from "@/lib/onboarding/tours";
import { useOnboardingTourStore } from "@/stores/onboarding.store";

/** How long a step waits for its target before giving up on it. */
const TARGET_TIMEOUT_MS = 4000;
/** How long a step waits for a route change to land. */
const ROUTE_TIMEOUT_MS = 5000;
/** Settle time after `scrollIntoView`, so the measured rect is the final one. */
const SCROLL_SETTLE_MS = 380;
const DEFAULT_PADDING = 8;
const DEFAULT_RADIUS = 12;
/** Height assumed before the card is measured, used for the first placement. */
const ESTIMATED_CARD_HEIGHT = 240;

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (ms <= 0 || signal.aborted) {
      resolve();
      return;
    }

    const id = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    function onAbort() {
      window.clearTimeout(id);
      resolve();
    }

    signal.addEventListener("abort", onAbort);
  });
}

/**
 * A step's `route` matches the current location when the pathname matches —
 * and, only when the step pins a query string, when that matches too. This
 * keeps a step on `/dashboard` from wiping the filters the user already set.
 */
function isOnRoute(route: string): boolean {
  const url = new URL(route, window.location.origin);

  if (url.pathname !== window.location.pathname) return false;
  if (!url.search) return true;

  return url.search === window.location.search;
}

function waitForRoute(route: string, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (isOnRoute(route)) {
      resolve(true);
      return;
    }

    let settled = false;

    const finish = (matched: boolean) => {
      if (settled) return;
      settled = true;
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve(matched);
    };

    const onAbort = () => finish(false);
    const intervalId = window.setInterval(() => {
      if (isOnRoute(route)) finish(true);
    }, 60);
    const timeoutId = window.setTimeout(() => finish(false), ROUTE_TIMEOUT_MS);

    signal.addEventListener("abort", onAbort);
  });
}

interface Viewport {
  width: number;
  height: number;
}

function readViewport(): Viewport {
  return { width: window.innerWidth, height: window.innerHeight };
}

/**
 * The guided tour engine.
 *
 * Owns everything visual about a running tour: navigating to the step's route,
 * waiting for its target to exist, cutting the spotlight out of the scrim and
 * placing the step card so it never covers what it is describing.
 *
 * Resilience is the point — a step whose element never appears is skipped
 * instead of dead-ending the tour, because screens change faster than tour
 * content does.
 */
export function TourOverlay() {
  const isActive = useOnboardingTourStore((state) => state.isActive);
  const steps = useOnboardingTourStore((state) => state.steps);
  const stepIndex = useOnboardingTourStore((state) => state.stepIndex);
  const tourId = useOnboardingTourStore((state) => state.tourId);
  const next = useOnboardingTourStore((state) => state.next);
  const previous = useOnboardingTourStore((state) => state.previous);
  const endTour = useOnboardingTourStore((state) => state.endTour);

  const router = useRouter();
  const prefersReducedMotion = useReducedMotion();

  const [mounted, setMounted] = useState(false);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const [ready, setReady] = useState(false);
  const [viewport, setViewport] = useState<Viewport>({
    width: 1280,
    height: 800,
  });
  const [cardHeight, setCardHeight] = useState(ESTIMATED_CARD_HEIGHT);

  const targetRef = useRef<HTMLElement | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);
  /**
   * 1 while moving forward, -1 while moving back. The ref is what the async
   * step preparation reads — it must not re-run when the direction changes —
   * while the state is what the card animates from.
   */
  const directionRef = useRef<1 | -1>(1);
  const [direction, setDirection] = useState<1 | -1>(1);

  const step = isActive ? steps[stepIndex] : undefined;
  const tour = tourId ? getTour(tourId) : null;

  useEffect(() => {
    setMounted(true);
    setViewport(readViewport());
  }, []);

  const handleNext = useCallback(() => {
    directionRef.current = 1;
    setDirection(1);
    next();
  }, [next]);

  const handlePrevious = useCallback(() => {
    directionRef.current = -1;
    setDirection(-1);
    previous();
  }, [previous]);

  const handleSkip = useCallback(() => {
    endTour("skipped");
  }, [endTour]);

  // Step preparation: navigate, wait for the target, scroll it into view.
  useEffect(() => {
    if (!isActive || !step) return;

    const controller = new AbortController();
    const { signal } = controller;
    let cancelled = false;

    setReady(false);
    targetRef.current = null;

    const padding = step.spotlightPadding ?? DEFAULT_PADDING;
    const radius = step.spotlightRadius ?? DEFAULT_RADIUS;

    const settle = (nextRect: SpotlightRect | null) => {
      if (cancelled) return;
      setRect(nextRect);
      setReady(true);
    };

    const skipStep = () => {
      if (cancelled) return;

      if (directionRef.current === 1) {
        // `next` ends the tour on the last step, which is the right outcome.
        next();
        return;
      }

      if (stepIndex > 0) {
        previous();
        return;
      }

      // Nowhere left to go backwards: show the step without a spotlight.
      settle(null);
    };

    void (async () => {
      if (step.route && !isOnRoute(step.route)) {
        router.push(step.route);
        await waitForRoute(step.route, signal);
        if (cancelled) return;
      }

      if (!step.target) {
        settle(null);
        return;
      }

      const element = await waitForElement(
        step.target,
        TARGET_TIMEOUT_MS,
        signal,
      );
      if (cancelled) return;

      if (!element) {
        if (step.optional === false) {
          settle(null);
          return;
        }
        skipStep();
        return;
      }

      targetRef.current = element;
      element.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: prefersReducedMotion ? "auto" : "smooth",
      });

      await delay(prefersReducedMotion ? 0 : SCROLL_SETTLE_MS, signal);
      if (cancelled) return;

      settle(measureTarget(element, padding, radius));
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isActive, step, stepIndex, next, previous, router, prefersReducedMotion]);

  // Keep the spotlight glued to its target while the page moves under it.
  useEffect(() => {
    if (!isActive || !ready) return;

    let frame = 0;

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        setViewport(readViewport());

        const element = targetRef.current;
        if (!element || !step) return;

        setRect(
          measureTarget(
            element,
            step.spotlightPadding ?? DEFAULT_PADDING,
            step.spotlightRadius ?? DEFAULT_RADIUS,
          ),
        );
      });
    };

    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);

    const observer = new ResizeObserver(update);
    if (targetRef.current) observer.observe(targetRef.current);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
      observer.disconnect();
    };
  }, [isActive, ready, step]);

  // Measure the card so placement uses its real height, not the estimate.
  useEffect(() => {
    const element = cardRef.current;
    if (!element || !ready) return;

    const observer = new ResizeObserver(() => {
      setCardHeight(element.offsetHeight);
    });

    observer.observe(element);
    setCardHeight(element.offsetHeight);

    return () => observer.disconnect();
  }, [ready]);

  useEffect(() => {
    if (!isActive) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        handleSkip();
        return;
      }

      if (event.key === "ArrowRight") {
        event.preventDefault();
        handleNext();
        return;
      }

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        handlePrevious();
        return;
      }

      // Keep Tab inside the step card. The page behind is covered but still
      // focusable, and tabbing into invisible controls is disorienting.
      if (event.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;

        const focusable = card.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;

        const active = document.activeElement;

        if (!card.contains(active)) {
          event.preventDefault();
          first.focus();
          return;
        }

        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
          return;
        }

        if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [isActive, handleSkip, handleNext, handlePrevious]);

  // The overlay stays mounted between tours so `AnimatePresence` can play the
  // exit animation; the effects above all no-op while `isActive` is false.
  if (!mounted) return null;

  const isVisible = isActive && !!step && !!tour;
  const isCompact = viewport.width < COMPACT_BREAKPOINT;
  const cardWidth = isCompact
    ? Math.min(CARD_WIDTH, viewport.width - 24)
    : CARD_WIDTH;
  const cardSize = { width: cardWidth, height: cardHeight };

  const position: CardPosition = isCompact
    ? computeCompactPosition(cardSize, viewport)
    : computeCardPosition(
        rect,
        step?.placement ?? (rect ? "bottom" : "center"),
        cardSize,
        viewport,
      );

  const transition = prefersReducedMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 320, damping: 32 };

  // z-index sits above the floating TimeBot launcher (9990) so the tour can
  // spotlight it without the scrim covering the button.
  return createPortal(
    <AnimatePresence>
      {isVisible && step && tour ? (
        <motion.div
          key="tour-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: prefersReducedMotion ? 0 : 0.2 }}
          className="fixed inset-0 z-[9995]"
          aria-live="polite"
        >
          {rect && ready ? (
            <>
              {/* Scrim: a single element whose oversized shadow paints the whole
                viewport, which is what gives the cutout its rounded corners. */}
              <motion.div
                className="pointer-events-none absolute"
                initial={false}
                animate={{
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                }}
                transition={transition}
                style={{
                  borderRadius: rect.radius,
                  boxShadow: "0 0 0 100vmax var(--tour-scrim)",
                }}
              />
              <motion.div
                className="pointer-events-none absolute ring-2 ring-brand-500/80"
                initial={false}
                animate={{
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  height: rect.height,
                }}
                transition={transition}
                style={{
                  borderRadius: rect.radius,
                  boxShadow: "0 0 0 4px rgba(249, 115, 22, 0.18)",
                }}
              />
            </>
          ) : (
            <div
              className="absolute inset-0"
              style={{ backgroundColor: "var(--tour-scrim)" }}
            />
          )}

          {/* Interaction layer. A step that invites the user to click keeps the
            spotlighted element reachable; every other step blocks the page. */}
          {step.allowInteraction && rect ? (
            <>
              <div
                className="absolute inset-x-0 top-0"
                style={{ height: Math.max(rect.top, 0) }}
              />
              <div
                className="absolute left-0"
                style={{
                  top: rect.top,
                  height: rect.height,
                  width: Math.max(rect.left, 0),
                }}
              />
              <div
                className="absolute right-0"
                style={{
                  top: rect.top,
                  height: rect.height,
                  width: Math.max(viewport.width - rect.left - rect.width, 0),
                }}
              />
              <div
                className="absolute inset-x-0 bottom-0"
                style={{
                  height: Math.max(viewport.height - rect.top - rect.height, 0),
                }}
              />
            </>
          ) : (
            <div className="absolute inset-0" />
          )}

          {/* The wrapper owns position only. Step-to-step motion lives inside
              the card, so the two never fight over the same element. */}
          {ready ? (
            <motion.div
              ref={cardRef}
              initial={
                prefersReducedMotion
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.97 }
              }
              animate={{
                opacity: 1,
                scale: 1,
                top: position.top,
                left: position.left,
              }}
              transition={transition}
              className="pointer-events-none absolute"
              style={{ width: cardWidth }}
            >
              <TourCard
                tourTitle={tour.title}
                step={step}
                stepNumber={stepIndex + 1}
                totalSteps={steps.length}
                isFirst={stepIndex === 0}
                isLast={stepIndex === steps.length - 1}
                direction={direction}
                onNext={handleNext}
                onPrevious={handlePrevious}
                onSkip={handleSkip}
              />
            </motion.div>
          ) : null}
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}

export default TourOverlay;
