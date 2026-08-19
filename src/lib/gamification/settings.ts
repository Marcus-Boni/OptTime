import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { systemSetting } from "@/lib/db/schema";
import { RANKING_SETTING_KEY } from "./constants";

/**
 * Whether the XP ranking is switched on org-wide.
 *
 * Off by default: a visible ranking is the one part of this feature that can
 * turn into unhealthy comparison, so an admin has to opt the org into it.
 */
export async function isRankingEnabled(): Promise<boolean> {
  try {
    const row = await db.query.systemSetting.findFirst({
      where: eq(systemSetting.key, RANKING_SETTING_KEY),
      columns: { value: true },
    });
    return row?.value === "true";
  } catch (error: unknown) {
    console.error("[gamification/settings] isRankingEnabled:", error);
    return false;
  }
}

export async function setRankingEnabled(
  enabled: boolean,
  updatedById: string,
): Promise<void> {
  await db
    .insert(systemSetting)
    .values({
      key: RANKING_SETTING_KEY,
      value: enabled ? "true" : "false",
      updatedById,
    })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: {
        value: enabled ? "true" : "false",
        updatedById,
        updatedAt: new Date(),
      },
    });
}
