/**
 * Instant meeting nudges — Microsoft Graph `meetingCallEvents`.
 *
 * The polling cron knows the calendar; this module adds the call itself. For
 * every upcoming or ongoing Teams meeting of someone with the app, it keeps
 * one Graph subscription per meeting (Graph allows one per app per meeting)
 * and a watch per person. Roster events say when each person joins and
 * leaves; the moment a watched person leaves, the card goes out with the
 * time they actually spent in the call. `callEnded` closes everyone still
 * inside. The cron stays as the safety net and defers to a live watch.
 *
 * Needs, on the login app registration: OnlineMeetings.Read.All
 * (application, admin consent). Notifications arrive encrypted (rich
 * notifications are mandatory for this resource) and are only processed
 * after the clientState and Microsoft-signed validation tokens check out.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, lt } from "drizzle-orm";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import {
  graphMeetingSubscription,
  systemSetting,
  teamsMeetingWatch,
} from "@/lib/db/schema";
import {
  GraphAppError,
  graphAppRequest,
  readGraphAppConfig,
} from "@/lib/graph/app-client";
import {
  type ChangeNotification,
  type ChangeNotificationCollection,
  decryptNotificationContent,
  verifyValidationTokens,
} from "@/lib/graph/change-notifications";
import {
  getCurrentNotificationKey,
  getNotificationKeys,
} from "@/lib/graph/notification-keys";
import { getBotConfig } from "@/lib/teams/bot/config";
import {
  deliverMeetingNudge,
  loadNudgeCandidates,
  type NudgeCandidate,
} from "@/lib/teams/meeting-nudge-delivery";
import { getTeamsSettings } from "@/lib/teams/settings";
import { dateOfInstantInAppTimeZone } from "@/lib/timezone";
import type { MeetingSignal } from "@/types/collaboration";

export const NOTIFICATION_PATH = "/api/graph/notifications";
export const WATCH_HEALTH_SETTING = "graph_meeting_watch_health";

/** Subscribe this long before the start, so the first join is not missed. */
const SUBSCRIBE_AHEAD_MS = 45 * 60_000;
/** Keep listening after the scheduled end: meetings overrun. */
const LISTEN_AFTER_END_MS = 90 * 60_000;
/** Graph's ceiling for meeting-call subscriptions is three days. */
const MAX_SUBSCRIPTION_MS = 3 * 24 * 60 * 60_000 - 10 * 60_000;
/** The cron leaves a live watch alone until this long after the end. */
const DEFER_TO_EVENTS_MS = 45 * 60_000;

// ─── Health (shown to admins) ────────────────────────────────────────

export type WatchHealthStatus =
  | "ok"
  | "missing_permission"
  | "not_configured"
  | "error";

export interface WatchHealth {
  status: WatchHealthStatus;
  detail: string | null;
  checkedAt: string;
}

