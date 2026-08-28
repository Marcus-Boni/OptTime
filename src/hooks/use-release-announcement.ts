"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "@/lib/auth-client";
import {
  fetchPublishedReleases,
  type PublishedRelease,
} from "@/lib/changelog/releases-cache";
import {
  normalizeVersionTag,
  readSeenReleaseTag,
  subscribeToChangelogSync,
  subscribeToReleaseAnnouncementRequest,
  writeSeenReleaseTag,
} from "@/lib/changelog/storage";
import { useFocusStore } from "@/stores/focus.store";
import { useOnboardingTourStore } from "@/stores/onboarding.store";
import { useUIStore } from "@/stores/ui.store";

/**
 * Routes where the announcement may open on its own. Restricted to the
 * dashboard home — the post-login landing page — so the modal never
 * interrupts someone mid-task on the time, calendar or reports screens.
 */
const AUTO_OPEN_ROUTES = new Set(["/dashboard"]);

/** Breathing room after landing, so the page settles before the modal enters. */
const AUTO_OPEN_DELAY_MS = 1400;

export interface ReleaseAnnouncementState {
  /** Latest published release, or `null` while loading / when none exists. */
  release: PublishedRelease | null;
  /** Older unseen releases besides `release`, for the "you also missed" line. */
  missedCount: number;
  /** Whether the modal is currently visible. */
  isOpen: boolean;
  /** Whether the modal should be mounted at all (lets the host lazy-load it). */
  shouldRender: boolean;
  /** Acknowledges the version and closes — also clears the header badge. */
  dismiss: () => void;
}

/** Better Auth serializes `createdAt` as a Date or an ISO string. */
function parseJoinDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

export function useReleaseAnnouncement(): ReleaseAnnouncementState {
  const pathname = usePathname();
  const { data: session, isPending: isSessionPending } = useSession();

  const [releases, setReleases] = useState<PublishedRelease[] | null>(null);
  const [seenTag, setSeenTag] = useState<string | null>(null);
  const [isStorageReady, setIsStorageReady] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [shouldRender, setShouldRender] = useState(false);

  // Another modal owning the screen — never stack on top of it.
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
  // Onboarding always wins: a new hire meeting the product for the first time
  // must not be interrupted by a changelog they have no context for.
  const isOnboardingBusy = useOnboardingTourStore(
    (state) => state.isActive || state.welcomeOpen,
  );

  const scheduledRef = useRef(false);
  const timeoutRef = useRef<number | null>(null);
  const contextRef = useRef({ pathname, blocked: false });

  // Read the acknowledged tag after hydration to keep server/client markup equal.
  useEffect(() => {
    setSeenTag(readSeenReleaseTag());
    setIsStorageReady(true);

    return subscribeToChangelogSync(() => {
      setSeenTag(readSeenReleaseTag());
    });
  }, []);

  useEffect(() => {
    let isMounted = true;

    fetchPublishedReleases()
      .then((list) => {
        if (isMounted) setReleases(list);
      })
      .catch((error: unknown) => {
        console.error(
          "[useReleaseAnnouncement] fetchPublishedReleases:",
          error,
        );
        if (isMounted) setReleases([]);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const latest = releases?.[0] ?? null;
  const latestTag = latest ? normalizeVersionTag(latest.versionTag) : null;

  /** Releases published after the last version the user caught up on. */
  const unseenCount = useMemo(() => {
    if (!releases || releases.length === 0) return 0;
    if (!seenTag) return releases.length;

    const seenIndex = releases.findIndex(
      (release) => normalizeVersionTag(release.versionTag) === seenTag,
    );

    return seenIndex === -1 ? releases.length : seenIndex;
  }, [releases, seenTag]);

  // Keep the auto-open timer's view of the world fresh without re-scheduling.
  useEffect(() => {
    contextRef.current = {
      pathname,
      blocked: isSurfaceBusy || isFocusModeOpen || isOnboardingBusy,
    };
  }, [pathname, isSurfaceBusy, isFocusModeOpen, isOnboardingBusy]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen || (isStorageReady && unseenCount > 0)) setShouldRender(true);
  }, [isOpen, isStorageReady, unseenCount]);

  const dismiss = useCallback(() => {
    setIsOpen(false);
    if (!latestTag) return;

    writeSeenReleaseTag(latestTag);
    setSeenTag(latestTag);
  }, [latestTag]);

  // Manual re-open (e.g. the "Ver destaques" button on the changelog page).
  useEffect(() => {
    return subscribeToReleaseAnnouncementRequest(() => {
      setIsOpen(true);
    });
  }, []);

  // Auto-open decision.
  useEffect(() => {
    if (scheduledRef.current) return;
    if (!isStorageReady || !releases || isSessionPending) return;
    if (!latest || !latestTag || unseenCount === 0) return;
    if (!AUTO_OPEN_ROUTES.has(pathname)) return;
    if (isSurfaceBusy || isFocusModeOpen || isOnboardingBusy) return;

    // Accounts created after the release went out have nothing to catch up on:
    // acknowledge silently so they get the modal from the *next* version only.
    const joinedAt = parseJoinDate(
      (session?.user as { createdAt?: unknown } | undefined)?.createdAt,
    );
    const publishedAt = latest.publishedAt
      ? new Date(latest.publishedAt)
      : null;

    if (
      joinedAt &&
      publishedAt &&
      joinedAt.getTime() >= publishedAt.getTime()
    ) {
      scheduledRef.current = true;
      writeSeenReleaseTag(latestTag);
      setSeenTag(latestTag);
      return;
    }

    scheduledRef.current = true;
    timeoutRef.current = window.setTimeout(() => {
      timeoutRef.current = null;
      const context = contextRef.current;

      // The user navigated away or opened something else while we waited —
      // stand down and let a later visit to the dashboard try again.
      if (!AUTO_OPEN_ROUTES.has(context.pathname) || context.blocked) {
        scheduledRef.current = false;
        return;
      }

      setIsOpen(true);
    }, AUTO_OPEN_DELAY_MS);
  }, [
    isStorageReady,
    releases,
    isSessionPending,
    session,
    latest,
    latestTag,
    unseenCount,
    pathname,
    isSurfaceBusy,
    isFocusModeOpen,
    isOnboardingBusy,
  ]);

  return {
    release: latest,
    missedCount: Math.max(unseenCount - 1, 0),
    isOpen,
    shouldRender,
    dismiss,
  };
}
