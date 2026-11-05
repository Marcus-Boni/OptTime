import assert from "node:assert/strict";
import {
  formatPeriodRangeLabel,
  getBaseWeekPeriod,
  getPeriodCompetence,
  getPeriodCompetenceLabel,
  getPeriodWeekNumber,
  getTimesheetPeriodForDate,
  getTimesheetPeriodLabel,
  getTimesheetPeriodsForWeek,
  getWeekSegments,
  isCanonicalTimesheetPeriod,
  isPeriodOpenAfter,
  isSplitPeriod,
} from "@/lib/timesheet-periods";
import { getPeriodRange, getWeekPeriod } from "@/lib/utils";

process.stdout.write("Starting split weeks verification...\n");

// 1. Normal week inside single month (Week 41 of 2026: Oct 5 - Oct 11)
{
  const w41 = "2026-W41";
  const segments = getWeekSegments(w41);
  assert.equal(segments.length, 1);
  assert.equal(segments[0].period, "2026-W41");
  assert.equal(segments[0].start, "2026-10-05");
  assert.equal(segments[0].end, "2026-10-11");
  assert.equal(segments[0].competence, "2026-10");
  assert.equal(segments[0].isSplit, false);

  assert.equal(isCanonicalTimesheetPeriod("2026-W41", "weekly"), true);
  assert.equal(isSplitPeriod("2026-W41"), false);
  assert.equal(getBaseWeekPeriod("2026-W41"), "2026-W41");
  assert.equal(getPeriodCompetence("2026-W41"), null);
  assert.equal(getPeriodWeekNumber("2026-W41"), "41");
  assert.equal(getTimesheetPeriodForDate("2026-10-08"), "2026-W41");
}

// 2. Split week crossing month boundary (Week 40 of 2026: Sep 28 - Oct 4)
{
  const w40 = "2026-W40";
  const segments = getWeekSegments(w40);
  assert.equal(segments.length, 2);

  // Segment A: Sep 28 - Sep 30
  assert.equal(segments[0].period, "2026-W40@2026-09");
  assert.equal(segments[0].start, "2026-09-28");
  assert.equal(segments[0].end, "2026-09-30");
  assert.equal(segments[0].competence, "2026-09");
  assert.equal(segments[0].isSplit, true);

  // Segment B: Oct 1 - Oct 4
  assert.equal(segments[1].period, "2026-W40@2026-10");
  assert.equal(segments[1].start, "2026-10-01");
  assert.equal(segments[1].end, "2026-10-04");
  assert.equal(segments[1].competence, "2026-10");
  assert.equal(segments[1].isSplit, true);

  // Canonical validity: bare "2026-W40" is NOT canonical because it spans 2 months
  assert.equal(isCanonicalTimesheetPeriod("2026-W40", "weekly"), false);
  assert.equal(isCanonicalTimesheetPeriod("2026-W40@2026-09", "weekly"), true);
  assert.equal(isCanonicalTimesheetPeriod("2026-W40@2026-10", "weekly"), true);
  assert.equal(isCanonicalTimesheetPeriod("2026-W40@2026-11", "weekly"), false);

  // Segment retrieval by date
  assert.equal(getTimesheetPeriodForDate("2026-09-28"), "2026-W40@2026-09");
  assert.equal(getTimesheetPeriodForDate("2026-09-30"), "2026-W40@2026-09");
  assert.equal(getTimesheetPeriodForDate("2026-10-01"), "2026-W40@2026-10");
  assert.equal(getTimesheetPeriodForDate("2026-10-04"), "2026-W40@2026-10");

  // Base week period & competence extraction
  assert.equal(getBaseWeekPeriod("2026-W40@2026-09"), "2026-W40");
  assert.equal(getBaseWeekPeriod("2026-W40@2026-10"), "2026-W40");
  assert.equal(getPeriodCompetence("2026-W40@2026-09"), "2026-09");
  assert.equal(getPeriodCompetence("2026-W40@2026-10"), "2026-10");
  assert.equal(isSplitPeriod("2026-W40@2026-09"), true);

  // Period ranges via getPeriodRange
  const rangeA = getPeriodRange("2026-W40@2026-09", "weekly");
  assert.equal(rangeA.start, "2026-09-28");
  assert.equal(rangeA.end, "2026-09-30");

  const rangeB = getPeriodRange("2026-W40@2026-10", "weekly");
  assert.equal(rangeB.start, "2026-10-01");
  assert.equal(rangeB.end, "2026-10-04");

  // Periods for week
  const periodsForWeek = getTimesheetPeriodsForWeek("2026-W40");
  assert.deepEqual(periodsForWeek, ["2026-W40@2026-09", "2026-W40@2026-10"]);
}

