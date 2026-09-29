import assert from "node:assert/strict";
import { buildDayCallSignals } from "@/lib/collaboration/calls";
import {
  extractTeamsMeetingKey,
  fuseMeetingsAndCalls,
} from "@/lib/collaboration/fusion";
import type { MeetingSignal, TeamCallSignal } from "@/types/collaboration";

// ─── Test 1: extractTeamsMeetingKey ───
const url1 =
  "https://teams.microsoft.com/l/meetup-join/19%3ameeting_NzY4OTY1M2QtNDI4OS00OTk0LWEwZDgtZTFmNTA3NDAwZDNm%40thread.v2/0?context=%7b%22Tid%22%3a%22123%22%7d";
const url2 =
  "https://teams.microsoft.com/l/meetup-join/19:meeting_NzY4OTY1M2QtNDI4OS00OTk0LWEwZDgtZTFmNTA3NDAwZDNm@thread.v2/0?context=%7b%22Tid%22%3a%22456%22%7d";

assert.equal(
  extractTeamsMeetingKey(url1),
  "19:meeting_nzy4oty1m2qtndi4os00otk0lwewzdgtztfmnta3ndawzdnm@thread.v2",
);
assert.equal(
  extractTeamsMeetingKey(url1),
  extractTeamsMeetingKey(url2),
  "thread keys must match regardless of URL encoding and context params",
);

// ─── Test 2: User's real scenario: Cidade Engenharia meeting (11:00-11:30) & Call (10:59-11:37) ───
const meetingCidade: MeetingSignal = {
  id: "meeting-cidade",
  seriesId: null,
  title: "CIDADE ENGENHARIA - Validação Previsão de Entregas",
  subject: "CIDADE ENGENHARIA - Validação Previsão de Entregas",
  startIso: "2026-09-28T14:00:00.000Z", // 11:00 BRT
  endIso: "2026-09-28T14:30:00.000Z", // 11:30 BRT
  minutes: 30,
  scheduledMinutes: 30,
  participants: [
    {
      name: "Júnio Inácio Rosa",
      email: "junio@optsolv.com.br",
      isExternal: false,
      isOptional: false,
    },
    {
      name: "Eva",
      email: "eva@optsolv.com.br",
      isExternal: false,
      isOptional: false,
    },
    {
      name: "Tatiana Lima",
      email: "tatiana@optsolv.com.br",
      isExternal: false,
      isOptional: false,
    },
  ],
  participantCount: 3,
  externalCount: 0,
  acceptance: "accepted",
  shape: "small_group",
  isOnline: true,
  joinWebUrl: url1,
  isOrganizer: false,
  isRecurring: false,
  isException: false,
  wasRescheduled: false,
  originalStartIso: null,
  wasClipped: false,
  alreadyLogged: false,
  confidence: "medium",
  evidence: "Reunião com 3 pessoas no Teams.",
};

const callCidade: TeamCallSignal = {
  id: "call-cidade",
  date: "2026-09-28",
  startIso: "2026-09-28T13:59:00.000Z", // 10:59 BRT
  endIso: "2026-09-28T14:37:26.000Z", // 11:37 BRT
  minutes: 38,
  otherParticipantName: "Chamada do Teams",
  callerName: "Júnio Inácio Rosa",
  calleeName: null,
  callType: "groupCall",
  mediaTypes: ["audio", "video"],
  joinWebUrl: url2,
  intervals: [
    {
      startIso: "2026-09-28T13:59:00.000Z",
      endIso: "2026-09-28T14:37:26.000Z",
    },
  ],
};

const callJunioAdHoc: TeamCallSignal = {
  id: "call-junio",
  date: "2026-09-28",
  startIso: "2026-09-28T12:49:00.000Z", // 09:49 BRT
  endIso: "2026-09-28T13:58:00.000Z", // 10:58 BRT
  minutes: 69,
  otherParticipantName: "Júnio Inácio Rosa",
  callerName: "Júnio Inácio Rosa",
  calleeName: "Marcus Boni",
  callType: "peerToPeer",
  mediaTypes: ["audio"],
  intervals: [
    {
      startIso: "2026-09-28T12:49:00.000Z",
      endIso: "2026-09-28T13:58:00.000Z",
    },
  ],
};

const fusionResult = fuseMeetingsAndCalls({
  meetings: [meetingCidade],
  calls: [callJunioAdHoc, callCidade],
});

// The Cidade Engenharia meeting must absorb the call and update to 38 minutes!
assert.equal(fusionResult.meetings.length, 1);
const fused = fusionResult.meetings[0];
assert.equal(
  fused.minutes,
  38,
  "meeting minutes updated to 38 min measured duration",
);
assert.equal(fused.scheduledMinutes, 30, "scheduled minutes preserved as 30");
assert.equal(fused.measuredMinutes, 38);
assert.equal(fused.confidence, "high");
assert.match(fused.evidence, /Duração real medida no Teams: 38 min/);
assert.match(fused.evidence, /\+8 min além do agendado/);

// The Cidade call must be absorbed, while the ad-hoc call with Júnio must remain
assert.equal(fusionResult.fusedCallIds.has("call-cidade"), true);
assert.equal(fusionResult.fusedCallIds.has("call-junio"), false);
assert.equal(fusionResult.remainingCalls.length, 1);
assert.equal(fusionResult.remainingCalls[0].id, "call-junio");

// Verify that building day call signals on the remaining calls does NOT produce any 7-min call!
const dayCalls = buildDayCallSignals({
  calls: fusionResult.remainingCalls,
  date: "2026-09-28",
  startIso: "2026-09-28T03:00:00.000Z",
  endIso: "2026-09-29T03:00:00.000Z",
  calendar: [{ startIso: fused.startIso, endIso: fused.endIso }],
  existingDescriptions: [],
});

assert.equal(dayCalls.length, 1);
assert.equal(dayCalls[0].otherParticipantName, "Júnio Inácio Rosa");
assert.equal(dayCalls[0].minutes, 69);
assert.ok(
  !dayCalls.some((c) => c.minutes === 7 || c.callType === "groupCall"),
  "phantom 7-minute call is completely gone",
);

// ─── Test 3: Temporal match without joinWebUrl ───
const meetingWithoutUrl: MeetingSignal = {
  ...meetingCidade,
  id: "meeting-no-url",
  joinWebUrl: null,
};
const callWithoutUrl: TeamCallSignal = {
  ...callCidade,
  id: "call-no-url",
  joinWebUrl: null,
};

const temporalFusion = fuseMeetingsAndCalls({
  meetings: [meetingWithoutUrl],
  calls: [callWithoutUrl],
});

assert.equal(
  temporalFusion.meetings[0].minutes,
  38,
  "fuses by temporal overlap when URL is absent",
);
assert.equal(temporalFusion.fusedCallIds.has("call-no-url"), true);
assert.equal(temporalFusion.remainingCalls.length, 0);

// ─── Test 4: Already logged meeting absorbs call ───
const loggedMeeting: MeetingSignal = {
  ...meetingCidade,
  id: "meeting-logged",
  alreadyLogged: true,
};

const loggedFusion = fuseMeetingsAndCalls({
  meetings: [loggedMeeting],
  calls: [callCidade],
});

assert.equal(loggedFusion.fusedCallIds.has("call-cidade"), true);
assert.equal(loggedFusion.remainingCalls.length, 0);
assert.equal(loggedFusion.meetings[0].alreadyLogged, true);

process.stdout.write("smart fusion rules OK\n");
