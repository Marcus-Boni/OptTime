import type { TourPlacement } from "@/lib/onboarding/types";

/** Spotlight rectangle in viewport coordinates. */
export interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
  radius: number;
}

export interface CardPosition {
  top: number;
  left: number;
  /** Placement actually used after flipping and clamping. */
  placement: TourPlacement;
}

/** Distance between the spotlight edge and the step card. */
const GAP = 16;
/** Minimum breathing room between the card and the viewport edge. */
const MARGIN = 12;
/** Below this width the card docks to the bottom as a sheet. */
export const COMPACT_BREAKPOINT = 640;
export const CARD_WIDTH = 380;

function isVisible(element: Element): boolean {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;

  const style = window.getComputedStyle(element);
  return style.visibility !== "hidden" && style.display !== "none";
}

/**
 * Resolves a tour target, waiting for it to show up.
 *
 * Steps often point at elements that mount after a route change or a data
 * fetch, so a plain `querySelector` would miss them. Observes the DOM and
 * gives up after `timeoutMs` so a removed element can never hang a tour.
 */
export function waitForElement(
  selector: string,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(null);
      return;
    }

    const find = (): HTMLElement | null => {
      const found = document.querySelector(selector);
      return found instanceof HTMLElement && isVisible(found) ? found : null;
    };

    const immediate = find();
    if (immediate) {
      resolve(immediate);
      return;
    }

    let settled = false;

    const finish = (element: HTMLElement | null) => {
      if (settled) return;
      settled = true;
      observer.disconnect();
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
      signal.removeEventListener("abort", onAbort);
      resolve(element);
    };

    const onAbort = () => finish(null);

    const observer = new MutationObserver(() => {
      const element = find();
      if (element) finish(element);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-tour", "style", "class", "hidden"],
    });

    // Belt and braces: catches elements that become visible without a
    // mutation, e.g. a parent that finishes an enter animation.
    const intervalId = window.setInterval(() => {
      const element = find();
      if (element) finish(element);
    }, 150);

    const timeoutId = window.setTimeout(() => finish(null), timeoutMs);
    signal.addEventListener("abort", onAbort);
  });
}

/** Measures an element, padded and rounded for the spotlight cutout. */
export function measureTarget(
  element: HTMLElement,
  padding: number,
  radius: number,
): SpotlightRect {
  const rect = element.getBoundingClientRect();

  return {
    top: rect.top - padding,
    left: rect.left - padding,
    width: rect.width + padding * 2,
    height: rect.height + padding * 2,
    radius,
  };
}

interface PlacementFit {
  placement: TourPlacement;
  fits: boolean;
  top: number;
  left: number;
}

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function candidateFor(
  placement: TourPlacement,
  rect: SpotlightRect,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): PlacementFit {
  const maxLeft = viewport.width - card.width - MARGIN;
  const maxTop = viewport.height - card.height - MARGIN;

  switch (placement) {
    case "top": {
      const top = rect.top - card.height - GAP;
      return {
        placement,
        fits: top >= MARGIN,
        top,
        left: clamp(
          rect.left + rect.width / 2 - card.width / 2,
          MARGIN,
          maxLeft,
        ),
      };
    }
    case "bottom": {
      const top = rect.top + rect.height + GAP;
      return {
        placement,
        fits: top + card.height <= viewport.height - MARGIN,
        top,
        left: clamp(
          rect.left + rect.width / 2 - card.width / 2,
          MARGIN,
          maxLeft,
        ),
      };
    }
    case "left": {
      const left = rect.left - card.width - GAP;
      return {
        placement,
        fits: left >= MARGIN,
        top: clamp(
          rect.top + rect.height / 2 - card.height / 2,
          MARGIN,
          maxTop,
        ),
        left,
      };
    }
    case "right": {
      const left = rect.left + rect.width + GAP;
      return {
        placement,
        fits: left + card.width <= viewport.width - MARGIN,
        top: clamp(
          rect.top + rect.height / 2 - card.height / 2,
          MARGIN,
          maxTop,
        ),
        left,
      };
    }
    default:
      return {
        placement: "center",
        fits: true,
        top: Math.max(MARGIN, viewport.height / 2 - card.height / 2),
        left: Math.max(MARGIN, viewport.width / 2 - card.width / 2),
      };
  }
}

const FALLBACK_ORDER: Record<TourPlacement, readonly TourPlacement[]> = {
  top: ["top", "bottom", "right", "left"],
  bottom: ["bottom", "top", "right", "left"],
  left: ["left", "right", "bottom", "top"],
  right: ["right", "left", "bottom", "top"],
  center: ["center"],
};

/**
 * Places the step card next to the spotlight, flipping to the opposite side
 * when the preferred one does not fit and falling back to a centered card when
 * nothing does.
 */
export function computeCardPosition(
  rect: SpotlightRect | null,
  preferred: TourPlacement,
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): CardPosition {
  if (!rect || preferred === "center") {
    const centered = candidateFor("center", rect ?? EMPTY_RECT, card, viewport);
    return { top: centered.top, left: centered.left, placement: "center" };
  }

  for (const placement of FALLBACK_ORDER[preferred]) {
    const candidate = candidateFor(placement, rect, card, viewport);
    if (candidate.fits) {
      return {
        top: candidate.top,
        left: candidate.left,
        placement: candidate.placement,
      };
    }
  }

  const centered = candidateFor("center", rect, card, viewport);
  return { top: centered.top, left: centered.left, placement: "center" };
}

const EMPTY_RECT: SpotlightRect = {
  top: 0,
  left: 0,
  width: 0,
  height: 0,
  radius: 0,
};

/** Card position for narrow viewports, where it docks to the bottom edge. */
export function computeCompactPosition(
  card: { width: number; height: number },
  viewport: { width: number; height: number },
): CardPosition {
  return {
    top: Math.max(MARGIN, viewport.height - card.height - MARGIN),
    left: Math.max(MARGIN, (viewport.width - card.width) / 2),
    placement: "bottom",
  };
}
