import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { account } from "@/lib/db/schema";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export class MicrosoftConnectionError extends Error {
  readonly code:
    | "account_not_found"
    | "graph_auth_failed"
    | "missing_refresh_token"
    | "token_refresh_failed";

  constructor(code: MicrosoftConnectionError["code"], message: string) {
    super(message);
    this.name = "MicrosoftConnectionError";
    this.code = code;
  }
}

export interface OutlookEvent {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  organizer?: { emailAddress?: { name?: string; address?: string } };
  isAllDay: boolean;
  isCancelled: boolean;
  categories: string[];
  webLink: string;
}

interface OutlookEventsResponse {
  value: OutlookEvent[];
}

export interface MicrosoftAccountSnapshot {
  accessTokenExpiresAt: Date | null;
  accountId: string;
  id: string;
  providerId: string;
  refreshTokenExpiresAt: Date | null;
  scope: string | null;
  userId: string;
  hasRefreshToken: boolean;
  updatedAt: Date;
}

export async function getMicrosoftAccountSnapshot(
  userId: string,
): Promise<MicrosoftAccountSnapshot | null> {
  const microsoftAccounts = await db
    .select({
      accessTokenExpiresAt: account.accessTokenExpiresAt,
      accountId: account.accountId,
      id: account.id,
      providerId: account.providerId,
      refreshToken: account.refreshToken,
      refreshTokenExpiresAt: account.refreshTokenExpiresAt,
      scope: account.scope,
      updatedAt: account.updatedAt,
      userId: account.userId,
    })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "microsoft")));

  if (microsoftAccounts.length === 0) {
    return null;
  }

  const msAccount = [...microsoftAccounts].sort((left, right) => {
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

    return right.updatedAt.getTime() - left.updatedAt.getTime();
  })[0];

  return {
    accessTokenExpiresAt: msAccount.accessTokenExpiresAt,
    accountId: msAccount.accountId,
    id: msAccount.id,
    providerId: msAccount.providerId,
    refreshTokenExpiresAt: msAccount.refreshTokenExpiresAt,
    scope: msAccount.scope,
    updatedAt: msAccount.updatedAt,
    userId: msAccount.userId,
    hasRefreshToken: Boolean(msAccount.refreshToken),
  };
}

export function isMicrosoftAccessTokenExpiring(
  accessTokenExpiresAt: Date | null | undefined,
) {
  if (!accessTokenExpiresAt) return true;
  return accessTokenExpiresAt.getTime() - Date.now() <= TOKEN_REFRESH_BUFFER_MS;
}

export function needsMicrosoftReconnect(
  snapshot: MicrosoftAccountSnapshot | null,
) {
  if (!snapshot) return false;

  if (
    !snapshot.hasRefreshToken &&
    isMicrosoftAccessTokenExpiring(snapshot.accessTokenExpiresAt)
  ) {
    return true;
  }

  if (
    snapshot.refreshTokenExpiresAt &&
    snapshot.refreshTokenExpiresAt.getTime() <= Date.now()
  ) {
    return true;
  }

  return false;
}

export async function fetchOutlookEvents(
  accessToken: string,
  startDateTime: string,
  endDateTime: string,
): Promise<OutlookEvent[]> {
  const url = new URL(`${GRAPH_BASE}/me/calendarView`);
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);
  url.searchParams.set(
    "$select",
    "id,subject,start,end,organizer,isAllDay,isCancelled,categories,webLink",
  );
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", "50");

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new MicrosoftConnectionError(
        "graph_auth_failed",
        "Microsoft Graph rejected the access token",
      );
    }

    throw new Error(`Microsoft Graph API error: ${response.status}`);
  }

  const data = (await response.json()) as OutlookEventsResponse;
  return data.value.filter((event) => !event.isCancelled && !event.isAllDay);
}
