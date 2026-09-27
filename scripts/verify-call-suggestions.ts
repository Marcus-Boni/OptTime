import assert from "node:assert/strict";
import { buildDeterministicSuggestions } from "@/lib/time-assistant/engine";
import type { TeamCallSignal } from "@/types/collaboration";

const call: TeamCallSignal = {
  id: "call-one:2026-09-25",
  date: "2026-09-25",
  startIso: "2026-09-25T14:00:00.000Z",
  endIso: "2026-09-25T14:02:00.000Z",
  minutes: 2,
  otherParticipantName: "Ana Silva",
  callerName: "Mario",
  calleeName: "Ana Silva",
  callType: "peerToPeer",
  mediaTypes: ["audio"],
  description: "Chamada Teams: Ana Silva (11:00)",
};

const base = {
  date: "2026-09-25",
  commits: [],
  meetings: [],
  projects: [
    {
      id: "project-1",
      name: "Implantação ERP",
      billable: true,
      azureProjectId: null,
    },
  ],
  recentEntries: [],
  existingEntries: [],
};

const withCall = buildDeterministicSuggestions({
  ...base,
  calls: [call],
});

assert.equal(withCall.length, 1);
assert.equal(withCall[0]?.duration, 2, "call duration remains exact");
assert.equal(withCall[0]?.projectId, null, "call does not infer a project");
assert.equal(withCall[0]?.projectName, null);
assert.equal(
  withCall[0]?.payload,
  null,
  "call requires explicit project selection",
);
assert.equal(withCall[0]?.sourceBreakdown.calls, 1);
assert.equal(withCall[0]?.sourceBreakdown.meetings, 0);
assert.equal(withCall[0]?.fingerprint, "teams_call:call-one:2026-09-25");
assert.match(
  withCall[0]?.reasons.join(" ") ?? "",
  /Participação medida no Teams/,
);
assert.match(withCall[0]?.reasons.join(" ") ?? "", /não infere projeto/);

const duplicateDescription = buildDeterministicSuggestions({
  ...base,
  calls: [call],
  existingEntries: [
    {
      date: "2026-09-25",
      projectId: "project-1",
      projectName: "Implantação ERP",
      duration: 2,
      azureWorkItemId: null,
      description: call.description ?? "",
    },
  ],
});
assert.equal(
  duplicateDescription.length,
  0,
  "existing call description dedupes",
);

const alreadyLogged = buildDeterministicSuggestions({
  ...base,
  calls: [{ ...call, alreadyLogged: true }],
});
assert.equal(alreadyLogged.length, 0, "already logged calls are skipped");
assert.equal(
  buildDeterministicSuggestions({
    ...base,
    calls: [call, { ...call, id: "different-call" }],
  }).length,
  2,
  "distinct call IDs survive similar display descriptions",
);
assert.equal(
  buildDeterministicSuggestions({ ...base, calls: [call, call] }).length,
  1,
  "the same call ID is still deduplicated",
);

const legacyMeeting = buildDeterministicSuggestions({
  ...base,
  meetings: [
    {
      id: "meeting-1",
      subject: "Daily Implantação ERP",
      startDateTime: "2026-09-25T12:00:00.000Z",
      endDateTime: "2026-09-25T12:30:00.000Z",
      durationMinutes: 30,
    },
  ],
});
assert.equal(legacyMeeting.length, 1, "legacy meeting suggestions still work");
assert.equal(legacyMeeting[0]?.sourceBreakdown.meetings, 1);
assert.equal(legacyMeeting[0]?.sourceBreakdown.calls, undefined);
assert.equal(legacyMeeting[0]?.duration, 30);

process.stdout.write("call suggestion rules OK\n");
