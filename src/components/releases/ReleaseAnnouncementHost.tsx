"use client";

import dynamic from "next/dynamic";
import { useReleaseAnnouncement } from "@/hooks/use-release-announcement";

/**
 * Mounted for every dashboard page, so it must stay out of the shell bundle
 * until there is actually a release worth announcing.
 */
const ReleaseAnnouncementModal = dynamic(
  () =>
    import("./ReleaseAnnouncementModal").then((mod) => ({
      default: mod.ReleaseAnnouncementModal,
    })),
  { ssr: false },
);

/**
 * Owns the "what's new" announcement: decides whether the current user still
 * has an unseen published release and renders the modal for it.
 */
export function ReleaseAnnouncementHost() {
  const { release, missedCount, isOpen, shouldRender, dismiss } =
    useReleaseAnnouncement();

  if (!release || !shouldRender) return null;

  return (
    <ReleaseAnnouncementModal
      release={release}
      missedCount={missedCount}
      open={isOpen}
      onDismiss={dismiss}
    />
  );
}