async function writeHealth(status: WatchHealthStatus, detail: string | null) {
  const value = JSON.stringify({
    status,
    detail,
    checkedAt: new Date().toISOString(),
  } satisfies WatchHealth);
  await db
    .insert(systemSetting)
    .values({ key: WATCH_HEALTH_SETTING, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function readWatchHealth(): Promise<
  WatchHealth & { activeSubscriptions: number }
> {
  const [row, subscriptions] = await Promise.all([
    db.query.systemSetting.findFirst({
      where: (fields, { eq: equals }) =>
        equals(fields.key, WATCH_HEALTH_SETTING),
    }),
    db
      .select({ id: graphMeetingSubscription.id })
      .from(graphMeetingSubscription),
  ]);

  let health: WatchHealth = {
    status: "not_configured",
    detail: "Nenhuma reunião monitorada ainda.",
    checkedAt: new Date(0).toISOString(),
  };
  if (row) {
    try {
      health = JSON.parse(row.value) as WatchHealth;
    } catch {
      // keep the default
    }
  }
  return { ...health, activeSubscriptions: subscriptions.length };
}

/** Graph can only call back a public HTTPS endpoint. */
export function instantNudgesSupported(): boolean {
  return (
    getServerAppUrl().startsWith("https://") && readGraphAppConfig() !== null
  );
}

// ─── Subscriptions ───────────────────────────────────────────────────

export function hashJoinUrl(joinWebUrl: string): string {
  return createHash("sha256").update(joinWebUrl.trim()).digest("hex");
}

function meetingCallEventsResource(joinWebUrl: string): string {
  return `communications/onlineMeetings(joinWebUrl='${encodeURIComponent(joinWebUrl.trim())}')/meetingCallEvents`;
}

function subscriptionExpiry(endIso: string, now: Date): Date {
  const wanted = Date.parse(endIso) + LISTEN_AFTER_END_MS;
  return new Date(Math.min(wanted, now.getTime() + MAX_SUBSCRIPTION_MS));
}

interface GraphSubscription {
  id: string;
  expirationDateTime: string;
}

async function ensureSubscription(
  joinWebUrl: string,
  endIso: string,
  now: Date,
): Promise<void> {
  const joinUrlHash = hashJoinUrl(joinWebUrl);
  const expiresAt = subscriptionExpiry(endIso, now);

  const existing = await db.query.graphMeetingSubscription.findFirst({
    where: eq(graphMeetingSubscription.joinUrlHash, joinUrlHash),
  });

  if (
    existing &&
    existing.expiresAt.getTime() >= expiresAt.getTime() - 60_000
  ) {
    return;
  }

  if (existing && existing.expiresAt.getTime() > now.getTime()) {
    // Meeting moved later: stretch the subscription instead of recreating.
    await graphAppRequest("PATCH", "beta", `/subscriptions/${existing.id}`, {
      expirationDateTime: expiresAt.toISOString(),
    });
    await db
      .update(graphMeetingSubscription)
      .set({ expiresAt })
      .where(eq(graphMeetingSubscription.id, existing.id));
    return;
  }

  if (existing) {
    await db
      .delete(graphMeetingSubscription)
      .where(eq(graphMeetingSubscription.id, existing.id));
  }

  const key = await getCurrentNotificationKey(now);
  const clientState = randomBytes(24).toString("base64url");
  const notificationUrl = `${getServerAppUrl()}${NOTIFICATION_PATH}`;

  let created: GraphSubscription | null;
  try {
    created = await graphAppRequest<GraphSubscription>(
      "POST",
      "beta",
      "/subscriptions",
      {
        changeType: "updated",
        notificationUrl,
        lifecycleNotificationUrl: notificationUrl,
        resource: meetingCallEventsResource(joinWebUrl),
        includeResourceData: true,
        encryptionCertificate: key.certificate,
        encryptionCertificateId: key.id,
        expirationDateTime: expiresAt.toISOString(),
        clientState,
      },
    );
  } catch (error: unknown) {
    // Another process already subscribed this meeting: Graph allows one.
    if (error instanceof GraphAppError && error.status === 409) return;
    throw error;
  }
  if (!created?.id) return;

  const [stored] = await db
    .insert(graphMeetingSubscription)
    .values({
      id: created.id,
      joinUrlHash,
      clientState,
      expiresAt: new Date(created.expirationDateTime || expiresAt),
    })
    .onConflictDoNothing()
    .returning({ id: graphMeetingSubscription.id });

  if (!stored) {
    // Lost a race with a concurrent run: drop the duplicate at Graph.
    await graphAppRequest(
      "DELETE",
      "beta",
      `/subscriptions/${created.id}`,
    ).catch(() => undefined);
  }
}

/** Meetings worth watching now: Teams calls starting soon or under way. */
export function selectMeetingsToWatch(
  meetings: MeetingSignal[],
  nowMs: number,
): MeetingSignal[] {
  return meetings.filter((meeting) => {
    if (!meeting.isOnline || !meeting.joinWebUrl) return false;
    if (meeting.alreadyLogged || meeting.confidence === "low") return false;
    const start = Date.parse(meeting.startIso);
    const end = Date.parse(meeting.endIso);
    return (
      start - nowMs <= SUBSCRIBE_AHEAD_MS && end + LISTEN_AFTER_END_MS > nowMs
    );
  });
}

/**
 * Registers watches and subscriptions for one person's meetings. Called by
 * the cron with the day it already built. Never throws: the cron must keep
 * working when Graph refuses (missing permission, outage).
 */
export async function syncMeetingWatches(
  candidate: NudgeCandidate,
  meetings: MeetingSignal[],
  now = new Date(),
): Promise<void> {
  if (!instantNudgesSupported()) return;

  const toWatch = selectMeetingsToWatch(meetings, now.getTime());
  if (toWatch.length === 0) return;

  try {
    for (const meeting of toWatch) {
      const joinWebUrl = meeting.joinWebUrl as string;
      await db
        .insert(teamsMeetingWatch)
        .values({
          id: crypto.randomUUID(),
          userId: candidate.id,
          joinUrlHash: hashJoinUrl(joinWebUrl),
          eventId: meeting.id,
          aadObjectId: candidate.aadObjectId,
          title: meeting.title,
          subject: meeting.subject,
          seriesId: meeting.seriesId,
          startIso: meeting.startIso,
          endIso: meeting.endIso,
        })
        .onConflictDoUpdate({
          target: [teamsMeetingWatch.userId, teamsMeetingWatch.eventId],
          // A rescheduled meeting keeps its watch, with the new times.
          set: {
            title: meeting.title,
            startIso: meeting.startIso,
            endIso: meeting.endIso,
          },
        });

      await ensureSubscription(joinWebUrl, meeting.endIso, now);
    }
    await writeHealth("ok", null);
  } catch (error: unknown) {
    const forbidden =
      error instanceof GraphAppError &&
      (error.status === 401 || error.status === 403);
    await writeHealth(
      forbidden ? "missing_permission" : "error",
      error instanceof Error ? error.message.slice(0, 300) : String(error),
    ).catch(() => undefined);
    console.warn("[meeting-watch] subscription failed:", {
      userId: candidate.id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Calendar event ids the cron must leave to the event path for now: watched
 * meetings that are not over yet (or only just), so a meeting that overruns
 * is never "ended" by the clock while the person is still talking.
 */
export async function loadDeferredMeetingIds(
  userId: string,
  nowMs: number,
): Promise<Set<string>> {
  if (!instantNudgesSupported()) return new Set();

  const rows = await db
    .select({
      eventId: teamsMeetingWatch.eventId,
      endIso: teamsMeetingWatch.endIso,
      joinedAt: teamsMeetingWatch.joinedAt,
      status: teamsMeetingWatch.status,
    })
    .from(teamsMeetingWatch)
    .where(
      and(
        eq(teamsMeetingWatch.userId, userId),
        eq(teamsMeetingWatch.status, "watching"),
      ),
    );

  return new Set(
    rows
      .filter(
        (row) =>
          row.joinedAt !== null ||
          Date.parse(row.endIso) + DEFER_TO_EVENTS_MS > nowMs,
      )
      .map((row) => row.eventId),
  );
}

/** Forgets watches and subscriptions that can no longer matter. */
export async function pruneMeetingWatches(now = new Date()): Promise<void> {
  const dayAgo = new Date(now.getTime() - 24 * 60 * 60_000).toISOString();
  await db
    .delete(teamsMeetingWatch)
    .where(lt(teamsMeetingWatch.endIso, dayAgo));
  await db
    .delete(graphMeetingSubscription)
    .where(lt(graphMeetingSubscription.expiresAt, now));
}

// ─── Notifications ───────────────────────────────────────────────────

interface RosterParticipant {
  info?: { identity?: { user?: { id?: string } } };
  isInLobby?: boolean;
  removedState?: { reason?: string } | null;
}

export interface MeetingCallEvent {
  eventType?: "callStarted" | "callEnded" | "rosterUpdated" | string;
  eventDateTime?: string;
  "participants@delta"?: RosterParticipant[];
}

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function handleLifecycle(item: ChangeNotification): Promise<void> {
  switch (item.lifecycleEvent) {
    case "reauthorizationRequired":
      await graphAppRequest(
        "POST",
        "beta",
        `/subscriptions/${item.subscriptionId}/reauthorize`,
      ).catch((error: unknown) =>
        console.warn("[meeting-watch] reauthorize failed:", error),
      );
      return;
    case "subscriptionRemoved":
      // The next cron run recreates it if the meeting still matters.
      await db
        .delete(graphMeetingSubscription)
        .where(eq(graphMeetingSubscription.id, item.subscriptionId));
      return;
    default:
      console.info("[meeting-watch] lifecycle event:", item.lifecycleEvent);
  }
}

/**
 * Processes one delivery from Graph. Runs after the 202 was sent, as Graph
 * asks; anything unauthenticated is dropped silently.
 */
export async function handleNotificationBatch(
  collection: ChangeNotificationCollection,
): Promise<void> {
  const items = collection.value ?? [];
  if (items.length === 0) return;

  const subscriptionIds = [
    ...new Set(items.map((item) => item.subscriptionId)),
  ];
  const subscriptions = await db
    .select()
    .from(graphMeetingSubscription)
    .where(inArray(graphMeetingSubscription.id, subscriptionIds));
  const byId = new Map(subscriptions.map((row) => [row.id, row]));

  const authentic = items.filter((item) => {
    const subscription = byId.get(item.subscriptionId);
    return (
      subscription &&
      typeof item.clientState === "string" &&
      sameSecret(item.clientState, subscription.clientState)
    );
  });
  if (authentic.length === 0) return;

  for (const item of authentic.filter((entry) => entry.lifecycleEvent)) {
    await handleLifecycle(item);
  }

  const changes = authentic.filter(
    (entry) => !entry.lifecycleEvent && entry.encryptedContent,
  );
  if (changes.length === 0) return;

  const config = readGraphAppConfig();
  if (!config) return;
  const tokensOk = await verifyValidationTokens(collection.validationTokens, {
    appId: config.clientId,
    tenantId: config.tenantId,
  });
  if (!tokensOk) {
    console.warn(
      "[meeting-watch] dropped a batch with invalid validation tokens",
    );
    return;
  }

  const keys = await getNotificationKeys();
  for (const item of changes) {
    const content = item.encryptedContent;
    const key = keys.find(
      (entry) => entry.id === content?.encryptionCertificateId,
    );
    const subscription = byId.get(item.subscriptionId);
    if (!content || !key || !subscription) continue;

    try {
      const event = decryptNotificationContent(
        content,
        key.privateKeyPem,
      ) as MeetingCallEvent;
      await applyMeetingCallEvent(subscription.joinUrlHash, event);
    } catch (error: unknown) {
      console.warn("[meeting-watch] could not process notification:", {
        subscriptionId: item.subscriptionId,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}

function eventTime(event: MeetingCallEvent): Date {
  const parsed = event.eventDateTime
    ? Date.parse(event.eventDateTime)
    : Number.NaN;
  return Number.isNaN(parsed) ? new Date() : new Date(parsed);
}

type WatchRow = typeof teamsMeetingWatch.$inferSelect;

/** Applies a call event to the watches of one meeting. Exported for tests. */
export async function applyMeetingCallEvent(
  joinUrlHash: string,
  event: MeetingCallEvent,
  /** Test seam: replaces the card delivery, keeps the watch bookkeeping. */
  deliver: (
    watch: WatchRow,
    presenceMs: number,
  ) => Promise<boolean> = nudgeFromWatch,
): Promise<{ nudged: string[] }> {
  const watches = await db
    .select()
    .from(teamsMeetingWatch)
    .where(
      and(
        eq(teamsMeetingWatch.joinUrlHash, joinUrlHash),
        eq(teamsMeetingWatch.status, "watching"),
      ),
    );
  if (watches.length === 0) return { nudged: [] };

  const at = eventTime(event);
  const toNudge: Array<{ watch: WatchRow; presenceMs: number }> = [];

  if (event.eventType === "rosterUpdated") {
    for (const participant of event["participants@delta"] ?? []) {
      const oid = participant.info?.identity?.user?.id?.toLowerCase();
      const watch = watches.find(
        (row) => row.aadObjectId.toLowerCase() === oid,
      );
      if (!watch) continue;

      if (participant.removedState) {
        const presenceMs =
          watch.presenceMs +
          (watch.joinedAt
            ? Math.max(0, at.getTime() - watch.joinedAt.getTime())
            : 0);
        await db
          .update(teamsMeetingWatch)
          .set({ joinedAt: null, presenceMs })
          .where(eq(teamsMeetingWatch.id, watch.id));
        if (presenceMs > 0) toNudge.push({ watch, presenceMs });
      } else if (!participant.isInLobby && !watch.joinedAt) {
        await db
          .update(teamsMeetingWatch)
          .set({ joinedAt: at })
          .where(eq(teamsMeetingWatch.id, watch.id));
      }
    }
  }

  if (event.eventType === "callEnded") {
    for (const watch of watches) {
      const presenceMs =
        watch.presenceMs +
        (watch.joinedAt
          ? Math.max(0, at.getTime() - watch.joinedAt.getTime())
          : 0);
      if (presenceMs > 0) {
        toNudge.push({ watch, presenceMs });
      } else {
        // Never seen in the call: let the calendar-based cron decide.
        await db
          .update(teamsMeetingWatch)
          .set({ status: "closed", joinedAt: null })
          .where(eq(teamsMeetingWatch.id, watch.id));
      }
    }
  }

  const nudged: string[] = [];
  for (const { watch, presenceMs } of toNudge) {
    await db
      .update(teamsMeetingWatch)
      .set({ status: "nudged", joinedAt: null, presenceMs })
      .where(eq(teamsMeetingWatch.id, watch.id));
    if (await deliver(watch, presenceMs)) nudged.push(watch.userId);
  }
  return { nudged };
}

async function nudgeFromWatch(
  watch: WatchRow,
  presenceMs: number,
): Promise<boolean> {
  const [settings, botConfig, candidates] = await Promise.all([
    getTeamsSettings(),
    getBotConfig(),
    loadNudgeCandidates([watch.userId]),
  ]);
  const candidate = candidates[0];
  if (
    !candidate ||
    !settings.enabled ||
    !settings.meetingNudgesEnabled ||
    !botConfig.credentials
  ) {
    return false;
  }

  const scheduledMinutes = Math.max(
    1,
    Math.round(
      (Date.parse(watch.endIso) - Date.parse(watch.startIso)) / 60_000,
    ),
  );
  const outcome = await deliverMeetingNudge({
    candidate,
    credentials: botConfig.credentials,
    date: dateOfInstantInAppTimeZone(watch.startIso),
    meeting: {
      id: watch.eventId,
      title: watch.title,
      subject: watch.subject,
      startIso: watch.startIso,
      endIso: watch.endIso,
      seriesId: watch.seriesId,
      minutes: scheduledMinutes,
      measuredMinutes: Math.max(1, Math.round(presenceMs / 60_000)),
    },
  });

  console.info("[teams_meeting_nudge_instant]", {
    userId: watch.userId,
    outcome,
    presenceMinutes: Math.round(presenceMs / 60_000),
  });
  return outcome === "sent";
}