// 3. Year transition (Week 53 of 2026 / Week 01 of 2027)
{
  // 2026-12-31 is Thursday, 2027-01-01 is Friday. ISO week 2026-W53 runs Dec 28 2026 - Jan 3 2027
  const w53 = getWeekPeriod("2026-12-30");
  const segments = getWeekSegments(w53);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].competence, "2026-12");
  assert.equal(segments[0].start, "2026-12-28");
  assert.equal(segments[0].end, "2026-12-31");
  assert.equal(segments[1].competence, "2027-01");
  assert.equal(segments[1].start, "2027-01-01");
  assert.equal(segments[1].end, "2027-01-03");
}

// 4. Leap year transition (February 2028: leap year, Feb has 29 days)
{
  // 2028-02-29 is Tuesday, 2028-03-01 is Wednesday.
  const leapWeek = getWeekPeriod("2028-02-29");
  const segments = getWeekSegments(leapWeek);
  assert.equal(segments.length, 2);
  assert.equal(segments[0].competence, "2028-02");
  assert.equal(segments[0].start, "2028-02-28");
  assert.equal(segments[0].end, "2028-02-29");
  assert.equal(segments[1].competence, "2028-03");
  assert.equal(segments[1].start, "2028-03-01");
  assert.equal(segments[1].end, "2028-03-05");
}

// 5. Future period checking (isPeriodOpenAfter)
{
  const today = "2026-09-30";
  // If today is 2026-09-30:
  // 2026-W40@2026-09 ends on 2026-09-30 -> NOT open after today
  assert.equal(isPeriodOpenAfter("2026-W40@2026-09", "weekly", today), false);
  // 2026-W40@2026-10 ends on 2026-10-04 -> IS open after today
  assert.equal(isPeriodOpenAfter("2026-W40@2026-10", "weekly", today), true);
  // If whole week was approved on 2026-09-30, it would have blocked days up to 2026-10-04!
}

// 6. Labels formatting
{
  const labelA = getTimesheetPeriodLabel("2026-W40@2026-09", "weekly");
  assert.ok(labelA.includes("Semana 40"));
  assert.ok(labelA.includes("28") && labelA.includes("30"));

  const labelB = getTimesheetPeriodLabel("2026-W40@2026-10", "weekly");
  assert.ok(labelB.includes("Semana 40"));
  assert.ok(labelB.includes("1") && labelB.includes("4"));

  const labelNormal = getTimesheetPeriodLabel("2026-W41", "weekly");
  assert.ok(labelNormal.includes("Semana 41"));
  assert.equal(
    formatPeriodRangeLabel("2026-09-28", "2026-09-30"),
    "28–30 de set",
  );
  assert.equal(getPeriodCompetenceLabel("2026-W40@2026-10"), "out");
}

// Invalid calendar periods must never become storage keys.
for (const period of [
  "2026-W00",
  "2026-W54",
  "2027-W53",
  "2026-W99",
  "2026-W40@2026-13",
  "2026-W40@2026-10@extra",
]) {
  assert.equal(isCanonicalTimesheetPeriod(period, "weekly"), false, period);
}
assert.equal(isCanonicalTimesheetPeriod("2026-13", "monthly"), false);
assert.equal(isCanonicalTimesheetPeriod("2026-00", "monthly"), false);
assert.equal(isCanonicalTimesheetPeriod("2026-11", "monthly"), true);

process.stdout.write("All split weeks tests passed successfully!\n");
