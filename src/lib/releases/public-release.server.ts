import { desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appRelease } from "@/lib/db/schema";
import {
  type PublicRelease,
  toPublicRelease,
} from "@/lib/releases/public-release";

export async function getLatestPublicRelease(): Promise<PublicRelease | null> {
  try {
    const [release] = await db
      .select({
        status: appRelease.status,
        versionTag: appRelease.versionTag,
        title: appRelease.title,
        videoUrl: appRelease.videoUrl,
      })
      .from(appRelease)
      .where(eq(appRelease.status, "published"))
      .orderBy(
        desc(appRelease.publishedAt),
        desc(appRelease.createdAt),
        desc(appRelease.id),
      )
      .limit(1);
    return toPublicRelease(release ?? null);
  } catch {
    console.error(
      "[getLatestPublicRelease] Não foi possível carregar a release pública.",
    );
    return null;
  }
}
