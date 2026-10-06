/**
 * "Sua reunião terminou — registrar?" in the OptSolv Time Teams app.
 *
 * Runs every few minutes during working hours (GitHub Actions cron). For each
 * person with the app installed, it reads today's meetings through the same
 * collaboration pipeline as the day panel and the evening digest, picks the
 * ones that just ended and are not logged yet, and sends one card per meeting
 * to their private chat with the app.
 *
 * Why polling and not Graph change notifications: calendar subscriptions
 * report created/updated/deleted events, never "ended", so a timer would be
 * needed anyway. Polling the day the app already knows how to build is
 * simpler and shares every rule (declined, cancelled, overlaps, already
 * logged) with the rest of the product.
 *
 * Guard rails: opt-out per person and per organization, nothing outside
 * working hours or while away, meetings of 10+ minutes only, a daily cap,
 * a ledger that makes every meeting asked about once, and projects only
 * preselected on unique evidence (same rule as the day reconstructor).
 */

import { and, eq } from "drizzle-orm";
import { getBackgroundMicrosoftToken } from "@/lib/collaboration/background-token";
import { buildCollaborationDay } from "@/lib/collaboration/service";
import { db } from "@/lib/db";
import { teamsBotConversation, user } from "@/lib/db/schema";
import { buildProposalCard, toAttachment } from "@/lib/teams/bot/cards";
import { getBotConfig } from "@/lib/teams/bot/config";
import { ConnectorError, sendToConversation } from "@/lib/teams/bot/connector";
import { loadBotUserContext } from "@/lib/teams/bot/context";
import { forgetPersonalConversation } from "@/lib/teams/bot/conversations";
import type { TimeDraft } from "@/lib/teams/bot/intent";
import {
  claimNudge,
  countNudgesOn,
  loadMutedSeries,
  setNudgeStatus,
} from "@/lib/teams/bot/nudges";
import { buildTeamsPrincipal } from "@/lib/teams/commands";
import { getTeamsSettings } from "@/lib/teams/settings";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import { matchProjectBySubject } from "@/lib/time-assistant/reconstruct";
import { getAppTimeZone, todayInAppTimeZone } from "@/lib/timezone";
import type { MeetingSignal } from "@/types/collaboration";

/** Calendars lag a little; a meeting is "over" this long after its end. */
const END_GRACE_MS = 2 * 60_000;
/**
 * How far back an ended meeting still deserves a nudge. Covers a skipped or
 * late cron run without pinging about the morning in the evening.
 */
const LOOKBACK_MS = 2 * 60 * 60_000;
const MIN_MEETING_MINUTES = 10;
const MAX_NUDGES_PER_DAY = 8;
/** Local hours in which nudges may go out (inclusive start, exclusive end). */
const WORKING_HOURS = { start: 8, end: 21 } as const;
const CONCURRENCY = 4;

export interface MeetingNudgeOptions {
  now?: Date;
  /** Count what would be sent, without claiming or sending anything. */
  dryRun?: boolean;
  /** Manual runs outside the working-hours window (workflow_dispatch). */
  ignoreWorkingHours?: boolean;
}

export interface MeetingNudgeRunResult {
  status: "completed" | "skipped";
  reason: string | null;
  users: number;
  sent: number;
  skipped: number;
  failed: number;
}

/** Meetings worth a nudge right now. Pure — unit tested. */
export function selectMeetingsToNudge(
  meetings: MeetingSignal[],
  nowMs: number,
  mutedSeries: Set<string> = new Set(),
): MeetingSignal[] {
  return meetings
    .filter((meeting) => {
      const end = Date.parse(meeting.endIso);
      if (Number.isNaN(end)) return false;
      if (end > nowMs - END_GRACE_MS || end < nowMs - LOOKBACK_MS) {
        return false;
      }
      if (meeting.alreadyLogged || meeting.confidence === "low") return false;
      if (meeting.seriesId && mutedSeries.has(meeting.seriesId)) return false;
      return nudgeMinutes(meeting) >= MIN_MEETING_MINUTES;
    })
    .sort((a, b) => Date.parse(a.endIso) - Date.parse(b.endIso));
}

/** What really happened beats what was scheduled. */
export function nudgeMinutes(meeting: MeetingSignal): number {
  return meeting.measuredMinutes && meeting.measuredMinutes > 0
    ? meeting.measuredMinutes
    : meeting.minutes;
}

function clock(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: getAppTimeZone(),
  }).format(new Date(iso));
}

/** "Daily Shopping Vix · 09:00–09:30 · você ficou 27min" */
export function meetingLabel(meeting: MeetingSignal): string {
  const parts = [
    meeting.title,
    `${clock(meeting.startIso)}–${clock(meeting.endIso)}`,
  ];
  if (meeting.measuredMinutes && meeting.measuredMinutes > 0) {
    parts.push(`você ficou ${meeting.measuredMinutes}min na chamada`);
  }
  return parts.join(" · ");
}

function localHour(now: Date): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      hourCycle: "h23",
      timeZone: getAppTimeZone(),
    }).format(now),
  );
}

interface NudgeCandidate {
  id: string;
  name: string;
  email: string;
  role: string;
  conversationId: string;
  serviceUrl: string;
  aadObjectId: string;
}

