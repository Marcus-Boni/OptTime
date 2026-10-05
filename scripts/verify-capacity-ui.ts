import { buildCapacityData } from "@/hooks/use-capacity";
import { getReconstructDayCacheKey } from "@/hooks/use-reconstruct-day";
import { getTimesheetWeeklyTargetMinutes } from "@/hooks/use-timesheets";
import { getWeeklyDigestCacheKey } from "@/hooks/use-weekly-digest";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function verifyTimesheetOwnerCapacity(): void {
  const weeklyTarget = getTimesheetWeeklyTargetMinutes({
    periodType: "weekly",
    weeklyCapacity: 30,
  });

  assert(
    weeklyTarget === 30 * 60,
    "weekly timesheet detail must use the owner's configured 30h capacity",
  );

  const monthlyTarget = getTimesheetWeeklyTargetMinutes({
    periodType: "monthly",
    weeklyCapacity: 30,
  });

  assert(
    monthlyTarget === null,
    "non-weekly timesheets must not show a weekly capacity target",
  );
}

function verifyCapacityHookUsesProvidedCapacity(): void {
  const capacity = buildCapacityData(
    [
      {
        date: "2026-10-05",
        totalMinutes: 180,
        billableMinutes: 180,
        entryCount: 1,
      },
      {
        date: "2026-10-06",
        totalMinutes: 240,
        billableMinutes: 240,
        entryCount: 1,
      },
    ],
    new Date("2026-10-05T12:00:00.000Z"),
    20,
  );

  assert(
    capacity.weeklyCapacityMinutes === 20 * 60,
    "weekly capacity data must preserve a 20h profile capacity",
  );
  assert(
    capacity.dailyTargetMinutes === 4 * 60,
    "daily target must derive from 20h weekly capacity as 4h over five workdays",
  );
  assert(
    capacity.dailyLoggedMinutes === 180,
    "daily logged minutes must be selected for the reference date",
  );
  assert(
    capacity.dailyPercentage === 75,
    "daily percentage must compare logged minutes with the derived 4h target",
  );
}

function verifyAiCacheKeysIncludeCapacity(): void {
  const legacyReconstructKey = getReconstructDayCacheKey("2026-10-05");
  const shortDayReconstructKey = getReconstructDayCacheKey("2026-10-05", 20);
  const fullDayReconstructKey = getReconstructDayCacheKey("2026-10-05", 40);

  assert(
    legacyReconstructKey === "plan:2026-10-05",
    "reconstruct cache key must preserve the legacy shape until capacity is passed",
  );
  assert(
    shortDayReconstructKey !== fullDayReconstructKey,
    "reconstruct cache key must split drafts by weekly capacity",
  );
  assert(
    shortDayReconstructKey.endsWith(":capacity:20"),
    "reconstruct cache key must include the 20h capacity dimension",
  );

  const memberDigestKey = getWeeklyDigestCacheKey(
    "2026-W41",
    "member",
    "user-1",
    20,
  );
  const sameUserDifferentCapacityDigestKey = getWeeklyDigestCacheKey(
    "2026-W41",
    "member",
    "user-1",
    40,
  );
  const differentUserDigestKey = getWeeklyDigestCacheKey(
    "2026-W41",
    "member",
    "user-2",
    20,
  );

  assert(
    memberDigestKey !== sameUserDifferentCapacityDigestKey,
    "weekly digest cache key must split summaries by capacity changes",
  );
  assert(
    memberDigestKey !== differentUserDigestKey,
    "weekly digest cache key must split summaries by user",
  );
}

verifyTimesheetOwnerCapacity();
verifyCapacityHookUsesProvidedCapacity();
verifyAiCacheKeysIncludeCapacity();

console.info("[verify-capacity-ui] ok");
