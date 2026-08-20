"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchPublishedReleases } from "@/lib/changelog/releases-cache";
import {
  normalizeVersionTag,
  readSeenReleaseTag,
  subscribeToChangelogSync,
  writeSeenReleaseTag,
} from "@/lib/changelog/storage";
import { DEFAULT_APP_VERSION_TAG } from "@/lib/version";

export function useChangelogNotification() {
  const pathname = usePathname();
  const [latestVersion, setLatestVersion] = useState<string>(
    DEFAULT_APP_VERSION_TAG,
  );
  const [seenTag, setSeenTag] = useState<string | null>(null);
  const [hasPublishedRelease, setHasPublishedRelease] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  const markAsSeen = useCallback(() => {
    if (!latestVersion) return;

    writeSeenReleaseTag(latestVersion);
    setSeenTag(normalizeVersionTag(latestVersion));
  }, [latestVersion]);

  // Read the acknowledged tag after hydration and stay in sync across tabs.
  useEffect(() => {
    setSeenTag(readSeenReleaseTag());

    return subscribeToChangelogSync(() => {
      setSeenTag(readSeenReleaseTag());
    });
  }, []);

  // Fetch latest release (shared cache — deduped with the announcement modal)
  useEffect(() => {
    let isMounted = true;

    fetchPublishedReleases()
      .then((releases) => {
        if (!isMounted) return;

        const topRelease = releases[0];
        if (topRelease?.versionTag) {
          setLatestVersion(normalizeVersionTag(topRelease.versionTag));
          setHasPublishedRelease(true);
        }
      })
      .catch((error: unknown) => {
        console.error(
          "[useChangelogNotification] fetchPublishedReleases:",
          error,
        );
      })
      .finally(() => {
        if (isMounted) setIsLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Reading the changelog page counts as catching up.
  useEffect(() => {
    if (pathname === "/dashboard/releases" && hasPublishedRelease) {
      markAsSeen();
    }
  }, [pathname, hasPublishedRelease, markAsSeen]);

  const hasUnseen =
    isLoaded &&
    hasPublishedRelease &&
    seenTag !== normalizeVersionTag(latestVersion);

  return {
    latestVersion,
    hasUnseen: pathname === "/dashboard/releases" ? false : hasUnseen,
    isLoaded,
    markAsSeen,
  };
}
