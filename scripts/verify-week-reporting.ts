import assert from "node:assert/strict";
import { summarizeTimesheetWeek } from "@/lib/timesheet-week-status";

const early = new Date("2026-09-30T12:00:00Z");
const late = new Date("2026-10-05T12:00:00Z");
const september = {
  period: "2026-W40@2026-09",
  status: "approved",
  submittedAt: early,
};
const october = {
  period: "2026-W40@2026-10",
  status: "submitted",
  submittedAt: late,
};
const bothMonths = ["2026-09-30", "2026-10-01"];

assert.deepEqual(
  summarizeTimesheetWeek("2026-W40", [september, october], bothMonths),
  {
    status: "submitted",
    submittedAt: late,
  },
);
assert.equal(
  summarizeTimesheetWeek("2026-W40", [september], bothMonths).status,
  "open",
);
assert.equal(
  summarizeTimesheetWeek(
    "2026-W40",
    [september, { ...october, status: "open" }],
    bothMonths,
  ).status,
  "open",
);
assert.equal(
  summarizeTimesheetWeek(
    "2026-W40",
    [september, { ...october, status: "rejected" }],
    bothMonths,
  ).status,
  "rejected",
);
assert.equal(
  summarizeTimesheetWeek(
    "2026-W40",
    [september, { ...october, status: "approved" }],
    bothMonths,
  ).status,
  "approved",
);
assert.equal(
  summarizeTimesheetWeek(
    "2026-W40",
    [september, { ...october, status: "open" }],
    ["2026-09-30"],
  ).status,
  "approved",
);
assert.equal(summarizeTimesheetWeek("2026-W40", [], []).status, null);
assert.equal(
  summarizeTimesheetWeek(
    "2026-W41",
    [{ period: "2026-W41", status: "approved" }],
    ["2026-10-05"],
  ).status,
  "approved",
);
assert.equal(
  summarizeTimesheetWeek(
    "2026-W53",
    [{ period: "2026-W53@2026-12", status: "approved" }],
    ["2026-12-31", "2027-01-01"],
  ).status,
  "open",
);
process.stdout.write(
  "Weekly reports preserve monthly status, empty slices and one closure per ISO week.\n",
);
