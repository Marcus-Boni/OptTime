/**
 * Microsoft Graph tokens for background jobs.
 *
 * The session-bound path (`lib/microsoft-token`) needs request headers holding
 * the Better Auth cookie. A cron has no request and no session, so the evening
 * digest, the meeting nudges and the agent API resolve tokens straight from the
 * stored account rows instead.
 *
 * Microsoft rotates refresh tokens on every use, so a refreshed pair is written
 * back immediately — dropping it would break the *next* run, silently.
 *
 * A user can own several Microsoft rows (see `microsoft-account-selection`).
 * Reading "the first one" returned whichever row Postgres listed first — in
 * practice a dead one from an earlier app registration — and every background
 * feature failed for that person while the rest of the app, which picks by rule,
 * looked healthy. The rows are ranked by the shared rule and tried in order.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { rankMicrosoftAccounts } from "@/lib/microsoft-account-selection";
import {
  MicrosoftRefreshError,
  refreshMicrosoftAccessToken,
} from "@/lib/microsoft-oauth";

/** Refresh this early so a token cannot expire mid-request. */
const EXPIRY_SKEW_MS = 5 * 60_000;

export interface BackgroundAccountRow {
  id: string;
  accessToken: string | null;
  accessTokenExpiresAt: Date | null;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
  updatedAt: Date;
}

export interface RefreshedMicrosoftToken {
  accessToken: string;
  accessTokenExpiresAt?: Date;
  refreshToken?: string;
  refreshTokenExpiresAt?: Date;
  scopes?: string[];
}

/** Collaborators the lookup needs, injectable so the rule runs offline. */
export interface BackgroundTokenDeps {
  loadAccounts: (userId: string) => Promise<BackgroundAccountRow[]>;
  refresh: (refreshToken: string) => Promise<RefreshedMicrosoftToken>;
  /** Persists a refreshed pair into exactly the row it was refreshed from. */
  saveRefreshed: (
    row: BackgroundAccountRow,
    refreshed: RefreshedMicrosoftToken,
  ) => Promise<void>;
  now: () => number;
}

const defaultDeps: BackgroundTokenDeps = {
  loadAccounts: (userId) =>
    db.query.account.findMany({
      where: (table, { and, eq: equals }) =>
        and(
          equals(table.userId, userId),
          equals(table.providerId, "microsoft"),
        ),
      columns: {
        id: true,
        accessToken: true,
        accessTokenExpiresAt: true,
        refreshToken: true,
        refreshTokenExpiresAt: true,
        updatedAt: true,
      },
    }),
  refresh: refreshMicrosoftAccessToken,
  saveRefreshed: async (row, refreshed) => {
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
  },
  now: () => Date.now(),
};

/** Why a row could not give a token — a code, never a message or a token. */
function describeFailure(error: unknown): string {
  if (error instanceof MicrosoftRefreshError) {
    return error.aadstsCode ?? error.oauthError ?? `http_${error.status}`;
  }
  return error instanceof Error ? error.name : "unknown_error";
}

/**
 * Returns a valid delegated Graph token for `userId`, or null when the person
 * never connected Microsoft or none of their rows can produce one.
 *
 * Rows are tried best first by the shared rule; a row whose refresh is refused
 * does not end the search, because the "best" row by the ranking may be the dead
 * one. Whatever row succeeds is the one rewritten.
 *
 * Never throws: a background job must survive one broken account.
 */
export async function getBackgroundMicrosoftToken(
  userId: string,
  deps: BackgroundTokenDeps = defaultDeps,
): Promise<string | null> {
  try {
    const rows = rankMicrosoftAccounts(await deps.loadAccounts(userId));
    if (rows.length === 0) return null;

    const failures: Array<{ accountId: string; reason: string }> = [];

    for (const row of rows) {
      const stillValid =
        row.accessToken &&
        row.accessTokenExpiresAt &&
        row.accessTokenExpiresAt.getTime() - EXPIRY_SKEW_MS > deps.now();

      if (stillValid && row.accessToken) return row.accessToken;

      if (!row.refreshToken) {
        failures.push({ accountId: row.id, reason: "no_refresh_token" });
        continue;
      }

      try {
        const refreshed = await deps.refresh(row.refreshToken);
        await deps.saveRefreshed(row, refreshed);
        return refreshed.accessToken;
      } catch (error: unknown) {
        failures.push({ accountId: row.id, reason: describeFailure(error) });
      }
    }

    // Row ids and reason codes only: no e-mail, no token, no Entra trace.
    console.error("[collaboration] background token failed:", {
      userId,
      accounts: failures,
    });
    return null;
  } catch (error: unknown) {
    console.error("[collaboration] background token failed:", {
      userId,
      reason: describeFailure(error),
    });
    return null;
  }
}
