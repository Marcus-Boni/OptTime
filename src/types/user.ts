/** ARCH: User roles determine access levels across the application */
export type UserRole = "member" | "manager" | "admin";
export type TimeViewPreference = "day" | "week" | "month";
export type TimeSubmitModePreference = "close" | "continue";

export interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  role: UserRole;
  department?: string;
  jobTitle?: string;
  officeLocation?: string;
  microsoftSyncedAt?: Date | string | null;
  managerId?: string;
  /** Hourly rate for cost calculations — visible to managers only */
  hourlyRate?: number;
  /** Azure AD Object ID for SSO integration */
  azureId?: string;
  /** Expected weekly hours (default: 40) */
  weeklyCapacity: number;
  /** Preferred default time workspace view */
  timeDefaultView: TimeViewPreference;
  /** Preferred default duration for new entries, in minutes */
  timeDefaultDuration: number;
  /** Preferred behavior after saving a time entry */
  timeSubmitMode: TimeSubmitModePreference;
  /** Preferred billable flag for new entries */
  timeDefaultBillable: boolean;
  /** Whether assistant suggestions should be enabled in time workspace */
  timeAssistantEnabled: boolean;
  /** Whether Outlook drawer should open by default */
  timeOutlookDefaultOpen: boolean;
  /** Whether weekends should be visible in time views */
  timeShowWeekends: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Minimal user info for display in lists and cards */
export interface UserSummary {
  id: string;
  name: string;
  email: string;
  image?: string;
  role: UserRole;
  jobTitle?: string;
  department?: string;
}
