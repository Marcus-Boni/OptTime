"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { WelcomeDialog } from "@/components/onboarding/WelcomeDialog";
import { useOnboarding } from "@/hooks/use-onboarding";
import { useSession } from "@/lib/auth-client";
import { getTour } from "@/lib/onboarding/tours";
import type { TourId } from "@/lib/onboarding/types";
import { useFocusStore } from "@/stores/focus.store";
import {
  type TourEndReason,
  useOnboardingTourStore,
} from "@/stores/onboarding.store";
import { useUIStore } from "@/stores/ui.store";
import type { User as UserType } from "@/types/user";

/**
 * The overlay is only needed once a tour actually starts, and it carries the
 * geometry engine with it — keep it out of the dashboard shell bundle.
 */
const TourOverlay = dynamic(
  () =>
    import("@/components/onboarding/TourOverlay").then((mod) => ({
      default: mod.TourOverlay,
    })),
  { ssr: false },
);

/**
 * Routes where the welcome dialog may open on its own. Restricted to the
 * dashboard home so it never interrupts someone mid-task.
 */
const AUTO_OPEN_ROUTES = new Set(["/dashboard"]);

/** Breathing room after landing, so the page settles before the dialog enters. */
const AUTO_OPEN_DELAY_MS = 900;

const WELCOME_TOUR_ID: TourId = "welcome";

/**
 * Owns the onboarding experience for the whole dashboard: the first-run
 * welcome, the guided tour overlay and the persistence of both.
 *
 * Progress is written server-side through `useOnboarding`, so finishing the
 * tour on one device never replays it on another.
 */
export function OnboardingHost() {
  const pathname = usePathname();
  const { data: session, isPending } = useSession();
  const user = isPending
    ? null
    : ((session?.user as unknown as UserType) ?? null);

  const { overview, send } = useOnboarding({ enabled: !isPending && !!user });

  const isActive = useOnboardingTourStore((state) => state.isActive);
  const welcomeOpen = useOnboardingTourStore((state) => state.welcomeOpen);
  const setRole = useOnboardingTourStore((state) => state.setRole);
  const setHandlers = useOnboardingTourStore((state) => state.setHandlers);
  const startTour = useOnboardingTourStore((state) => state.startTour);
  const openWelcome = useOnboardingTourStore((state) => state.openWelcome);
  const closeWelcome = useOnboardingTourStore((state) => state.closeWelcome);

  // Another surface already owns the screen — never stack on top of it.
  const isSurfaceBusy = useUIStore(
    (state) =>
      state.commandPaletteOpen ||
      state.quickEntryOpen ||
      state.quickTimerOpen ||
      state.shortcutsModalOpen ||
      state.weeklyDigestModalOpen ||
      state.activeModal !== null,
  );
  const isFocusModeOpen = useFocusStore((state) => state.isOpen);

  // Once a tour has run, the overlay stays mounted for the rest of the session
  // so closing it can animate out instead of vanishing.
  const [hasRunTour, setHasRunTour] = useState(false);

  const welcomeScheduledRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const contextRef = useRef({ pathname, blocked: false });

  useEffect(() => {
    if (user?.role) setRole(user.role);
  }, [user?.role, setRole]);

  useEffect(() => {
    if (isActive) setHasRunTour(true);
  }, [isActive]);

  const handleTourStart = useCallback(
    (tourId: TourId) => {
      void send({ action: "start_tour", tourId });
    },
    [send],
  );

  const handleTourEnd = useCallback(
    (tourId: TourId, reason: TourEndReason) => {
      if (reason !== "completed") return;
      void send({ action: "complete_tour", tourId });
    },
    [send],
  );

  useEffect(() => {
    setHandlers({ onStart: handleTourStart, onEnd: handleTourEnd });
  }, [setHandlers, handleTourStart, handleTourEnd]);

  useEffect(() => {
    contextRef.current = {
      pathname,
      blocked: isSurfaceBusy || isFocusModeOpen,
    };
  }, [pathname, isSurfaceBusy, isFocusModeOpen]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  // Auto-open decision for the welcome dialog.
  useEffect(() => {
    if (welcomeScheduledRef.current) return;
    if (!overview?.shouldShowWelcome) return;
    if (isActive || welcomeOpen) return;
    if (!AUTO_OPEN_ROUTES.has(pathname)) return;
    if (isSurfaceBusy || isFocusModeOpen) return;

    welcomeScheduledRef.current = true;
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      const context = contextRef.current;

      // The user moved on while we waited — stand down and try again on the
      // next visit to the dashboard.
      if (!AUTO_OPEN_ROUTES.has(context.pathname) || context.blocked) {
        welcomeScheduledRef.current = false;
        return;
      }

      openWelcome();
    }, AUTO_OPEN_DELAY_MS);
  }, [
    overview?.shouldShowWelcome,
    isActive,
    welcomeOpen,
    pathname,
    isSurfaceBusy,
    isFocusModeOpen,
    openWelcome,
  ]);

  const handleStartWelcomeTour = useCallback(() => {
    closeWelcome();
    void send({ action: "dismiss_welcome", startedTour: true });
    startTour(WELCOME_TOUR_ID);
  }, [closeWelcome, send, startTour]);

  const handleExploreAlone = useCallback(() => {
    closeWelcome();
    void send({ action: "dismiss_welcome", startedTour: false });
  }, [closeWelcome, send]);

  if (!user) return null;

  const welcomeTour = getTour(WELCOME_TOUR_ID);
  const firstName = user.name?.split(" ")[0] ?? "";

  return (
    <>
      {welcomeOpen ? (
        <WelcomeDialog
          open={welcomeOpen}
          userName={firstName}
          role={user.role}
          tourMinutes={welcomeTour?.estimatedMinutes ?? 3}
          onStartTour={handleStartWelcomeTour}
          onExploreAlone={handleExploreAlone}
        />
      ) : null}

      {hasRunTour ? <TourOverlay /> : null}
    </>
  );
}

export default OnboardingHost;
