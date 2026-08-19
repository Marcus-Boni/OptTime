"use client";

import type { CelebrationPayload } from "./types";

export const CELEBRATION_EVENT = "gamification:celebrate";
export const GAMIFICATION_UPDATED_EVENT = "gamification:updated";

/**
 * Weeks can be closed from three different surfaces (the week card, the
 * timesheet detail page and the AI assistant), so the celebration is triggered
 * through a window event instead of being wired into each one.
 */
export function dispatchCelebration(payload: CelebrationPayload): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<CelebrationPayload>(CELEBRATION_EVENT, { detail: payload }),
  );
}

/** Tell mounted gamification surfaces to refetch. */
export function dispatchGamificationUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(GAMIFICATION_UPDATED_EVENT));
}

/**
 * Narrow an unknown API response into a celebration payload.
 * Returns null when the endpoint did not produce one.
 */
export function readCelebration(value: unknown): CelebrationPayload | null {
  if (!value || typeof value !== "object") return null;
  const candidate = (value as { celebration?: unknown }).celebration;
  if (!candidate || typeof candidate !== "object") return null;

  const payload = candidate as Partial<CelebrationPayload>;
  if (typeof payload.period !== "string") return null;
  if (typeof payload.xpGained !== "number") return null;

  return payload as CelebrationPayload;
}
