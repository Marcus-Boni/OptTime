"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import {
  CELEBRATION_EVENT,
  dispatchGamificationUpdated,
} from "@/lib/gamification/celebration-bus";
import type { CelebrationPayload } from "@/lib/gamification/types";

// Kept out of the shell bundle: nothing here runs until a week is closed.
const ConfettiCannon = dynamic(
  () => import("@/components/gamification/ConfettiCannon"),
  { ssr: false },
);
const CelebrationOverlay = dynamic(
  () => import("@/components/gamification/CelebrationOverlay"),
  { ssr: false },
);

/**
 * Listens for celebration events anywhere in the dashboard and runs the
 * confetti + overlay. Mounted once by the dashboard shell.
 */
export function CelebrationHost() {
  const [celebration, setCelebration] = useState<CelebrationPayload | null>(
    null,
  );
  const [confettiActive, setConfettiActive] = useState(false);
  // Once mounted the overlay stays put so AnimatePresence can animate it out.
  const [overlayMounted, setOverlayMounted] = useState(false);

  useEffect(() => {
    function handleCelebrate(event: Event) {
      const payload = (event as CustomEvent<CelebrationPayload>).detail;
      if (!payload || payload.alreadyCredited) return;
      if (!payload.celebrationsEnabled) return;

      setCelebration(payload);
      setConfettiActive(true);
      setOverlayMounted(true);
      dispatchGamificationUpdated();
    }

    window.addEventListener(CELEBRATION_EVENT, handleCelebrate);
    return () => window.removeEventListener(CELEBRATION_EVENT, handleCelebrate);
  }, []);

  const handleClose = useCallback(() => {
    setCelebration(null);
  }, []);

  const handleConfettiDone = useCallback(() => {
    setConfettiActive(false);
  }, []);

  return (
    <>
      {confettiActive ? (
        <ConfettiCannon
          active
          intensity={celebration?.leveledUp ? "epic" : "normal"}
          onDone={handleConfettiDone}
        />
      ) : null}
      {overlayMounted ? (
        <CelebrationOverlay celebration={celebration} onClose={handleClose} />
      ) : null}
    </>
  );
}
