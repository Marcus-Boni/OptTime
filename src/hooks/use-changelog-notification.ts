"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { DEFAULT_APP_VERSION_TAG } from "@/lib/version";

const CHANGELOG_SEEN_KEY = "optsolv_seen_release_tag";
const CHANGELOG_SEEN_EVENT = "optsolv:changelog-seen";

export function useChangelogNotification() {
  const pathname = usePathname();
  const [latestVersion, setLatestVersion] = useState<string>(
    DEFAULT_APP_VERSION_TAG,
  );
  const [hasUnseen, setHasUnseen] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const checkUnseen = useCallback((latestTag: string) => {
    if (typeof window === "undefined") return;

    try {
      const seenTag = localStorage.getItem(CHANGELOG_SEEN_KEY);
      if (!seenTag) {
        // First visit or clean cache — if there's a published tag, show highlight
        setHasUnseen(true);
        return;
      }

      const normalizedLatest = latestTag.startsWith("v")
        ? latestTag
        : `v${latestTag}`;
      const normalizedSeen = seenTag.startsWith("v") ? seenTag : `v${seenTag}`;

      setHasUnseen(normalizedLatest !== normalizedSeen);
    } catch {
      setHasUnseen(false);
    }
  }, []);

  const markAsSeen = useCallback(() => {
    if (typeof window === "undefined" || !latestVersion) return;

    try {
      localStorage.setItem(CHANGELOG_SEEN_KEY, latestVersion);
      setHasUnseen(false);
      window.dispatchEvent(
        new CustomEvent(CHANGELOG_SEEN_EVENT, { detail: latestVersion }),
      );
    } catch (err) {
      console.error("[useChangelogNotification] markAsSeen:", err);
    }
  }, [latestVersion]);

  // Fetch latest release
  useEffect(() => {
    let isMounted = true;

    async function fetchLatest() {
      try {
        const res = await fetch("/api/releases");
        if (!res.ok) return;

        const data = (await res.json()) as {
          releases?: Array<{ status: string; versionTag: string }>;
        };

        if (data.releases && Array.isArray(data.releases)) {
          const published = data.releases.filter(
            (r) => r.status === "published",
          );
          const topRelease = published[0];

          if (topRelease?.versionTag && isMounted) {
            const rawTag = topRelease.versionTag.trim();
            const formatted = rawTag.startsWith("v") ? rawTag : `v${rawTag}`;
            setLatestVersion(formatted);
            checkUnseen(formatted);
          }
        }
      } catch (err) {
        console.error("[useChangelogNotification] fetchLatest:", err);
      } finally {
        if (isMounted) setIsLoaded(true);
      }
    }

    void fetchLatest();

    return () => {
      isMounted = false;
    };
  }, [checkUnseen]);

  // If user is currently on the releases page, automatically mark as seen
  useEffect(() => {
    if (pathname === "/dashboard/releases" && latestVersion) {
      markAsSeen();
    }
  }, [pathname, latestVersion, markAsSeen]);

  // Listen for storage / cross-tab / local event updates
  useEffect(() => {
    function handleSync(event: Event) {
      if (event instanceof CustomEvent && typeof event.detail === "string") {
        checkUnseen(latestVersion);
      } else if (
        event instanceof StorageEvent &&
        event.key === CHANGELOG_SEEN_KEY
      ) {
        checkUnseen(latestVersion);
      }
    }

    window.addEventListener(CHANGELOG_SEEN_EVENT, handleSync);
    window.addEventListener("storage", handleSync);

    return () => {
      window.removeEventListener(CHANGELOG_SEEN_EVENT, handleSync);
      window.removeEventListener("storage", handleSync);
    };
  }, [checkUnseen, latestVersion]);

  return {
    latestVersion,
    hasUnseen: pathname === "/dashboard/releases" ? false : hasUnseen,
    isLoaded,
    markAsSeen,
  };
}
