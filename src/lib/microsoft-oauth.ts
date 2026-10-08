const MICROSOFT_TOKEN_ENDPOINT =
  "https://login.microsoftonline.com/common/oauth2/v2.0/token";

type MicrosoftRefreshTokenResponse = {
  access_token?: string;
  expires_in?: number;
  ext_expires_in?: number;
  id_token?: string;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

/**
 * Microsoft refused a refresh, with the reason Entra gave.
 *
 * Carries the OAuth error and the AADSTS code and nothing else on purpose: the
 * rest of `error_description` is a trace id, a correlation id and a timestamp,
 * and the messages end up in logs.
 */
export class MicrosoftRefreshError extends Error {
  /** `invalid_grant`, `invalid_client`… */
  readonly oauthError: string | null;
  /** `AADSTS70000`… the stable, searchable part of Entra's description. */
  readonly aadstsCode: string | null;
  readonly status: number;

  constructor(input: {
    oauthError: string | null;
    aadstsCode: string | null;
    status: number;
  }) {
    const reason = [input.oauthError, input.aadstsCode]
      .filter((part): part is string => Boolean(part))
      .join(", ");

    super(
      `Failed to refresh Microsoft access token${reason ? ` (${reason})` : ""}`,
    );
    this.name = "MicrosoftRefreshError";
    this.oauthError = input.oauthError;
    this.aadstsCode = input.aadstsCode;
    this.status = input.status;
  }
}

/**
 * The AADSTS code in the first line of Entra's `error_description`.
 *
 * Only the first line is read: the following ones are the trace, correlation
 * id and timestamp.
 */
export function parseAadstsCode(
  description: string | null | undefined,
): string | null {
  const firstLine = description?.split(/\r?\n/, 1)[0];
  return firstLine?.match(/\bAADSTS\d{3,7}\b/)?.[0] ?? null;
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("Microsoft OAuth credentials are not configured");
  }

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(MICROSOFT_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  // A gateway error can come back as HTML; that is still a refusal, not a crash.
  const payload =
    ((await response
      .json()
      .catch(() => null)) as MicrosoftRefreshTokenResponse | null) ?? {};

  if (!response.ok || !payload.access_token) {
    throw new MicrosoftRefreshError({
      oauthError: payload.error ?? null,
      aadstsCode: parseAadstsCode(payload.error_description),
      status: response.status,
    });
  }

  const now = Date.now();

  return {
    accessToken: payload.access_token,
    accessTokenExpiresAt:
      typeof payload.expires_in === "number"
        ? new Date(now + payload.expires_in * 1000)
        : undefined,
    idToken: payload.id_token,
    refreshToken: payload.refresh_token,
    refreshTokenExpiresAt:
      typeof payload.refresh_token_expires_in === "number"
        ? new Date(now + payload.refresh_token_expires_in * 1000)
        : undefined,
    scopes: payload.scope?.split(" ").filter(Boolean),
    tokenType: payload.token_type,
  };
}
