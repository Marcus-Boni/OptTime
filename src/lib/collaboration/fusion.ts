/**
 * Smart Fusion of Calendar Meetings and Teams Call Records.
 *
 * Prevents calendar meetings and measured Teams call records for the same event
 * from fragmenting into disconnected entries (e.g. a 30-min scheduled meeting
 * that lasted 38 minutes becoming a 30-min meeting + a confusing 7-min orphan call).
 *
 * When a call matches a scheduled meeting:
 * 1. The meeting is enriched with the actual measured duration from the Teams session.
 * 2. The meeting's evidence explains that duration was measured in Teams.
 * 3. The call is consumed / absorbed, preventing any phantom or residual call card.
 */

import type { TeamCallRecordSignal } from "@/lib/collaboration/call-records";
import type { MeetingSignal, TeamCallSignal } from "@/types/collaboration";

export interface FuseMeetingsAndCallsInput {
  meetings: MeetingSignal[];
  calls: Array<TeamCallRecordSignal | TeamCallSignal>;
}

export interface FuseMeetingsAndCallsResult {
  meetings: MeetingSignal[];
  remainingCalls: TeamCallSignal[];
  fusedCallIds: Set<string>;
}

/**
 * Extracts the canonical meeting thread ID from a Teams join URL.
 * Example:
 * https://teams.microsoft.com/l/meetup-join/19%3ameeting_NzY4...%40thread.v2/0?context=...
 * -> 19:meeting_nzy4...@thread.v2
 */
