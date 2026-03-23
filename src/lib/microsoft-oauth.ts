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

  const payload =
    ((await response.json()) as MicrosoftRefreshTokenResponse | null) ?? {};

  if (!response.ok || !payload.access_token) {
    const suffix = payload.error ? ` (${payload.error})` : "";
    throw new Error(`Failed to refresh Microsoft access token${suffix}`);
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
