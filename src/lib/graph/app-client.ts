/**
 * App-only Microsoft Graph client (client-credentials), for work that has no
 * signed-in user: subscriptions to meeting call events.
 *
 * Uses the same Entra app registration as the Microsoft login
 * (MICROSOFT_CLIENT_ID), which already carries the CallRecords.Read.All
 * application permission; meeting call events need OnlineMeetings.Read.All
 * granted on it as well.
 */

const GRAPH_ORIGIN = "https://graph.microsoft.com";
const TOKEN_RENEWAL_MARGIN_MS = 5 * 60_000;
const REQUEST_TIMEOUT_MS = 15_000;

export interface GraphAppConfig {
  tenantId: string;
  clientId: string;
  clientSecret: string;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function readGraphAppConfig(): GraphAppConfig | null {
  const tenantId =
    process.env.MICROSOFT_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID;
  const clientId =
    process.env.MICROSOFT_CLIENT_ID ?? process.env.AZURE_AD_CLIENT_ID;
  const clientSecret =
    process.env.MICROSOFT_CLIENT_SECRET ?? process.env.AZURE_AD_CLIENT_SECRET;

  if (
    !tenantId ||
    !UUID_PATTERN.test(tenantId) ||
    !clientId ||
    !UUID_PATTERN.test(clientId) ||
    !clientSecret
  ) {
    return null;
  }
  return { tenantId, clientId, clientSecret };
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export class GraphAppError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly code: string | null = null,
  ) {
    super(message);
    this.name = "GraphAppError";
  }
}

async function getAppToken(
  config: GraphAppConfig,
  forceRefresh = false,
): Promise<string> {
  if (
    !forceRefresh &&
    cachedToken &&
    cachedToken.expiresAt - TOKEN_RENEWAL_MARGIN_MS > Date.now()
  ) {
    return cachedToken.value;
  }

  const response = await fetch(
    `https://login.microsoftonline.com/${config.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        grant_type: "client_credentials",
        scope: `${GRAPH_ORIGIN}/.default`,
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    access_token?: string;
    expires_in?: number;
    error_description?: string;
  } | null;

  if (!response.ok || !payload?.access_token) {
    throw new GraphAppError(
      payload?.error_description?.split("\r\n")[0] ??
        `Token de aplicação recusado (HTTP ${response.status}).`,
      response.status,
    );
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000,
  };
  return payload.access_token;
}

/**
 * Application permissions actually granted to the app, read from a fresh
 * token's `roles` claim — the source of truth right after an admin consent,
 * without waiting for a meeting to find out.
 */
export async function getGrantedAppRoles(): Promise<string[]> {
  const config = readGraphAppConfig();
  if (!config) {
    throw new GraphAppError("Credenciais Microsoft do app ausentes.", null);
  }
  const token = await getAppToken(config, true);
  const payloadPart = token.split(".")[1] ?? "";
  try {
    const claims = JSON.parse(
      Buffer.from(payloadPart, "base64url").toString("utf8"),
    ) as { roles?: unknown };
    return Array.isArray(claims.roles)
      ? claims.roles.filter((role): role is string => typeof role === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * Calls Graph as the app. `path` is relative to the version root, e.g.
 * `/subscriptions`. Throws GraphAppError with the Graph error code.
 */
export async function graphAppRequest<T>(
  method: "GET" | "POST" | "PATCH" | "DELETE",
  version: "v1.0" | "beta",
  path: string,
  body?: unknown,
): Promise<T | null> {
  const config = readGraphAppConfig();
  if (!config) {
    throw new GraphAppError("Credenciais Microsoft do app ausentes.", null);
  }

  const token = await getAppToken(config);
  const response = await fetch(`${GRAPH_ORIGIN}/${version}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 204) return null;
  const payload = (await response.json().catch(() => null)) as
    | (T & { error?: { code?: string; message?: string } })
    | null;

  if (!response.ok) {
    throw new GraphAppError(
      payload?.error?.message ?? `Graph HTTP ${response.status}`,
      response.status,
      payload?.error?.code ?? null,
    );
  }
  return payload;
}
