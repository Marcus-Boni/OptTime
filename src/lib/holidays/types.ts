export type HolidayScope = "national" | "state" | "municipal" | "bridge";
export type HolidaySource = "brasilapi" | "local_rule" | "manual";

export interface HolidaySummary {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  name: string;
  scope: HolidayScope;
  stateCode: string | null;
  cityName: string | null;
  source: HolidaySource;
  isActive: boolean;
}

export interface HolidaySeedItem {
  /** YYYY-MM-DD */
  date: string;
  name: string;
  scope: HolidayScope;
  stateCode: string | null;
  cityName: string | null;
  source: HolidaySource;
}

export interface SyncHolidaysResult {
  year: number;
  total: number;
  nationalCount: number;
  localCount: number;
  provider: "brasilapi" | "fallback";
  holidays: HolidaySummary[];
}
