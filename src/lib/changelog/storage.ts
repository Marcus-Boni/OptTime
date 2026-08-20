"use client";

/**
 * Single source of truth for changelog acknowledgement on the client.
 *
 * One mark is stored — the newest version tag the user has already caught up
 * on. It is written both when the announcement modal is dismissed and when the
 * user opens the changelog page, so the header badge and the modal never nag
 * about the same version twice.
 */

const SEEN_KEY = "optsolv_seen_release_tag";

/** Fired whenever the acknowledged tag changes (same tab). */
export const CHANGELOG_SYNC_EVENT = "optsolv:changelog-seen";

/** Fired when some surface asks the announcement modal to open on demand. */
export const RELEASE_ANNOUNCEMENT_OPEN_EVENT =
  "optsolv:open-release-announcement";

/** Normalizes `1.6.0` and `v1.6.0` to the canonical `v1.6.0` form. */
export function normalizeVersionTag(tag: string): string {
  const trimmed = tag.trim();
  if (!trimmed) return "";
  return trimmed.startsWith("v") ? trimmed : `v${trimmed}`;
}

/** Reads the acknowledged tag. Returns `null` on SSR or blocked storage. */
export function readSeenReleaseTag(): string | null {
  if (typeof window === "undefined") return null;

  try {
    const stored = localStorage.getItem(SEEN_KEY);
    return stored ? normalizeVersionTag(stored) : null;
  } catch (error: unknown) {
    console.error("[changelog/storage] readSeenReleaseTag:", error);
    return null;
  }
}

/** Persists the acknowledged tag and notifies every listener in this tab. */
export function writeSeenReleaseTag(tag: string): void {
  if (typeof window === "undefined") return;

  const normalized = normalizeVersionTag(tag);
  if (!normalized) return;

  try {
    localStorage.setItem(SEEN_KEY, normalized);
  } catch (error: unknown) {
    console.error("[changelog/storage] writeSeenReleaseTag:", error);
  }

  window.dispatchEvent(
    new CustomEvent(CHANGELOG_SYNC_EVENT, { detail: normalized }),
  );
}

/** Subscribes to same-tab and cross-tab acknowledgement changes. */
export function subscribeToChangelogSync(listener: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  function handleCustom() {
    listener();
  }

  function handleStorage(event: StorageEvent) {
    if (event.key === SEEN_KEY) listener();
  }

  window.addEventListener(CHANGELOG_SYNC_EVENT, handleCustom);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CHANGELOG_SYNC_EVENT, handleCustom);
    window.removeEventListener("storage", handleStorage);
  };
}

/** Asks the mounted announcement host to open the modal (manual re-open). */
export function requestReleaseAnnouncement(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(RELEASE_ANNOUNCEMENT_OPEN_EVENT));
}

/** Subscribes to manual re-open requests. */
export function subscribeToReleaseAnnouncementRequest(
  listener: () => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;

  function handle() {
    listener();
  }

  window.addEventListener(RELEASE_ANNOUNCEMENT_OPEN_EVENT, handle);
  return () =>
    window.removeEventListener(RELEASE_ANNOUNCEMENT_OPEN_EVENT, handle);
}
