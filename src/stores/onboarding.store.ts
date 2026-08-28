"use client";

import { create } from "zustand";
import { getStepsForRole, getTour } from "@/lib/onboarding/tours";
import type { TourId, TourStep } from "@/lib/onboarding/types";
import type { UserRole } from "@/types/user";

export type TourEndReason = "completed" | "skipped";

export interface TourHandlers {
  /** Fired once when a tour actually starts (after role filtering). */
  onStart?: (tourId: TourId) => void;
  /** Fired once when a tour ends, either by finishing or by being dismissed. */
  onEnd?: (tourId: TourId, reason: TourEndReason) => void;
}

interface OnboardingTourState {
  /** Role used to filter steps. Kept in sync by the onboarding host. */
  role: UserRole;
  tourId: TourId | null;
  /** Steps already filtered for `role`. */
  steps: TourStep[];
  stepIndex: number;
  isActive: boolean;
  /** Whether the first-run welcome dialog is on screen. */
  welcomeOpen: boolean;
  handlers: TourHandlers;
}

interface OnboardingTourActions {
  setRole: (role: UserRole) => void;
  setHandlers: (handlers: TourHandlers) => void;
  /** Starts a tour. Returns false when the role has no steps for it. */
  startTour: (tourId: TourId) => boolean;
  next: () => void;
  previous: () => void;
  /** Ends the run. `completed` marks the tour as watched to the end. */
  endTour: (reason: TourEndReason) => void;
  openWelcome: () => void;
  closeWelcome: () => void;
}

export const useOnboardingTourStore = create<
  OnboardingTourState & OnboardingTourActions
>()((set, get) => ({
  role: "member",
  tourId: null,
  steps: [],
  stepIndex: 0,
  isActive: false,
  welcomeOpen: false,
  handlers: {},

  setRole: (role) => set({ role }),
  setHandlers: (handlers) => set({ handlers }),

  startTour: (tourId) => {
    const tour = getTour(tourId);
    if (!tour) return false;

    const { role, handlers } = get();
    if (!tour.roles.includes(role)) return false;

    const steps = [...getStepsForRole(tour, role)];
    if (steps.length === 0) return false;

    set({
      tourId,
      steps,
      stepIndex: 0,
      isActive: true,
      welcomeOpen: false,
    });

    handlers.onStart?.(tourId);
    return true;
  },

  next: () => {
    const { stepIndex, steps } = get();
    if (stepIndex >= steps.length - 1) {
      get().endTour("completed");
      return;
    }
    set({ stepIndex: stepIndex + 1 });
  },

  previous: () => {
    const { stepIndex } = get();
    if (stepIndex <= 0) return;
    set({ stepIndex: stepIndex - 1 });
  },

  endTour: (reason) => {
    const { tourId, handlers, isActive } = get();
    set({
      tourId: null,
      steps: [],
      stepIndex: 0,
      isActive: false,
    });

    if (isActive && tourId) handlers.onEnd?.(tourId, reason);
  },

  openWelcome: () => set({ welcomeOpen: true }),
  closeWelcome: () => set({ welcomeOpen: false }),
}));

/**
 * Starts a tour from anywhere — command palette, help menu, checklist card —
 * without those surfaces needing to subscribe to the store.
 */
export function startTour(tourId: TourId): boolean {
  return useOnboardingTourStore.getState().startTour(tourId);
}
