/**
 * Microsoft Graph tokens for background jobs.
 *
 * The session-bound path (`lib/microsoft-token`) needs request headers holding
 * the Better Auth cookie. A cron has no request and no session, so the evening
 * digest resolves tokens straight from the stored account row instead.
 *
 * Microsoft rotates refresh tokens on every use, so a refreshed pair is written
 * back immediately — dropping it would break the *next* run, silently.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { refreshMicrosoftAccessToken } from "@/lib/microsoft-oauth";

/** Refresh this early so a token cannot expire mid-request. */
const EXPIRY_SKEW_MS = 5 * 60_000;

/**
 * Returns a valid delegated Graph token for `userId`, or null when the person
 * never connected Microsoft or needs to sign in again.
 *
 * Never throws: a background job must survive one broken account.
 */
export async function getBackgroundMicrosoftToken(
  userId: string,
): Promise<string | null> {
  try {
    const row = await db.query.account.findFirst({
      where: and(
        eq(account.userId, userId),
        eq(account.providerId, "microsoft"),
      ),
      columns: {
        id: true,
        accessToken: true,
        accessTokenExpiresAt: true,
        refreshToken: true,
      },
    });

    if (!row) return null;

    const stillValid =
      row.accessToken &&
      row.accessTokenExpiresAt &&
      row.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > Date.now();

    if (stillValid && row.accessToken) return row.accessToken;
    if (!row.refreshToken) return null;

    const refreshed = await refreshMicrosoftAccessToken(row.refreshToken);

    await db
      .update(account)
      .set({
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt ?? null,
        // Microsoft rotates the refresh token; keep the old one if it did not.
        refreshToken: refreshed.refreshToken ?? row.refreshToken,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt ?? null,
        scope: refreshed.scopes?.join(" ") ?? undefined,
        updatedAt: new Date(),
      })
      .where(eq(account.id, row.id));

    return refreshed.accessToken;
  } catch (error: unknown) {
    console.error("[collaboration] background token failed:", {
      userId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}
