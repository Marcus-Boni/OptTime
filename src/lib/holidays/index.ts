export {
  addCalendarDays,
  buildFallbackNationalHolidays,
  buildVilaVelhaHolidays,
  computeEasterSunday,
  getHolidayScopeLabel,
  mergeHolidaySeeds,
} from "@/lib/holidays/calendar-rules";
export type {
  HolidayScope,
  HolidaySeedItem,
  HolidaySource,
  HolidaySummary,
  SyncHolidaysResult,
} from "@/lib/holidays/types";
