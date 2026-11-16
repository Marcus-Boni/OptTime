import assert from "node:assert/strict";
import { AgentError } from "@/lib/mcp/errors";
import {
  resolveEntryDate,
  resolveLookupDate,
  resolveWeekPeriod,
} from "@/lib/mcp/format";
import { getTimesheetPeriodForDate } from "@/lib/timesheet-periods";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";

assert.equal(resolveWeekPeriod("2026-W41"), "2026-W41");
assert.equal(resolveWeekPeriod("2026-w1@2026-01"), "2026-W01@2026-01");
assert.equal(resolveWeekPeriod("2026-W40@2026-09"), "2026-W40@2026-09");
assert.equal(resolveWeekPeriod("2026-W40@2026-10"), "2026-W40@2026-10");
assert.equal(resolveWeekPeriod("2026-09-30"), "2026-W40@2026-09");
assert.equal(resolveWeekPeriod("2026-10-01"), "2026-W40@2026-10");
assert.equal(resolveWeekPeriod("2026-12-31"), "2026-W53@2026-12");
assert.equal(resolveWeekPeriod("2027-01-01"), "2026-W53@2027-01");

const current = getTimesheetPeriodForDate(todayInAppTimeZone());
assert.equal(resolveWeekPeriod(undefined), current);
assert.equal(resolveWeekPeriod("atual"), current);
assert.equal(
  resolveWeekPeriod("semana passada"),
  getTimesheetPeriodForDate(shiftDay(todayInAppTimeZone(), -7)),
);

const today = todayInAppTimeZone();
for (const date of [
  shiftDay(today, -90),
  shiftDay(today, -190),
  "2000-01-01",
]) {
  assert.equal(resolveEntryDate(date), date);
  assert.equal(resolveLookupDate(date), date);
}
for (const date of ["2026-02-30", "31/12/2026", shiftDay(today, 1)]) {
  assert.throws(
    () => resolveEntryDate(date),
    (error: unknown) =>
      error instanceof AgentError && error.code === "VALIDATION_ERROR",
  );
}

assert.throws(
  () => resolveWeekPeriod("2026-W40"),
  (error: unknown) => {
    assert.ok(error instanceof AgentError);
    assert.equal(error.code, "VALIDATION_ERROR");
    assert.deepEqual(error.details, {
      periods: ["2026-W40@2026-09", "2026-W40@2026-10"],
    });
    assert.ok(error.hint?.includes("2026-W40@2026-10"));
    return true;
  },
);
for (const period of [
  "2026-W40@2026-11",
  "2026-W41@2026-10",
  "2025-W53",
  "2026-W54",
  "2026-W40@2026-09@extra",
  "2026-02-30",
]) {
  assert.throws(
    () => resolveWeekPeriod(period),
    (error: unknown) =>
      error instanceof AgentError && error.code === "VALIDATION_ERROR",
    period,
  );
}

process.stdout.write(
  "MCP: seleção de competência, datas históricas e validação de datas verificadas.\n",
);