export async function runMeetingNudges(
  options: MeetingNudgeOptions = {},
): Promise<MeetingNudgeRunResult> {
  const now = options.now ?? new Date();
  const empty = { users: 0, sent: 0, skipped: 0, failed: 0 };

  const hour = localHour(now);
  if (
    !options.ignoreWorkingHours &&
    (hour < WORKING_HOURS.start || hour >= WORKING_HOURS.end)
  ) {
    return {
      status: "skipped",
      reason: "Fora do horário comercial.",
      ...empty,
    };
  }

  const [settings, botConfig] = await Promise.all([
    getTeamsSettings(),
    getBotConfig(),
  ]);
  if (!settings.enabled || !settings.meetingNudgesEnabled) {
    return {
      status: "skipped",
      reason: "Lembrete pós-reunião desabilitado nas configurações do Teams.",
      ...empty,
    };
  }
  const credentials = botConfig.credentials;
  if (!credentials) {
    return {
      status: "skipped",
      reason: "Bot do Teams não configurado.",
      ...empty,
    };
  }

  // Only people who can actually receive the card: app installed (a stored
  // 1:1 conversation), active, and not opted out.
  const candidates: NudgeCandidate[] = await db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      conversationId: teamsBotConversation.conversationId,
      serviceUrl: teamsBotConversation.serviceUrl,
      aadObjectId: teamsBotConversation.aadObjectId,
    })
    .from(user)
    .innerJoin(teamsBotConversation, eq(teamsBotConversation.userId, user.id))
    .where(
      and(eq(user.isActive, true), eq(user.teamsMeetingNudgeEnabled, true)),
    );

  const today = todayInAppTimeZone();
  let sent = 0;
  let skipped = 0;
  let failed = 0;

  await mapWithConcurrencyLimit(candidates, CONCURRENCY, async (candidate) => {
    try {
      const outcome = await nudgeOne(candidate, {
        now,
        today,
        dryRun: Boolean(options.dryRun),
        credentials,
      });
      sent += outcome.sent;
      skipped += outcome.skipped;
      failed += outcome.failed;
    } catch (error: unknown) {
      failed += 1;
      console.error("[teams-meeting-nudge] user failed:", {
        userId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  });

  const result: MeetingNudgeRunResult = {
    status: "completed",
    reason: null,
    users: candidates.length,
    sent,
    skipped,
    failed,
  };
  console.info("[teams_meeting_nudge_run]", {
    ...result,
    dryRun: options.dryRun,
  });
  return result;
}

async function nudgeOne(
  candidate: NudgeCandidate,
  run: {
    now: Date;
    today: string;
    dryRun: boolean;
    credentials: NonNullable<
      Awaited<ReturnType<typeof getBotConfig>>["credentials"]
    >;
  },
): Promise<{ sent: number; skipped: number; failed: number }> {
  const tally = { sent: 0, skipped: 0, failed: 0 };

  const accessToken = await getBackgroundMicrosoftToken(candidate.id);
  if (!accessToken) return { ...tally, skipped: 1 };

  const day = await buildCollaborationDay({
    accessToken,
    userId: candidate.id,
    userEmail: candidate.email,
    date: run.today,
    skipPortrait: true,
  });
  if (day.away || !day.target.isWorkingDay) return { ...tally, skipped: 1 };

  const mutedSeries = await loadMutedSeries(candidate.id);
  const meetings = selectMeetingsToNudge(
    day.meetings,
    run.now.getTime(),
    mutedSeries,
  );
  if (meetings.length === 0) return tally;

  const alreadySent = await countNudgesOn(candidate.id, run.today);
  const budget = Math.max(0, MAX_NUDGES_PER_DAY - alreadySent);
  if (budget === 0) return { ...tally, skipped: meetings.length };

  if (run.dryRun) {
    return { ...tally, sent: Math.min(meetings.length, budget) };
  }

  const principal = buildTeamsPrincipal(candidate);
  const context = await loadBotUserContext(principal);

  for (const meeting of meetings.slice(0, budget)) {
    const proposalId = crypto.randomUUID();
    const claimed = await claimNudge({
      userId: candidate.id,
      meetingId: meeting.id,
      meetingDate: run.today,
      proposalId,
    });
    if (!claimed) continue;

    // Same rule as the reconstructor: no project without unique evidence.
    const project = matchProjectBySubject(
      meeting.subject || meeting.title,
      context.parse.projects,
    );
    const draft: TimeDraft = {
      durationMinutes: nudgeMinutes(meeting),
      date: run.today,
      // The title is what the day panel matches to call a meeting "logged".
      description: meeting.title,
      projectId: project?.id ?? null,
      projectGuessed: false,
      azureWorkItemId: null,
      source: "rules",
    };

    const card = buildProposalCard({
      surface: "message",
      proposalId,
      requesterOid: candidate.aadObjectId,
      draft,
      projects: context.parse.projects,
      meeting: { label: meetingLabel(meeting), seriesId: meeting.seriesId },
    });

    try {
      await sendToConversation(
        run.credentials,
        candidate.serviceUrl,
        candidate.conversationId,
        {
          type: "message",
          summary: `Registrar a reunião “${meeting.title}”?`,
          attachments: [toAttachment(card)],
        },
      );
      tally.sent += 1;
    } catch (error: unknown) {
      tally.failed += 1;
      await setNudgeStatus(proposalId, "failed");
      if (
        error instanceof ConnectorError &&
        (error.status === 403 || error.status === 404)
      ) {
        // App removed for this person: stop until they install it again.
        await forgetPersonalConversation(candidate.id);
        break;
      }
      console.warn("[teams-meeting-nudge] delivery failed:", {
        userId: candidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return tally;
}
