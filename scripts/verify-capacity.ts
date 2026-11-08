import assert from "node:assert/strict";
import {
  adjustedDailyTargetMinutes,
  adjustedWeeklyCapacityMinutes,
  countWeekdayHolidaysInRange,
  dailyTargetMinutes,
  incompleteDayThresholdMinutes,
  overworkDayThresholdMinutes,
  sustainableWeeklyThresholdMinutes,
  weeklyCapacityMinutes,
} from "@/lib/capacity";
import { computeWeekSignals } from "@/lib/gamification/week-signals";
import {
  buildFallbackNationalHolidays,
  buildVilaVelhaHolidays,
  computeEasterSunday,
} from "@/lib/holidays";

function entry(date: string, duration: number) {
  return {
    date,
    duration,
    description: "Implementacao com descricao rastreavel",
  };
}

assert.equal(weeklyCapacityMinutes(20), 1_200);
assert.equal(weeklyCapacityMinutes(30), 1_800);
assert.equal(weeklyCapacityMinutes(40), 2_400);

assert.equal(dailyTargetMinutes(20), 240);
assert.equal(dailyTargetMinutes(30), 360);
assert.equal(dailyTargetMinutes(40), 480);

assert.equal(incompleteDayThresholdMinutes(20), 180);
assert.equal(incompleteDayThresholdMinutes(30), 270);
assert.equal(incompleteDayThresholdMinutes(40), 360);

assert.equal(overworkDayThresholdMinutes(20), 300);
assert.equal(overworkDayThresholdMinutes(30), 450);
assert.equal(overworkDayThresholdMinutes(40), 600);

assert.equal(sustainableWeeklyThresholdMinutes(20), 1_350);
assert.equal(sustainableWeeklyThresholdMinutes(30), 2_025);
assert.equal(sustainableWeeklyThresholdMinutes(40), 2_700);

const balancedTwentyHourWeek = computeWeekSignals(
  "2026-W40",
  "2026-09-28",
  "2026-10-04",
  [
    entry("2026-09-28", 240),
    entry("2026-09-29", 240),
    entry("2026-09-30", 240),
    entry("2026-10-01", 240),
    entry("2026-10-02", 240),
  ],
  20,
);
assert.equal(balancedTwentyHourWeek.isBalanced, true);

const overloadedTwentyHourDay = computeWeekSignals(
  "2026-W40",
  "2026-09-28",
  "2026-10-04",
  [
    entry("2026-09-28", 360),
    entry("2026-09-29", 240),
    entry("2026-09-30", 240),
    entry("2026-10-01", 240),
    entry("2026-10-02", 240),
  ],
  20,
);
assert.equal(overloadedTwentyHourDay.overworkedDays, 1);
assert.equal(overloadedTwentyHourDay.isBalanced, false);

const heavyTwentyHourWeek = computeWeekSignals(
  "2026-W40",
  "2026-09-28",
  "2026-10-04",
  [
    entry("2026-09-28", 300),
    entry("2026-09-29", 300),
    entry("2026-09-30", 300),
    entry("2026-10-01", 300),
    entry("2026-10-02", 180),
  ],
  20,
);
assert.equal(heavyTwentyHourWeek.overworkedDays, 0);
assert.equal(heavyTwentyHourWeek.isBalanced, false);

// Holiday-aware capacity & Vila Velha/ES calendar checks
assert.equal(computeEasterSunday(2026), "2026-04-05");
const vv2026 = buildVilaVelhaHolidays(2026);
assert.equal(
  vv2026.some((h) => h.date === "2026-04-13" && h.scope === "state"),
  true,
  "Nossa Senhora da Penha (Easter + 8 days) must be generated for ES/Vila Velha",
);
assert.equal(
  vv2026.some((h) => h.date === "2026-05-23" && h.scope === "municipal"),
  true,
  "Colonização do Solo Espírito-Santense (23/05) must be generated for Vila Velha",
);

const national2026 = buildFallbackNationalHolidays(2026);
assert.equal(
  national2026.some((h) => h.date === "2026-11-02" && h.name === "Finados"),
  true,
  "Finados (02/11) must be present in national holidays",
);

const finadosSet = new Set(["2026-11-02"]);
assert.equal(
  countWeekdayHolidaysInRange("2026-11-02", "2026-11-08", finadosSet),
  1,
);
assert.equal(adjustedWeeklyCapacityMinutes(40, 1), 32 * 60);
assert.equal(adjustedDailyTargetMinutes(40, "2026-11-02", finadosSet), 0);
assert.equal(adjustedDailyTargetMinutes(40, "2026-11-03", finadosSet), 8 * 60);

const finadosWeekSignals = computeWeekSignals(
  "2026-W45",
  "2026-11-02",
  "2026-11-08",
  [
    entry("2026-11-03", 480),
    entry("2026-11-04", 480),
    entry("2026-11-05", 480),
    entry("2026-11-06", 480),
  ],
  40,
  finadosSet,
);
assert.equal(finadosWeekSignals.businessDaysInPeriod, 4);
assert.equal(finadosWeekSignals.isConsistent, true);

console.info("Capacity policy checks passed.");
