import { getWeekSegments } from "@/lib/timesheet-periods";

type WeeklyStatus = "open" | "submitted" | "approved" | "rejected";

interface WeeklySheet {
  period: string;
  status: string;
  submittedAt?: Date | null;
}

/** Report a week once; empty monthly slices do not hold populated slices open. */
export function summarizeTimesheetWeek(
  period: string,
  sheets: readonly WeeklySheet[],
  entryDates: readonly string[],
): { status: WeeklyStatus | null; submittedAt: Date | null } {
  const segments = getWeekSegments(period);
  const sheetByPeriod = new Map(sheets.map((sheet) => [sheet.period, sheet]));
  const populated = segments.filter((segment) =>
    entryDates.some((date) => date >= segment.start && date <= segment.end),
  );
  const relevant =
    populated.length > 0
      ? populated
      : segments.filter((segment) => sheetByPeriod.has(segment.period));
  if (relevant.length === 0) return { status: null, submittedAt: null };

  const records = relevant.map((segment) => sheetByPeriod.get(segment.period));
  const status: WeeklyStatus = records.some(
    (sheet) => sheet?.status === "rejected",
  )
    ? "rejected"
    : records.some(
          (sheet) =>
            sheet?.status !== "submitted" && sheet?.status !== "approved",
        )
      ? "open"
      : records.every((sheet) => sheet?.status === "approved")
        ? "approved"
        : "submitted";
  const submissionDates = records.flatMap((sheet) =>
    sheet?.submittedAt ? [sheet.submittedAt] : [],
  );
  return {
    status,
    submittedAt:
      (status === "submitted" || status === "approved") &&
      submissionDates.length > 0
        ? new Date(Math.max(...submissionDates.map((date) => date.getTime())))
        : null,
  };
}
