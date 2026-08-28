/**
 * Shared Microsoft Graph access-token acquisition for session-bound calls.
 *
 * Mirrors the recovery ladder used by /api/outlook/events: try the cached
 * access token, refresh on failure, and surface "reconnect" as a null result
 * instead of an exception — Graph features are always best-effort extras on
 * top of the core product.
 */

import { auth } from "@/lib/auth";
import { getMicrosoftAccountSnapshot } from "@/lib/microsoft-graph";

interface AccessTokenResult {
  accessToken?: string;
  accessTokenExpiresAt?: Date | string;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

function isTokenRecoveryError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase();
  return (
    message.includes("account not found") ||
    message.includes("refresh token not found") ||
    message.includes("failed to refresh access token") ||
    message.includes("token refresh") ||
    message.includes("invalid_grant") ||
    message.includes("failed to get a valid access token")
  );
}

async function refreshToken(
  headers: Headers,
  accountId?: string,
): Promise<AccessTokenResult | null> {
  try {
    return (await auth.api.refreshToken({
      body: { providerId: "microsoft", accountId },
      headers,
    })) as AccessTokenResult;
  } catch (error) {
    if (isTokenRecoveryError(error)) return null;
    throw error;
  }
}

/**
 * Returns a valid delegated Graph access token for the session user, or null
 * when the Microsoft account is absent/needs reconnecting. Never throws for
 * recoverable auth states.
 */
export async function getMicrosoftAccessToken(
  headers: Headers,
  userId: string,
): Promise<string | null> {
  try {
    const snapshot = await getMicrosoftAccountSnapshot(userId);
    if (!snapshot) return null;

    try {
      const tokenResponse = (await auth.api.getAccessToken({
        body: { providerId: "microsoft", accountId: snapshot.accountId },
        headers,
      })) as AccessTokenResult;

      if (tokenResponse.accessToken) return tokenResponse.accessToken;

      const refreshed = await refreshToken(headers, snapshot.accountId);
      return refreshed?.accessToken ?? null;
    } catch (error) {
      if (isTokenRecoveryError(error)) {
        const refreshed = await refreshToken(headers, snapshot.accountId);
        return refreshed?.accessToken ?? null;
      }
      throw error;
    }
  } catch (error: unknown) {
    console.error(
      "[microsoft-token] acquisition failed:",
      getErrorMessage(error),
    );
    return null;
  }
}
