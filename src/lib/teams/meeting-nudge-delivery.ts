/**
 * Sends one "Sua reunião terminou — registrar?" card.
 *
 * Shared by both triggers — the Graph meeting-call event (seconds after the
 * person leaves the call) and the polling cron (fallback for everything the
 * event path cannot see) — so they apply the same opt-outs, daily cap,
 * series mutes, project rule and ledger. Whichever trigger claims the
 * meeting first wins; the other finds the ledger row and does nothing.
 */

import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamsBotConversation, user } from "@/lib/db/schema";
import type { BotCredentials } from "@/lib/teams/bot/auth";
import { buildProposalCard, toAttachment } from "@/lib/teams/bot/cards";
import { ConnectorError, sendToConversation } from "@/lib/teams/bot/connector";
import {
  type BotUserContext,
  loadBotUserContext,
} from "@/lib/teams/bot/context";
import { forgetPersonalConversation } from "@/lib/teams/bot/conversations";
import type { TimeDraft } from "@/lib/teams/bot/intent";
import {
  claimNudge,
  countNudgesOn,
  loadMutedSeries,
  setNudgeStatus,
} from "@/lib/teams/bot/nudges";
import { buildTeamsPrincipal } from "@/lib/teams/commands";
import { matchProjectBySubject } from "@/lib/time-assistant/reconstruct";
import { getAppTimeZone } from "@/lib/timezone";

export const MIN_MEETING_MINUTES = 10;
export const MAX_NUDGES_PER_DAY = 8;

/** The meeting facts a card needs, from the calendar or a watch row. */
export interface NudgeMeeting {
  /** Calendar event id — the ledger key shared by both triggers. */
  id: string;
  title: string;
  subject: string;
  startIso: string;
  endIso: string;
  seriesId: string | null;
  /** Scheduled (billable-rounded) minutes. */
  minutes: number;
  /** Time the person actually spent in the call, when known. */
  measuredMinutes?: number | null;
}

export interface NudgeCandidate {
  id: string;
  name: string;
  email: string;
  role: string;
  conversationId: string;
  serviceUrl: string;
  aadObjectId: string;
}

/** What really happened beats what was scheduled. */
export function nudgeMinutes(meeting: NudgeMeeting): number {
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

/** "Daily Shopping Vix · 09:00–09:30 · você ficou 27min na chamada" */
export function meetingLabel(meeting: NudgeMeeting): string {
  const parts = [
    meeting.title,
    `${clock(meeting.startIso)}–${clock(meeting.endIso)}`,
  ];
  if (meeting.measuredMinutes && meeting.measuredMinutes > 0) {
    parts.push(`você ficou ${meeting.measuredMinutes}min na chamada`);
  }
  return parts.join(" · ");
}

const CANDIDATE_COLUMNS = {
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  conversationId: teamsBotConversation.conversationId,
  serviceUrl: teamsBotConversation.serviceUrl,
  aadObjectId: teamsBotConversation.aadObjectId,
};

/**
 * People who can receive a nudge: app installed (stored 1:1 conversation),
 * active and not opted out. Optionally narrowed to some users.
 */
export async function loadNudgeCandidates(
  userIds?: string[],
): Promise<NudgeCandidate[]> {
  const rows = await db
    .select(CANDIDATE_COLUMNS)
    .from(user)
    .innerJoin(teamsBotConversation, eq(teamsBotConversation.userId, user.id))
    .where(
      and(eq(user.isActive, true), eq(user.teamsMeetingNudgeEnabled, true)),
    );
  return userIds ? rows.filter((row) => userIds.includes(row.id)) : rows;
}

export type DeliveryOutcome =
  | "sent"
  | "duplicate"
  | "skipped"
  | "failed"
  | "gone";

export interface DeliverInput {
  candidate: NudgeCandidate;
  meeting: NudgeMeeting;
  /** Local day of the meeting, YYYY-MM-DD. */
  date: string;
  credentials: BotCredentials;
  /** Reused across meetings of the same person in one run. */
  context?: BotUserContext;
}

export async function deliverMeetingNudge(
  input: DeliverInput,
): Promise<DeliveryOutcome> {
  const { candidate, meeting, date } = input;

  if (nudgeMinutes(meeting) < MIN_MEETING_MINUTES) return "skipped";
  if (
    meeting.seriesId &&
    (await loadMutedSeries(candidate.id)).has(meeting.seriesId)
  ) {
    return "skipped";
  }
  if ((await countNudgesOn(candidate.id, date)) >= MAX_NUDGES_PER_DAY) {
    return "skipped";
  }

  const proposalId = crypto.randomUUID();
  const claimed = await claimNudge({
    userId: candidate.id,
    meetingId: meeting.id,
    meetingDate: date,
    proposalId,
  });
  if (!claimed) return "duplicate";

  const context =
    input.context ?? (await loadBotUserContext(buildTeamsPrincipal(candidate)));

  // Same rule as the reconstructor: no project without unique evidence.
  const project = matchProjectBySubject(
    meeting.subject || meeting.title,
    context.parse.projects,
  );
  const draft: TimeDraft = {
    durationMinutes: nudgeMinutes(meeting),
    date,
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
      input.credentials,
      candidate.serviceUrl,
      candidate.conversationId,
      {
        type: "message",
        summary: `Registrar a reunião “${meeting.title}”?`,
        attachments: [toAttachment(card)],
      },
    );
    return "sent";
  } catch (error: unknown) {
    await setNudgeStatus(proposalId, "failed");
    if (
      error instanceof ConnectorError &&
      (error.status === 403 || error.status === 404)
    ) {
      // App removed for this person: stop until they install it again.
      await forgetPersonalConversation(candidate.id);
      return "gone";
    }
    console.warn("[teams-meeting-nudge] delivery failed:", {
      userId: candidate.id,
      error: error instanceof Error ? error.message : String(error),
    });
    return "failed";
  }
}
