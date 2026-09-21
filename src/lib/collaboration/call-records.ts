/**
 * Teams Call Records integration via Microsoft Graph Call Records API.
 *
 * Endpoint: GET /communications/callRecords
 * Scope required: CallRecords.Read.All (Application permission with Admin Consent).
 *
 * Captures peer-to-peer and group calls initiated directly on Microsoft Teams
 * (outside formal Outlook Calendar invitations), completing the time tracking picture.
 *
 * Graceful degradation:
 * When the organization has not granted admin consent yet in Microsoft Entra,
 * Graph returns 403 Forbidden. This module detects that and returns `needs_admin_consent`
 * as an informational status rather than throwing.
 */

import type { TeamCallSignal } from "@/types/collaboration";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const CALL_RECORDS_TIMEOUT_MS = 10_000;

export type CallRecordsHealth =
  | "ok"
  | "needs_admin_consent"
  | "not_configured"
  | "unavailable";

export interface FetchCallRecordsResult {
  calls: TeamCallSignal[];
  status: CallRecordsHealth;
  error?: string;
}

export interface FetchCallRecordsInput {
  userAadObjectId: string | null;
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
}

interface GraphIdentity {
  user?: {
    id?: string;
    displayName?: string;
    userPrincipalName?: string;
  };
}

interface GraphSession {
  caller?: GraphIdentity;
  callee?: GraphIdentity;
  modalities?: string[];
  startDateTime?: string;
  endDateTime?: string;
}

interface GraphCallRecord {
  id: string;
  type?: "peerToPeer" | "groupCall";
  startDateTime?: string;
  endDateTime?: string;
  modalities?: string[];
  participants?: GraphIdentity[];
  sessions?: GraphSession[];
}

interface GraphCallRecordsResponse {
  value?: GraphCallRecord[];
}

/**
 * Obtains an application-only access token using OAuth 2.0 Client Credentials.
 */
async function getApplicationToken(): Promise<string | null> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  if (!tenantId || !clientId || !clientSecret) {
    return null;
  }

  try {
    const response = await fetch(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
        cache: "no-store",
      },
    );

    if (!response.ok) {
      console.warn(
        "[call-records] client_credentials token request rejected:",
        response.status,
      );
      return null;
    }

    const data = (await response.json()) as { access_token?: string };
    return data.access_token ?? null;
  } catch (error: unknown) {
    console.error("[call-records] failed to get app token:", error);
    return null;
  }
}

/**
 * Fetches Teams calls for a given date range.
 *
 * Never throws: fails gracefully with a status code.
 */
export async function fetchTeamCallRecords(
  input: FetchCallRecordsInput,
): Promise<FetchCallRecordsResult> {
  const { userAadObjectId, from, to } = input;

  const appToken = await getApplicationToken();
  if (!appToken) {
    return { calls: [], status: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_RECORDS_TIMEOUT_MS);

  try {
    const url = new URL(`${GRAPH_BASE}/communications/callRecords`);
    url.searchParams.set("$expand", "sessions");

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${appToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 403) {
        return {
          calls: [],
          status: "needs_admin_consent",
          error:
            "A permissão CallRecords.Read.All ainda não recebeu consentimento de administrador no Microsoft Entra.",
        };
      }

      console.warn(
        "[call-records] callRecords request failed:",
        response.status,
      );
      return { calls: [], status: "unavailable" };
    }

    const data = (await response.json()) as GraphCallRecordsResponse;
    const rawRecords = data.value ?? [];

    const calls: TeamCallSignal[] = [];

    for (const record of rawRecords) {
      if (!record.startDateTime || !record.endDateTime) continue;

      const startDate = record.startDateTime.slice(0, 10);
      if (startDate < from || startDate > to) continue;

      const startTime = new Date(record.startDateTime).getTime();
      const endTime = new Date(record.endDateTime).getTime();
      const minutes = Math.max(1, Math.round((endTime - startTime) / 60_000));

      // Skip dropped calls or calls shorter than 1 minute (like misdials)
      if (minutes < 1) continue;

      // Extract participants
      const sessions = record.sessions ?? [];
      let callerName: string | null = null;
      let calleeName: string | null = null;
      let isUserParticipant = false;
      let otherName = "Chamada do Teams";

      for (const s of sessions) {
        const caller = s.caller?.user;
        const callee = s.callee?.user;

        if (caller?.displayName) callerName = caller.displayName;
        if (callee?.displayName) calleeName = callee.displayName;

        if (userAadObjectId) {
          if (caller?.id === userAadObjectId) {
            isUserParticipant = true;
            if (callee?.displayName) otherName = callee.displayName;
          } else if (callee?.id === userAadObjectId) {
            isUserParticipant = true;
            if (caller?.displayName) otherName = caller.displayName;
          }
        }
      }

      // If user filter is provided and user was not part of the call, skip
      if (userAadObjectId && !isUserParticipant) {
        continue;
      }

      calls.push({
        id: record.id,
        startIso: record.startDateTime,
        endIso: record.endDateTime,
        minutes,
        otherParticipantName: otherName,
        callerName,
        calleeName,
        callType: record.type === "groupCall" ? "groupCall" : "peerToPeer",
        mediaTypes: record.modalities ?? ["audio"],
      });
    }

    return { calls, status: "ok" };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return { calls: [], status: "unavailable", error: "Timeout" };
    }
    console.error("[call-records] fetch error:", error);
    return { calls: [], status: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}
