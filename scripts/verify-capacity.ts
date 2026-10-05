import assert from "node:assert/strict";
import {
  dailyTargetMinutes,
  incompleteDayThresholdMinutes,
  overworkDayThresholdMinutes,
  sustainableWeeklyThresholdMinutes,
  weeklyCapacityMinutes,
} from "@/lib/capacity";
import { computeWeekSignals } from "@/lib/gamification/week-signals";

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

console.info("Capacity policy checks passed.");
