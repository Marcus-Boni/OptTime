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

export interface OutlookAttendee {
  type?: string;
  status?: { response?: string; time?: string };
  emailAddress?: { name?: string; address?: string };
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
  /** Whether the signed-in user owns the invitation. */
  isOrganizer?: boolean;
  /** The signed-in user's own response to the invitation. */
  responseStatus?: { response?: string; time?: string };
  /** "free" | "tentative" | "busy" | "oof" | "workingElsewhere" | "unknown" */
  showAs?: string;
  /** "normal" | "personal" | "private" | "confidential" */
  sensitivity?: string;
  /** "singleInstance" | "occurrence" | "exception" | "seriesMaster" */
  type?: string;
  /** Present on every occurrence of a recurring series. */
  seriesMasterId?: string | null;
  /**
   * Where a moved occurrence was originally scheduled.
   *
   * Graph only fills this on `exception` rows, which is precisely the
   * "reunião remarcada" case Meu Tempo counts.
   */
  originalStart?: string | null;
  isOnlineMeeting?: boolean;
  onlineMeeting?: { joinUrl?: string | null } | null;
  onlineMeetingProvider?: string | null;
  attendees?: OutlookAttendee[];
}

interface OutlookEventsResponse {
  value: OutlookEvent[];
  "@odata.nextLink"?: string;
}

export interface FetchOutlookEventsOptions {
  /**
   * Keep cancelled and all-day rows in the result. Registro por Colaboração
   * needs them to explain *why* an event did not become a signal; every other
   * caller wants them gone.
   */
  includeExcluded?: boolean;
  /**
   * Pages of 100 events to walk. The default covers a week comfortably; Meu
   * Tempo raises it because it reads a whole month in one request.
   */
  maxPages?: number;
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
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "microsoft")),
    );

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

/**
 * The signed-in user's Entra object id (`oid`).
 *
 * This is the tenant-stable identifier Teams sends as `from.aadObjectId` on
 * outgoing-webhook payloads — not the same value Better Auth stores in
 * `account.accountId`, which is the pairwise `sub` claim and differs per
 * application. Linking Teams commands to an app user requires this one.
 */
export async function fetchMicrosoftObjectId(
  accessToken: string,
): Promise<string | null> {
  try {
    const response = await fetch(`${GRAPH_BASE}/me?$select=id`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) return null;

    const data = (await response.json()) as { id?: string };
    return data.id ?? null;
  } catch (error: unknown) {
    console.error("[microsoft-graph] fetchMicrosoftObjectId:", error);
    return null;
  }
}

const CALENDAR_SELECT = [
  "id",
  "subject",
  "start",
  "end",
  "organizer",
  "isAllDay",
  "isCancelled",
  "categories",
  "webLink",
  // Fields below drive Registro por Colaboração: who was in the room, whether
  // the person actually accepted, and whether the occurrence was moved.
  "isOrganizer",
  "responseStatus",
  "showAs",
  "sensitivity",
  "type",
  "seriesMasterId",
  "originalStart",
  "isOnlineMeeting",
  "onlineMeeting",
  "onlineMeetingProvider",
  "attendees",
].join(",");

const CALENDAR_PAGE_SIZE = 100;
/** A packed week for a lead still fits well inside three pages. */
const CALENDAR_MAX_PAGES = 3;

export async function fetchOutlookEvents(
  accessToken: string,
  startDateTime: string,
  endDateTime: string,
  options: FetchOutlookEventsOptions = {},
): Promise<OutlookEvent[]> {
  const url = new URL(`${GRAPH_BASE}/me/calendarView`);
  url.searchParams.set("startDateTime", startDateTime);
  url.searchParams.set("endDateTime", endDateTime);
  url.searchParams.set("$select", CALENDAR_SELECT);
  url.searchParams.set("$orderby", "start/dateTime");
  url.searchParams.set("$top", String(CALENDAR_PAGE_SIZE));

  const events: OutlookEvent[] = [];
  let nextUrl: string | null = url.toString();
  let page = 0;

  const maxPages = Math.max(1, options.maxPages ?? CALENDAR_MAX_PAGES);

  while (nextUrl && page < maxPages) {
    const response: Response = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        // Attendee display names come back in the user's locale.
        Prefer: 'outlook.timezone="UTC"',
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
    events.push(...data.value);
    nextUrl = data["@odata.nextLink"] ?? null;
    page += 1;
  }

  if (options.includeExcluded) return events;
  return events.filter((event) => !event.isCancelled && !event.isAllDay);
}

