/**
 * Teams status-message sync ("⏱️ Focado: OPT-101 (Refactor Auth)").
 *
 * Uses the delegated Graph endpoint `/me/presence/setStatusMessage`, which
 * requires the `Presence.ReadWrite` scope. That scope is only requested when
 * `TEAMS_PRESENCE_SCOPE=true` (see lib/auth.ts) to avoid forcing a tenant-wide
 * re-consent — so this module treats 403 as a knowable, reportable state, and
 * every call is strictly fire-and-forget from the timer routes.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";

const GRAPH_PRESENCE_URL =
  "https://graph.microsoft.com/v1.0/me/presence/setStatusMessage";
const CALL_TIMEOUT_MS = 8_000;
/** A focus status auto-expires so a forgotten timer can't pin it forever. */
const STATUS_EXPIRY_HOURS = 10;

export type PresenceSyncOutcome =
  | "updated"
  | "cleared"
  | "disabled"
  | "no_token"
  | "missing_scope"
  | "failed";

export interface TimerPresenceInput {
  action: "start" | "resume" | "pause" | "stop";
  projectCode?: string | null;
  projectName?: string | null;
  description?: string | null;
}

function buildStatusContent(input: TimerPresenceInput): string | null {
  if (input.action === "pause" || input.action === "stop") return null;

  const project = input.projectCode || input.projectName || "projeto";
  const detail = input.description?.trim()
    ? ` (${input.description.trim().slice(0, 60)})`
    : "";

  return `⏱️ Focado: ${project}${detail} — via OptSolv Time`;
}

async function callSetStatusMessage(
  accessToken: string,
  content: string | null,
): Promise<PresenceSyncOutcome> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    const expiry = new Date(Date.now() + STATUS_EXPIRY_HOURS * 3_600_000);

    const body =
      content === null
        ? { statusMessage: { message: { content: "", contentType: "text" } } }
        : {
            statusMessage: {
              message: { content, contentType: "text" },
              expiryDateTime: {
                dateTime: expiry.toISOString().replace(/\.\d{3}Z$/, ""),
                timeZone: "UTC",
              },
            },
          };

    const response = await fetch(GRAPH_PRESENCE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (response.status === 403 || response.status === 401) {
      return "missing_scope";
    }

    if (!response.ok) {
      console.error("[teams-presence] Graph rejected status update", {
        status: response.status,
      });
      return "failed";
    }

    return content === null ? "cleared" : "updated";
  } catch (error: unknown) {
    console.error(
      "[teams-presence] request failed:",
      error instanceof Error ? error.message : error,
    );
    return "failed";
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mirrors a timer transition into the user's Teams status message.
 * Resolves the user's opt-in flag itself; safe to call unconditionally.
 */
export async function syncTimerPresence(
  headers: Headers,
  userId: string,
  input: TimerPresenceInput,
): Promise<PresenceSyncOutcome> {
  try {
    const profile = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { teamsStatusSyncEnabled: true },
    });

    if (!profile?.teamsStatusSyncEnabled) return "disabled";

    const accessToken = await getMicrosoftAccessToken(headers, userId);
    if (!accessToken) return "no_token";

    return await callSetStatusMessage(accessToken, buildStatusContent(input));
  } catch (error: unknown) {
    console.error("[teams-presence] sync failed:", error);
    return "failed";
  }
}
