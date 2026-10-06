/**
 * Minimal Bot Connector REST client (v3).
 *
 * Only the handful of calls the Teams app needs: reply, send, update a card
 * in place, read a member's profile and open a 1:1 conversation. Every call
 * targets a `serviceUrl` that either came from a verified inbound token or
 * was stored from one, and is still checked against Microsoft's hosts.
 */

import {
  type BotCredentials,
  getBotAccessToken,
  isDevAuthBypassEnabled,
} from "@/lib/teams/bot/auth";
import type { OutgoingActivity, TeamsMember } from "@/lib/teams/bot/types";

const REQUEST_TIMEOUT_MS = 10_000;
/** Longest Retry-After honoured inline before giving up on a 429. */
const MAX_INLINE_RETRY_MS = 3_000;

const TRUSTED_HOST_SUFFIXES = [
  ".botframework.com",
  ".trafficmanager.net",
  ".teams.microsoft.com",
  ".botframework.azure.us",
];

export class ConnectorError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
  ) {
    super(message);
    this.name = "ConnectorError";
  }
}

export function isTrustedServiceUrl(serviceUrl: string): boolean {
  try {
    const url = new URL(serviceUrl);
    if (isDevAuthBypassEnabled() && url.hostname === "localhost") return true;
    if (url.protocol !== "https:") return false;
    return TRUSTED_HOST_SUFFIXES.some((suffix) =>
      `.${url.hostname}`.endsWith(suffix),
    );
  } catch {
    return false;
  }
}

function buildUrl(serviceUrl: string, path: string): string {
  if (!isTrustedServiceUrl(serviceUrl)) {
    throw new ConnectorError(`serviceUrl não confiável: ${serviceUrl}`, null);
  }
  return `${serviceUrl.replace(/\/+$/, "")}${path}`;
}

async function connectorRequest<T>(
  credentials: BotCredentials,
  serviceUrl: string,
  path: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown },
  attempt = 0,
): Promise<T> {
  const url = buildUrl(serviceUrl, path);
  const token = isDevAuthBypassEnabled()
    ? "dev"
    : await getBotAccessToken(credentials, { forceRefresh: attempt > 0 });

  const response = await fetch(url, {
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401 && attempt === 0) {
    // A cached token revoked server-side: renew once, then give up.
    return connectorRequest(credentials, serviceUrl, path, init, attempt + 1);
  }

  if (response.status === 429 && attempt < 2) {
    const retryAfterMs =
      Number(response.headers.get("retry-after") ?? "1") * 1000;
    if (retryAfterMs <= MAX_INLINE_RETRY_MS) {
      await new Promise((resolve) => setTimeout(resolve, retryAfterMs));
      return connectorRequest(credentials, serviceUrl, path, init, attempt + 1);
    }
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new ConnectorError(
      `Bot Connector ${init.method} ${path} → HTTP ${response.status} ${detail.slice(0, 200)}`,
      response.status,
    );
  }

  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

const conversationPath = (conversationId: string): string =>
  `/v3/conversations/${encodeURIComponent(conversationId)}`;

export async function sendToConversation(
  credentials: BotCredentials,
  serviceUrl: string,
  conversationId: string,
  activity: OutgoingActivity,
): Promise<{ id?: string }> {
  return connectorRequest(
    credentials,
    serviceUrl,
    `${conversationPath(conversationId)}/activities`,
    { method: "POST", body: activity },
  );
}

/** Threads the answer under the original message in channels. */
export async function replyToActivity(
  credentials: BotCredentials,
  serviceUrl: string,
  conversationId: string,
  activityId: string,
  activity: OutgoingActivity,
): Promise<{ id?: string }> {
  return connectorRequest(
    credentials,
    serviceUrl,
    `${conversationPath(conversationId)}/activities/${encodeURIComponent(activityId)}`,
    { method: "POST", body: { ...activity, replyToId: activityId } },
  );
}

export async function updateActivity(
  credentials: BotCredentials,
  serviceUrl: string,
  conversationId: string,
  activityId: string,
  activity: OutgoingActivity,
): Promise<void> {
  await connectorRequest(
    credentials,
    serviceUrl,
    `${conversationPath(conversationId)}/activities/${encodeURIComponent(activityId)}`,
    { method: "PUT", body: { ...activity, id: activityId } },
  );
}

/** Profile of one member — the only place Teams exposes the e-mail/UPN. */
export async function getConversationMember(
  credentials: BotCredentials,
  serviceUrl: string,
  conversationId: string,
  memberId: string,
): Promise<TeamsMember> {
  return connectorRequest(
    credentials,
    serviceUrl,
    `${conversationPath(conversationId)}/members/${encodeURIComponent(memberId)}`,
    { method: "GET" },
  );
}

/**
 * Opens (or reopens) the 1:1 chat between the bot and a user. Succeeds only
 * when the app is installed for that user — Teams refuses otherwise.
 */
export async function createPersonalConversation(
  credentials: BotCredentials,
  serviceUrl: string,
  input: { botUserId: string; tenantId: string },
): Promise<{ id: string }> {
  return connectorRequest(credentials, serviceUrl, "/v3/conversations", {
    method: "POST",
    body: {
      isGroup: false,
      bot: { id: `28:${credentials.appId}` },
      members: [{ id: input.botUserId }],
      tenantId: input.tenantId,
      channelData: { tenant: { id: input.tenantId } },
    },
  });
}
