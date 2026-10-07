/**
 * "Sua reunião terminou — registrar?" in the OptSolv Time Teams app — the
 * scheduled half.
 *
 * Runs every few minutes during working hours (GitHub Actions cron). For each
 * person with the app installed it builds today through the same
 * collaboration pipeline as the day panel and the evening digest, and then:
 *
 * 1. Registers upcoming Teams meetings for instant nudges
 *    (lib/teams/meeting-watch): a Graph subscription tells the app the second
 *    the person leaves the call.
 * 2. Acts as the safety net for everything the event path cannot see —
 *    in-person meetings, other platforms, missed events — nudging meetings
 *    whose calendar end has passed. A meeting still watched live is left to
 *    the event path, so an overrun is never "ended" by the clock.
 *
 * Both paths share lib/teams/meeting-nudge-delivery: opt-outs, daily cap,
 * series mutes, the project rule and the one-nudge-per-meeting ledger.
 */

import { getBackgroundMicrosoftToken } from "@/lib/collaboration/background-token";
import { buildCollaborationDay } from "@/lib/collaboration/service";
import type { BotCredentials } from "@/lib/teams/bot/auth";
import { getBotConfig } from "@/lib/teams/bot/config";
import { loadBotUserContext } from "@/lib/teams/bot/context";
import { countNudgesOn, loadMutedSeries } from "@/lib/teams/bot/nudges";
import { buildTeamsPrincipal } from "@/lib/teams/commands";
import {
  deliverMeetingNudge,
  loadNudgeCandidates,
  MAX_NUDGES_PER_DAY,
  MIN_MEETING_MINUTES,
  type NudgeCandidate,
  nudgeMinutes,
} from "@/lib/teams/meeting-nudge-delivery";
import {
  loadDeferredMeetingIds,
  pruneMeetingWatches,
  syncMeetingWatches,
} from "@/lib/teams/meeting-watch";
import { getTeamsSettings } from "@/lib/teams/settings";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import { getAppTimeZone, todayInAppTimeZone } from "@/lib/timezone";
import type { MeetingSignal } from "@/types/collaboration";

export { meetingLabel, nudgeMinutes } from "@/lib/teams/meeting-nudge-delivery";

/** Calendars lag a little; a meeting is "over" this long after its end. */
const END_GRACE_MS = 2 * 60_000;
/**
 * How far back an ended meeting still deserves a nudge. Covers a skipped or
 * late cron run without pinging about the morning in the evening.
 */
const LOOKBACK_MS = 2 * 60 * 60_000;
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
  deferred: Set<string> = new Set(),
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
      if (deferred.has(meeting.id)) return false;
      return nudgeMinutes(meeting) >= MIN_MEETING_MINUTES;
    })
    .sort((a, b) => Date.parse(a.endIso) - Date.parse(b.endIso));
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

  if (!options.dryRun) {
    await pruneMeetingWatches(now).catch((error: unknown) =>
      console.warn("[teams-meeting-nudge] prune failed:", error),
    );
  }

  const candidates = await loadNudgeCandidates();
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
    credentials: BotCredentials;
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

  // Instant path first: subscribe upcoming/ongoing Teams meetings.
  if (!run.dryRun) {
    await syncMeetingWatches(candidate, day.meetings, run.now);
  }

  const [mutedSeries, deferred] = await Promise.all([
    loadMutedSeries(candidate.id),
    loadDeferredMeetingIds(candidate.id, run.now.getTime()),
  ]);
  const meetings = selectMeetingsToNudge(
    day.meetings,
    run.now.getTime(),
    mutedSeries,
    deferred,
  );
  if (meetings.length === 0) return tally;

  const alreadySent = await countNudgesOn(candidate.id, run.today);
  const budget = Math.max(0, MAX_NUDGES_PER_DAY - alreadySent);
  if (budget === 0) return { ...tally, skipped: meetings.length };

  if (run.dryRun) {
    return { ...tally, sent: Math.min(meetings.length, budget) };
  }

  const context = await loadBotUserContext(buildTeamsPrincipal(candidate));

  for (const meeting of meetings.slice(0, budget)) {
    const outcome = await deliverMeetingNudge({
      candidate,
      meeting,
      date: run.today,
      credentials: run.credentials,
      context,
    });
    if (outcome === "sent") tally.sent += 1;
    else if (outcome === "failed") tally.failed += 1;
    else if (outcome === "gone") {
      tally.failed += 1;
      break;
    }
  }

  return tally;
}