export function extractTeamsMeetingKey(
  url: string | null | undefined,
): string | null {
  if (!url) return null;
  try {
    const raw = url.trim();
    const match = raw.match(/\/l\/meetup-join\/([^/?#]+)/i);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]).toLowerCase();
      } catch {
        return match[1].toLowerCase();
      }
    }
    const parsed = new URL(raw);
    const decodedPath = decodeURIComponent(parsed.pathname)
      .toLowerCase()
      .replace(/\/+$/, "");
    return `${parsed.host.toLowerCase()}${decodedPath}`;
  } catch {
    const clean = url.trim().toLowerCase();
    const match = clean.match(/\/l\/meetup-join\/([^/?#]+)/i);
    if (match?.[1]) {
      try {
        return decodeURIComponent(match[1]).toLowerCase();
      } catch {
        return match[1].toLowerCase();
      }
    }
    return clean;
  }
}

interface IntervalMs {
  start: number;
  end: number;
}

function mergeIntervalsMs(intervals: IntervalMs[]): IntervalMs[] {
  const sorted = intervals
    .filter((i) => Number.isFinite(i.start) && i.end > i.start)
    .sort((a, b) => a.start - b.start);
  const merged: IntervalMs[] = [];
  for (const interval of sorted) {
    const prev = merged.at(-1);
    if (!prev) {
      merged.push({ ...interval });
      continue;
    }
    if (interval.start <= prev.end) {
      if (interval.end > prev.end) {
        prev.end = interval.end;
      }
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function formatFusedEvidence(
  originalEvidence: string,
  measuredMinutes: number,
  scheduledMinutes: number,
): string {
  let measurementText: string;
  if (measuredMinutes > scheduledMinutes) {
    const diff = measuredMinutes - scheduledMinutes;
    measurementText = `Duração real medida no Teams: ${measuredMinutes} min (+${diff} min além do agendado)`;
  } else if (measuredMinutes < scheduledMinutes) {
    measurementText = `Participação medida no Teams: ${measuredMinutes} min (agendado: ${scheduledMinutes} min)`;
  } else {
    measurementText = `Presença confirmada no Teams: ${measuredMinutes} min`;
  }

  const cleanOriginal = originalEvidence.replace(/\.$/, "").trim();
  if (!cleanOriginal) return `${measurementText}.`;
  return `${measurementText}. ${cleanOriginal}.`;
}

/**
 * Evaluates whether a call matches a meeting, returning a match score.
 * A score > 0 indicates a match; higher score means stronger match.
 */
function evaluateMatch(
  call: TeamCallSignal,
  meeting: MeetingSignal,
): { isMatch: boolean; score: number } {
  // 1. Exact joinWebUrl match (highest confidence)
  const callKey = extractTeamsMeetingKey(call.joinWebUrl);
  const meetingKey = extractTeamsMeetingKey(meeting.joinWebUrl);
  if (callKey && meetingKey && callKey === meetingKey) {
    return { isMatch: true, score: 10_000 };
  }

  // 2. Temporal overlap match
  const callStart = Date.parse(call.startIso);
  const callEnd = Date.parse(call.endIso);
  const meetingStart = Date.parse(meeting.startIso);
  const meetingEnd = Date.parse(meeting.endIso);

  if (
    !Number.isFinite(callStart) ||
    !Number.isFinite(callEnd) ||
    !Number.isFinite(meetingStart) ||
    !Number.isFinite(meetingEnd)
  ) {
    return { isMatch: false, score: 0 };
  }

  const overlapStart = Math.max(callStart, meetingStart);
  const overlapEnd = Math.min(callEnd, meetingEnd);
  const overlapMs = Math.max(0, overlapEnd - overlapStart);
  const overlapMinutes = Math.floor(overlapMs / 60_000);
  const startDiffMs = Math.abs(callStart - meetingStart);
  const meetingDurationMs = meetingEnd - meetingStart;

  // Start times must be reasonably close (within 20 minutes)
  if (startDiffMs > 20 * 60_000) {
    return { isMatch: false, score: 0 };
  }

  // Must have substantial overlap
  const isSubstantialOverlap =
    overlapMinutes >= 10 || overlapMs >= 0.5 * meetingDurationMs;

  if (!isSubstantialOverlap) {
    return { isMatch: false, score: 0 };
  }

  // Coherence check by call type and participants
  if (call.callType === "groupCall") {
    // Group call matches online group meetings or meetings with participants
    const isGroupMeeting =
      meeting.participantCount > 0 ||
      meeting.isOnline ||
      meeting.shape !== "one_on_one";
    if (!isGroupMeeting) return { isMatch: false, score: 0 };
  } else if (call.callType === "peerToPeer") {
    // 1-on-1 call: verify participant coherence
    const otherName = (call.otherParticipantName || "").toLowerCase().trim();
    if (otherName && otherName !== "chamada do teams") {
      const participantNames = meeting.participants.map((p) =>
        p.name.toLowerCase(),
      );
      const participantEmails = meeting.participants
        .map((p) => (p.email || "").toLowerCase())
        .filter(Boolean);
      const matchesParticipant =
        participantNames.some(
          (name) => name.includes(otherName) || otherName.includes(name),
        ) || participantEmails.some((email) => email.includes(otherName));
      const subjectMatches =
        meeting.subject.toLowerCase().includes(otherName) ||
        meeting.title.toLowerCase().includes(otherName);

      if (
        !matchesParticipant &&
        !subjectMatches &&
        meeting.shape !== "one_on_one"
      ) {
        return { isMatch: false, score: 0 };
      }
    }
  }

  // Score based on overlap minutes and start proximity
  const proximityBonus = Math.max(0, 1000 - Math.floor(startDiffMs / 1000));
  return { isMatch: true, score: overlapMinutes * 100 + proximityBonus };
}

/**
 * Fuses calendar meetings with matching Teams call records.
 */
export function fuseMeetingsAndCalls(
  input: FuseMeetingsAndCallsInput,
): FuseMeetingsAndCallsResult {
  const fusedCallIds = new Set<string>();
  const meetingMatches = new Map<
    string,
    { meeting: MeetingSignal; calls: TeamCallSignal[] }
  >();

  // Initialize map with clone of meetings
  for (const meeting of input.meetings) {
    meetingMatches.set(meeting.id, { meeting: { ...meeting }, calls: [] });
  }

  const remainingCalls: TeamCallSignal[] = [];

  // Match each call to the best matching meeting
  for (const call of input.calls) {
    let bestMeetingId: string | null = null;
    let bestScore = 0;

    for (const meeting of input.meetings) {
      const match = evaluateMatch(call, meeting);
      if (match.isMatch && match.score > bestScore) {
        bestScore = match.score;
        bestMeetingId = meeting.id;
      }
    }

    if (bestMeetingId) {
      fusedCallIds.add(call.id);
      meetingMatches.get(bestMeetingId)?.calls.push(call);
    } else {
      remainingCalls.push(call);
    }
  }

  // Enrich matched meetings with measured durations and evidence
  const resultMeetings: MeetingSignal[] = [];

  for (const meeting of input.meetings) {
    const entry = meetingMatches.get(meeting.id);
    const matchedCalls = entry?.calls ?? [];

    if (matchedCalls.length === 0) {
      resultMeetings.push(meeting);
      continue;
    }

    // Merge session intervals from all matched calls
    const allIntervalsMs: IntervalMs[] = matchedCalls.flatMap((c) => {
      if (c.intervals && c.intervals.length > 0) {
        return c.intervals.map((i) => ({
          start: Date.parse(i.startIso),
          end: Date.parse(i.endIso),
        }));
      }
      return [
        {
          start: Date.parse(c.startIso),
          end: Date.parse(c.endIso),
        },
      ];
    });

    const merged = mergeIntervalsMs(allIntervalsMs);
    const totalMeasuredMs = merged.reduce(
      (sum, int) => sum + (int.end - int.start),
      0,
    );
    const measuredMinutes = Math.max(1, Math.floor(totalMeasuredMs / 60_000));

    const meetingStart = Date.parse(meeting.startIso);
    const meetingEnd = Date.parse(meeting.endIso);
    const earliestStart = Math.min(meetingStart, ...merged.map((m) => m.start));
    const latestEnd = Math.max(meetingEnd, ...merged.map((m) => m.end));

    const scheduledMinutes =
      meeting.scheduledMinutes ||
      Math.max(1, Math.round((meetingEnd - meetingStart) / 60_000));

    const updatedMeeting: MeetingSignal = {
      ...meeting,
      minutes: measuredMinutes,
      scheduledMinutes,
      measuredMinutes,
      startIso: new Date(earliestStart).toISOString(),
      endIso: new Date(latestEnd).toISOString(),
      confidence: "high",
      wasClipped: false,
      evidence: formatFusedEvidence(
        meeting.evidence,
        measuredMinutes,
        scheduledMinutes,
      ),
    };

    resultMeetings.push(updatedMeeting);
  }

  return {
    meetings: resultMeetings,
    remainingCalls,
    fusedCallIds,
  };
}
