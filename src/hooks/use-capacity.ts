"use client";

import { endOfISOWeek, format, startOfISOWeek } from "date-fns";
import { useCallback, useEffect, useState } from "react";
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
}

interface UseCapacityOptions {
  referenceDate?: Date;
  weeklyCapacityHours?: number;
}

function buildCapacityData(
  summaries: DaySummary[],
  referenceDate: Date,
  weeklyCapacityHours: number,
): CapacityData {
  const weeklyCapacityMinutes = weeklyCapacityHours * 60;
  const dailyTargetMinutes = Math.round(weeklyCapacityMinutes / 5);
  const todayStr = format(referenceDate, "yyyy-MM-dd");

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
    weeklyCapacityMinutes,
    weeklyPercentage:
      weeklyCapacityMinutes > 0
        ? Math.round((weeklyLoggedMinutes / weeklyCapacityMinutes) * 100)
        : 0,
    dailyLoggedMinutes,
    dailyTargetMinutes,
    dailyPercentage:
      dailyTargetMinutes > 0
        ? Math.round((dailyLoggedMinutes / dailyTargetMinutes) * 100)
        : 0,
    weeklyRemainingMinutes: weeklyCapacityMinutes - weeklyLoggedMinutes,
    dailyRemainingMinutes: dailyTargetMinutes - dailyLoggedMinutes,
    daySummaries: summaries,
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

      const json = (await res.json()) as { data?: DaySummary[] };
      const summaries = json.data ?? [];
      setData(buildCapacityData(summaries, referenceDate, weeklyCapacityHours));
    } catch {
      setData(buildCapacityData([], referenceDate, weeklyCapacityHours));
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
