/**
 * Bot Framework authentication, in both directions.
 *
 * Inbound: every request Teams sends carries a JWT signed by the Bot Connector.
 * It is verified against the published signing keys, with the bot's App ID as
 * audience and the activity's `serviceUrl` pinned to the token claim — the
 * same checks the official SDKs run, without pulling the SDK into the bundle.
 *
 * Outbound: replies need an Entra client-credentials token for the
 * `api.botframework.com` resource, cached until shortly before it expires.
 */

import { createRemoteJWKSet, errors, jwtVerify } from "jose";
import type { BotActivity } from "@/lib/teams/bot/types";

const BOT_FRAMEWORK_ISSUER = "https://api.botframework.com";
const BOT_FRAMEWORK_JWKS_URL = new URL(
  "https://login.botframework.com/v1/.well-known/keys",
);
const BOT_FRAMEWORK_SCOPE = "https://api.botframework.com/.default";
/** Teams and the Bot Connector tolerate this much clock drift. */
const CLOCK_TOLERANCE_SECONDS = 300;
/** Renew the outbound token this long before it actually expires. */
const TOKEN_RENEWAL_MARGIN_MS = 5 * 60 * 1000;

// jose caches the key set and refetches on an unknown `kid` (key rotation).
const botFrameworkKeys = createRemoteJWKSet(BOT_FRAMEWORK_JWKS_URL, {
  cacheMaxAge: 24 * 60 * 60 * 1000,
});

export interface BotCredentials {
  appId: string;
  appPassword: string;
  tenantId: string;
}

export type InboundAuthResult =
  | { ok: true }
  | { ok: false; reason: "missing_token" | "invalid_token" | "service_url" };

/**
 * Local-only escape hatch for driving the endpoint from a script. It is
 * ignored in production builds no matter what the environment says.
 */
export function isDevAuthBypassEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    process.env.TEAMS_BOT_DEV_SKIP_AUTH === "true"
  );
}

export async function verifyInboundRequest(
  authorization: string | null,
  activity: Pick<BotActivity, "serviceUrl">,
  appId: string,
): Promise<InboundAuthResult> {
  if (isDevAuthBypassEnabled()) return { ok: true };

  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!token) return { ok: false, reason: "missing_token" };

  try {
    const { payload } = await jwtVerify(token, botFrameworkKeys, {
      issuer: BOT_FRAMEWORK_ISSUER,
      audience: appId,
      clockTolerance: CLOCK_TOLERANCE_SECONDS,
    });

    // The token is bound to the regional endpoint it was minted for; an
    // activity pointing anywhere else would turn replies into an SSRF.
    const claimedServiceUrl = payload.serviceurl ?? payload.serviceUrl;
    if (
      typeof claimedServiceUrl !== "string" ||
      normalizeServiceUrl(claimedServiceUrl) !==
        normalizeServiceUrl(activity.serviceUrl)
    ) {
      return { ok: false, reason: "service_url" };
    }

    return { ok: true };
  } catch (error: unknown) {
    if (!(error instanceof errors.JOSEError)) {
      console.error("[teams-bot] token verification failed:", error);
    }
    return { ok: false, reason: "invalid_token" };
  }
}

export function normalizeServiceUrl(url: string): string {
  return url.trim().replace(/\/+$/, "").toLowerCase();
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export class BotTokenError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "BotTokenError";
  }
}

/** Client-credentials token used to call the Bot Connector REST API. */
export async function getBotAccessToken(
  credentials: BotCredentials,
  options?: { forceRefresh?: boolean },
): Promise<string> {
  const cacheKey = `${credentials.tenantId}:${credentials.appId}`;
  const cached = tokenCache.get(cacheKey);

  if (
    !options?.forceRefresh &&
    cached &&
    cached.expiresAt - TOKEN_RENEWAL_MARGIN_MS > Date.now()
  ) {
    return cached.value;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${encodeURIComponent(credentials.tenantId)}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: credentials.appId,
        client_secret: credentials.appPassword,
        scope: BOT_FRAMEWORK_SCOPE,
      }),
      signal: AbortSignal.timeout(10_000),
    },
  );

  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    const detail = payload?.error_description?.split("\r\n")[0];
    throw new BotTokenError(
      detail ?? `Falha ao obter token do bot (HTTP ${response.status}).`,
      response.status,
    );
  }

  tokenCache.set(cacheKey, {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  });

  return payload.access_token;
}
