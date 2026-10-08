/**
 * Which Microsoft `account` row a user is really connected through.
 *
 * A person can end up with more than one row for `provider_id = 'microsoft'`:
 * Better Auth keys the row on `account_id`, which Microsoft derives per app
 * registration, so moving the app to another registration leaves the old row
 * behind with a refresh token Microsoft no longer honours. Every reader has to
 * pick the same row, or one part of the app says "connected" while another
 * silently fails with the dead one. This module is that single rule — pure, so
 * both the session path, the background path and the cleanup script share it
 * and it can be verified without a database.
 */

/** What the ranking looks at; every Microsoft row carries these. */
export interface MicrosoftAccountRanking {
  /** Row id, the last tie-break so the choice never depends on the DB's order. */
  id?: string;
  refreshToken: string | null;
  refreshTokenExpiresAt: Date | null;
  accessTokenExpiresAt: Date | null;
  updatedAt: Date;
}

/**
 * Orders two rows, best first (negative = `left` is better).
 *
 * In order of importance: has a refresh token at all; the later refresh-token
 * expiry; the later access-token expiry; the more recently updated row.
 */
export function compareMicrosoftAccounts(
  left: MicrosoftAccountRanking,
  right: MicrosoftAccountRanking,
): number {
  const leftHasRefreshToken = Boolean(left.refreshToken);
  const rightHasRefreshToken = Boolean(right.refreshToken);
  if (leftHasRefreshToken !== rightHasRefreshToken) {
    return leftHasRefreshToken ? -1 : 1;
  }

  const leftRefreshExpiry = left.refreshTokenExpiresAt?.getTime() ?? 0;
  const rightRefreshExpiry = right.refreshTokenExpiresAt?.getTime() ?? 0;
  if (leftRefreshExpiry !== rightRefreshExpiry) {
    return rightRefreshExpiry - leftRefreshExpiry;
  }

  const leftAccessExpiry = left.accessTokenExpiresAt?.getTime() ?? 0;
  const rightAccessExpiry = right.accessTokenExpiresAt?.getTime() ?? 0;
  if (leftAccessExpiry !== rightAccessExpiry) {
    return rightAccessExpiry - leftAccessExpiry;
  }

  if (left.updatedAt.getTime() !== right.updatedAt.getTime()) {
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  }

  return (left.id ?? "").localeCompare(right.id ?? "");
}

/** Every row, best first. Does not touch the input. */
export function rankMicrosoftAccounts<T extends MicrosoftAccountRanking>(
  rows: readonly T[],
): T[] {
  return [...rows].sort(compareMicrosoftAccounts);
}

/** The row to use, or null when the user has no Microsoft row at all. */
export function pickMicrosoftAccount<T extends MicrosoftAccountRanking>(
  rows: readonly T[],
): T | null {
  return rankMicrosoftAccounts(rows)[0] ?? null;
}

// ─── Cleanup of dead duplicates ───────────────────────────────────────────

/** A row that has not been refreshed for this long is considered abandoned. */
export const STALE_ACCOUNT_DAYS = 90;

const DAY_MS = 86_400_000;

export interface MicrosoftAccountRow extends MicrosoftAccountRanking {
  id: string;
  userId: string;
  accountId: string;
}

export type CleanupDecision =
  /** The row the rule picks. Never a removal candidate. */
  | "keep-selected"
  /** Not the picked row, but refreshed recently enough to be left alone. */
  | "keep-recent"
  /** Not the picked row and not refreshed for over `staleDays`. */
  | "remove-candidate";

export interface CleanupPlanRow<T extends MicrosoftAccountRow> {
  row: T;
  decision: CleanupDecision;
  /** Whole days since the row was last updated. */
  ageDays: number;
}

export interface CleanupPlan<T extends MicrosoftAccountRow> {
  userId: string;
  /** Best first, so the kept row leads. */
  rows: CleanupPlanRow<T>[];
}

/**
 * What a cleanup would remove, per user that has more than one Microsoft row.
 *
 * A row is a candidate only when it is not the one the shared rule picks **and**
 * has not been updated for more than `staleDays`. Users with a single row are
 * not listed. This only *plans*: nothing here, or in the script that prints the
 * plan, deletes anything.
 */
export function planDuplicateCleanup<T extends MicrosoftAccountRow>(
  rows: readonly T[],
  now: Date,
  staleDays: number = STALE_ACCOUNT_DAYS,
): CleanupPlan<T>[] {
  const byUser = new Map<string, T[]>();
  for (const row of rows) {
    const bucket = byUser.get(row.userId) ?? [];
    bucket.push(row);
    byUser.set(row.userId, bucket);
  }

  const plans: CleanupPlan<T>[] = [];

  for (const [userId, userRows] of byUser) {
    if (userRows.length < 2) continue;

    const ranked = rankMicrosoftAccounts(userRows);

    plans.push({
      userId,
      rows: ranked.map((row, index): CleanupPlanRow<T> => {
        const ageDays = Math.floor(
          (now.getTime() - row.updatedAt.getTime()) / DAY_MS,
        );

        return {
          row,
          ageDays,
          decision:
            index === 0
              ? "keep-selected"
              : ageDays > staleDays
                ? "remove-candidate"
                : "keep-recent",
        };
      }),
    });
  }

  return plans.sort((a, b) => a.userId.localeCompare(b.userId));
}
