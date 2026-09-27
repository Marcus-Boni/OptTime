import assert from "node:assert/strict";
import {
  buildDayCallSignals,
  describeTeamCall,
} from "@/lib/collaboration/calls";
import type { TeamCallSignal } from "@/types/collaboration";

const call: TeamCallSignal = {
  id: "call-one",
  startIso: "2026-09-25T14:00:00Z",
  endIso: "2026-09-25T15:00:00Z",
  minutes: 60,
  otherParticipantName: "Ana",
  callerName: null,
  calleeName: null,
  callType: "peerToPeer",
  mediaTypes: ["audio"],
  intervals: [
    { startIso: "2026-09-25T14:00:00Z", endIso: "2026-09-25T14:07:00Z" },
    { startIso: "2026-09-25T14:05:00Z", endIso: "2026-09-25T14:12:00Z" },
    { startIso: "2026-09-25T14:55:00Z", endIso: "2026-09-25T15:00:00Z" },
  ],
};
const base = {
  calls: [call],
  date: "2026-09-25",
  startIso: "2026-09-25T03:00:00Z",
  endIso: "2026-09-26T03:00:00Z",
  calendar: [],
  existingDescriptions: [],
};
const merged = buildDayCallSignals(base);
assert.equal(
  merged[0].minutes,
  17,
  "merge session overlaps without counting disconnected gaps",
);
assert.equal(buildDayCallSignals({ ...base, calls: [call, call] }).length, 1);
assert.equal(
  buildDayCallSignals({ ...base, calls: [{ ...call, intervals: undefined }] })
    .length,
  0,
  "never infer measured time from the global call span",
);
const clipped = buildDayCallSignals({
  ...base,
  calendar: [
    { startIso: "2026-09-25T14:00:00Z", endIso: "2026-09-25T14:10:00Z" },
  ],
});
assert.equal(
  clipped[0].minutes,
  7,
  "subtract calendar time, keeping measured short calls",
);
assert.equal(clipped[0].wasClipped, true);
const repeated = buildDayCallSignals({
  ...base,
  calls: [call, { ...call, id: "second-device" }],
});
assert.equal(
  repeated.length,
  1,
  "parallel records cannot double count participation",
);
const existingDescriptions = [describeTeamCall(merged[0])];
assert.equal(
  buildDayCallSignals({ ...base, acceptedCallIds: new Set([merged[0].id]) })
    .length,
  0,
  "accepted evidence must stay consumed after description edits",
);
assert.equal(buildDayCallSignals({ ...base, existingDescriptions }).length, 0);
assert.equal(
  buildDayCallSignals({ ...base, existingDescriptions, keepLogged: true })[0]
    .alreadyLogged,
  true,
);
const overnight: TeamCallSignal = {
  ...call,
  id: "overnight",
  startIso: "2026-09-26T02:55:00Z",
  endIso: "2026-09-26T03:05:00Z",
  intervals: [
    { startIso: "2026-09-26T02:55:00Z", endIso: "2026-09-26T03:05:00Z" },
  ],
};
const first = buildDayCallSignals({ ...base, calls: [overnight] });
const second = buildDayCallSignals({
  ...base,
  calls: [overnight],
  date: "2026-09-26",
  startIso: base.endIso,
  endIso: "2026-09-27T03:00:00Z",
});
assert.equal(first[0].minutes, 5);
assert.equal(second[0].minutes, 5);
assert.notEqual(first[0].id, second[0].id);
assert.equal(second[0].date, "2026-09-26");
assert.equal(
  buildDayCallSignals({
    ...base,
    calls: [
      {
        ...call,
        intervals: [
          { startIso: "2026-09-25T14:00:00Z", endIso: "2026-09-25T14:00:59Z" },
        ],
      },
    ],
  }).length,
  0,
);
process.stdout.write("call signal rules OK\n");
