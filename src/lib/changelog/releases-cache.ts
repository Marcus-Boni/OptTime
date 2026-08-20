"use client";

/**
 * Tiny client-side cache for the published changelog feed.
 *
 * The header badge and the announcement modal both need the latest published
 * release. Without this module they would each hit `/api/releases` on every
 * dashboard mount; here concurrent callers share a single request and the
 * result is reused for a short window.
 */

export interface PublishedRelease {
  id: string;
  versionTag: string;
  title: string;
  description: string;
  videoUrl: string | null;
  publishedAt: string | null;
  author: { id: string; name: string; image: string | null };
}

interface RawRelease extends Omit<PublishedRelease, "videoUrl"> {
  status: string;
  videoUrl?: string | null;
}

const CACHE_TTL_MS = 60_000;

let cached: PublishedRelease[] | null = null;
let cachedAt = 0;
let inFlight: Promise<PublishedRelease[]> | null = null;

function toPublishedRelease(raw: RawRelease): PublishedRelease {
  return {
    id: raw.id,
    versionTag: raw.versionTag,
    title: raw.title,
    description: raw.description,
    videoUrl: raw.videoUrl ?? null,
    publishedAt: raw.publishedAt,
    author: raw.author,
  };
}

/** Sorts newest first, tolerating releases without a publish timestamp. */
function byRecency(a: PublishedRelease, b: PublishedRelease): number {
  const left = a.publishedAt ? Date.parse(a.publishedAt) : 0;
  const right = b.publishedAt ? Date.parse(b.publishedAt) : 0;
  return right - left;
}

/**
 * Returns published releases, newest first.
 * Throws when the request fails so callers can decide how to degrade.
 */
export async function fetchPublishedReleases(
  options: { force?: boolean } = {},
): Promise<PublishedRelease[]> {
  if (!options.force) {
    if (cached && Date.now() - cachedAt < CACHE_TTL_MS) return cached;
    if (inFlight) return inFlight;
  }

  inFlight = (async (): Promise<PublishedRelease[]> => {
    const res = await fetch("/api/releases", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`Falha ao carregar o changelog (HTTP ${res.status})`);
    }

    const payload = (await res.json()) as { releases?: RawRelease[] };
    const published = (payload.releases ?? [])
      .filter((release) => release.status === "published")
      .map(toPublishedRelease)
      .sort(byRecency);

    cached = published;
    cachedAt = Date.now();
    return published;
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Drops the cache so the next read hits the API (after publish/edit). */
export function invalidatePublishedReleasesCache(): void {
  cached = null;
  cachedAt = 0;
}
