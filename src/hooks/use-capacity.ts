"use client";

import { endOfISOWeek, format, startOfISOWeek } from "date-fns";
import { useCallback, useEffect, useState } from "react";
import {
  adjustedDailyTargetMinutes,
  adjustedWeeklyCapacityMinutes,
  capacityPercentage,
  countWeekdayHolidaysInRange,
  dailyTargetMinutes,
} from "@/lib/capacity";
import type { HolidaySummary } from "@/lib/holidays";
import { TIME_ENTRIES_UPDATED_EVENT } from "@/lib/time-events";

interface DaySummary {
  date: string;
  totalMinutes: number;
  billableMinutes: number;
  entryCount: number;
}

interface CapacityData {
  weeklyLoggedMinutes: number;
  weeklyCapacityMinutes: number;
  weeklyPercentage: number;
  dailyLoggedMinutes: number;
  dailyTargetMinutes: number;
  dailyPercentage: number;
  weeklyRemainingMinutes: number;
  dailyRemainingMinutes: number;
  daySummaries: DaySummary[];
  holidays: HolidaySummary[];
  todayHoliday: HolidaySummary | null;
}

interface UseCapacityOptions {
  referenceDate?: Date;
  weeklyCapacityHours?: number;
}

export function buildCapacityData(
  summaries: DaySummary[],
  referenceDate: Date,
  weeklyCapacityHours: number,
  holidays: HolidaySummary[] = [],
): CapacityData {
  const weekStartStr = format(startOfISOWeek(referenceDate), "yyyy-MM-dd");
  const weekEndStr = format(endOfISOWeek(referenceDate), "yyyy-MM-dd");
  const todayStr = format(referenceDate, "yyyy-MM-dd");

  const activeHolidays = holidays.filter((h) => h.isActive !== false);
  const holidayDates = new Set(activeHolidays.map((h) => h.date));
  const todayHoliday = activeHolidays.find((h) => h.date === todayStr) ?? null;

  const weekdayHolidayCount = countWeekdayHolidaysInRange(
    weekStartStr,
    weekEndStr,
    holidayDates,
  );

  const weekTargetMinutes = adjustedWeeklyCapacityMinutes(
    weeklyCapacityHours,
    weekdayHolidayCount,
  );
  const dayTargetMinutes =
    activeHolidays.length > 0
      ? adjustedDailyTargetMinutes(weeklyCapacityHours, todayStr, holidayDates)
      : dailyTargetMinutes(weeklyCapacityHours);

  const weeklyLoggedMinutes = summaries.reduce(
    (sum, summary) => sum + (Number(summary.totalMinutes) || 0),
    0,
  );

  const selectedDaySummary = summaries.find((summary) => {
    const date = typeof summary.date === "string" ? summary.date : "";
    return (date.split("T")[0] ?? date) === todayStr;
  });
  const dailyLoggedMinutes = Number(selectedDaySummary?.totalMinutes) || 0;

  return {
    weeklyLoggedMinutes,
    weeklyCapacityMinutes: weekTargetMinutes,
    weeklyPercentage: capacityPercentage(
      weeklyLoggedMinutes,
      weekTargetMinutes,
    ),
    dailyLoggedMinutes,
    dailyTargetMinutes: dayTargetMinutes,
    dailyPercentage: capacityPercentage(dailyLoggedMinutes, dayTargetMinutes),
    weeklyRemainingMinutes: weekTargetMinutes - weeklyLoggedMinutes,
    dailyRemainingMinutes: dayTargetMinutes - dailyLoggedMinutes,
    daySummaries: summaries,
    holidays: activeHolidays,
    todayHoliday,
  };
}

export function useCapacity({
  referenceDate = new Date(),
  weeklyCapacityHours = 40,
}: UseCapacityOptions = {}) {
  const [data, setData] = useState<CapacityData | null>(null);
  const [loading, setLoading] = useState(true);

  const weekStart = startOfISOWeek(referenceDate);
  const weekEnd = endOfISOWeek(referenceDate);
  const fromStr = format(weekStart, "yyyy-MM-dd");
  const toStr = format(weekEnd, "yyyy-MM-dd");

  const fetchCapacity = useCallback(async () => {
    setLoading(true);

    try {
      const res = await fetch(
        `/api/time-entries/summary?groupBy=day&from=${fromStr}&to=${toStr}`,
        { cache: "no-store" },
      );
      if (!res.ok) {
        throw new Error("Failed to fetch summary");
      }

      const json = (await res.json()) as {
        data?: DaySummary[];
        holidays?: HolidaySummary[];
      };
      const summaries = json.data ?? [];
      const holidays = json.holidays ?? [];
      setData(
        buildCapacityData(
          summaries,
          referenceDate,
          weeklyCapacityHours,
          holidays,
        ),
      );
    } catch {
      setData(buildCapacityData([], referenceDate, weeklyCapacityHours, []));
    } finally {
      setLoading(false);
    }
  }, [fromStr, referenceDate, toStr, weeklyCapacityHours]);

  useEffect(() => {
    fetchCapacity();
  }, [fetchCapacity]);

  useEffect(() => {
    const handleUpdated = () => {
      void fetchCapacity();
    };

    window.addEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
    return () => {
      window.removeEventListener(TIME_ENTRIES_UPDATED_EVENT, handleUpdated);
    };
  }, [fetchCapacity]);

  return { capacity: data, loading, refetch: fetchCapacity };
}
