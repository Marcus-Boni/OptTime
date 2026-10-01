export interface PublicRelease {
  versionTag: string;
  title: string;
  videoUrl: string | null;
}

interface PublicReleaseSource extends PublicRelease {
  status: string;
}

/** Only the published showcase metadata may cross the public page boundary. */
export function toPublicRelease(
  source: PublicReleaseSource | null,
): PublicRelease | null {
  if (!source || source.status !== "published") return null;
  return {
    versionTag: source.versionTag.startsWith("v")
      ? source.versionTag
      : `v${source.versionTag}`,
    title: source.title,
    videoUrl: source.videoUrl?.trim() || null,
  };
}

/** A video URL must never be mistaken for a composition because it contains a version. */
export function findRemotionComposition<
  T extends { id: string; aliases: readonly string[] },
>(input: string, compositions: readonly T[]): T | undefined {
  const value = input.trim();
  return (
    compositions.find(
      (entry) => value === `remotion:${entry.id}` || value === entry.id,
    ) ??
    compositions.find((entry) => entry.aliases.includes(value.toLowerCase()))
  );
}
