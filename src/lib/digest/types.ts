import type { AppRole } from "@/lib/access-control";
import type { ProviderName } from "@/lib/ai/types";

export type DigestAudience = "member" | "manager";

/**
 * Kind of work an entry represents.
 *
 * Inferred from the entry description and linked work-item title by keyword,
 * because entries do not store an Azure DevOps work-item type. Always presented
 * to the user as an estimate.
 */
export type WorkCategory =
  | "feature"
  | "bugfix"
  | "refactor"
  | "meeting"
  | "docs"
  | "support"
  | "other";

export interface DigestProjectSlice {
  projectId: string;
  name: string;
  code: string;
  color: string;
  minutes: number;
  percentage: number;
}

export interface DigestDaySlice {
  date: string;
  weekday: string;
  minutes: number;
  isWeekend: boolean;
}

export interface DigestCategorySlice {
  category: WorkCategory;
  label: string;
  minutes: number;
  percentage: number;
}

export interface DigestPeriod {
  /** ISO week, e.g. "2026-W32". */
  period: string;
  from: string;
  to: string;
  label: string;
}

export interface MemberDigest {
  audience: "member";
  userId: string;
  userName: string;
  email: string;
  role: AppRole;
  period: DigestPeriod;
  totalMinutes: number;
  previousTotalMinutes: number;
  /** Positive means the user logged more than the week before. */
  deltaMinutes: number;
  deltaPercentage: number | null;
  billableMinutes: number;
  targetMinutes: number;
  entryCount: number;
  projects: DigestProjectSlice[];
  days: DigestDaySlice[];
  categories: DigestCategorySlice[];
  mostProductiveDay: { date: string; weekday: string; minutes: number } | null;
  /** Weekly timesheet state at generation time. */
  timesheetStatus: "open" | "submitted" | "approved" | "rejected";
  /** Business days below 6h. */
  incompleteDays: number;
}

export interface DigestTeamMember {
  userId: string;
  name: string;
  minutes: number;
  targetMinutes: number;
  timesheetStatus: "open" | "submitted" | "approved" | "rejected";
}

export interface ManagerDigest {
  audience: "manager";
  userId: string;
  userName: string;
  email: string;
  role: AppRole;
  period: DigestPeriod;
  teamTotalMinutes: number;
  teamTargetMinutes: number;
  memberCount: number;
  activeMemberCount: number;
  projects: DigestProjectSlice[];
  members: DigestTeamMember[];
  approvals: {
    approved: number;
    submitted: number;
    rejected: number;
    notSubmitted: number;
  };
  /** Members who logged less than 60% of their target. */
  underloaded: DigestTeamMember[];
  /** Members above 110% of their target. */
  overloaded: DigestTeamMember[];
}

export type Digest = MemberDigest | ManagerDigest;

export interface DigestNarrative {
  /** 2–4 short paragraphs in pt-BR. */
  text: string;
  /** Which provider wrote it, or "deterministic" for the offline fallback. */
  provider: ProviderName | "deterministic";
}

export interface DigestBundle {
  digest: Digest;
  narrative: DigestNarrative;
}