export interface MicrosoftUserProfile {
  id: string;
  displayName: string | null;
  givenName: string | null;
  surname: string | null;
  mail: string | null;
  userPrincipalName: string | null;
  jobTitle: string | null;
  department: string | null;
  officeLocation: string | null;
  mobilePhone: string | null;
  businessPhones: string[];
}

interface GraphUserRaw {
  id?: string;
  displayName?: string | null;
  givenName?: string | null;
  surname?: string | null;
  mail?: string | null;
  userPrincipalName?: string | null;
  jobTitle?: string | null;
  department?: string | null;
  officeLocation?: string | null;
  mobilePhone?: string | null;
  businessPhones?: string[] | null;
}

interface GraphUsersListResponse {
  value: GraphUserRaw[];
  "@odata.nextLink"?: string;
}

const PROFILE_SELECT = [
  "id",
  "displayName",
  "givenName",
  "surname",
  "mail",
  "userPrincipalName",
  "jobTitle",
  "department",
  "officeLocation",
  "mobilePhone",
  "businessPhones",
].join(",");

function parseGraphUser(data: GraphUserRaw): MicrosoftUserProfile {
  return {
    id: data.id ?? "",
    displayName: data.displayName ?? null,
    givenName: data.givenName ?? null,
    surname: data.surname ?? null,
    mail: data.mail ?? null,
    userPrincipalName: data.userPrincipalName ?? null,
    jobTitle: data.jobTitle ? data.jobTitle.trim() : null,
    department: data.department ? data.department.trim() : null,
    officeLocation: data.officeLocation ? data.officeLocation.trim() : null,
    mobilePhone: data.mobilePhone ?? null,
    businessPhones: Array.isArray(data.businessPhones)
      ? data.businessPhones
      : [],
  };
}

/**
 * Fetches the authenticated user's profile from Microsoft Graph (/me).
 * Returns jobTitle, department, officeLocation, names, and Entra Object ID.
 */
export async function fetchMicrosoftUserProfile(
  accessToken: string,
): Promise<MicrosoftUserProfile | null> {
  try {
    const response = await fetch(`${GRAPH_BASE}/me?$select=${PROFILE_SELECT}`, {
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
          "Microsoft Graph rejected the access token when fetching profile",
        );
      }
      return null;
    }

    const data = (await response.json()) as GraphUserRaw;
    return parseGraphUser(data);
  } catch (error: unknown) {
    if (error instanceof MicrosoftConnectionError) throw error;
    console.error("[microsoft-graph] fetchMicrosoftUserProfile error:", error);
    return null;
  }
}

/**
 * Fetches all organization users from Microsoft Graph (/users).
 * Requires delegated User.Read.All permission (granted with Admin Consent).
 */
export async function fetchAllMicrosoftUsers(
  accessToken: string,
): Promise<MicrosoftUserProfile[]> {
  const users: MicrosoftUserProfile[] = [];
  let nextUrl: string | null =
    `${GRAPH_BASE}/users?$select=${PROFILE_SELECT}&$top=999`;
  let page = 0;
  const maxPages = 10;

  try {
    while (nextUrl && page < maxPages) {
      const response: Response = await fetch(nextUrl, {
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
            "Microsoft Graph rejected User.Read.All access token",
          );
        }
        throw new Error(`Microsoft Graph API error: ${response.status}`);
      }

      const data = (await response.json()) as GraphUsersListResponse;
      if (Array.isArray(data.value)) {
        for (const rawUser of data.value) {
          if (rawUser.id) {
            users.push(parseGraphUser(rawUser));
          }
        }
      }

      nextUrl = data["@odata.nextLink"] ?? null;
      page += 1;
    }

    return users;
  } catch (error: unknown) {
    if (error instanceof MicrosoftConnectionError) throw error;
    console.error("[microsoft-graph] fetchAllMicrosoftUsers error:", error);
    return users;
  }
}

/**
 * Fetches the user's official avatar photo from Microsoft Graph.
 * Returns a data:image/... base64 string suitable for <img> src or db storage, or null if absent.
 */
export async function fetchMicrosoftUserPhoto(
  accessToken: string,
  targetId: string = "me",
): Promise<string | null> {
  try {
    const endpoint =
      targetId === "me"
        ? `${GRAPH_BASE}/me/photo/$value`
        : `${GRAPH_BASE}/users/${targetId}/photo/$value`;

    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const contentType = response.headers.get("content-type") || "image/jpeg";
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch (error: unknown) {
    console.error("[microsoft-graph] fetchMicrosoftUserPhoto error:", error);
    return null;
  }
}
