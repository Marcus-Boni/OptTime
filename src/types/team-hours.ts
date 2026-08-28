/**
 * Contracts shared between the team-hours API routes and the client.
 *
 * The screen is split in three payloads on purpose: aggregates never travel
 * row by row, the detailed table is paginated, and the per-collaborator drill
 * down is fetched only for the person actually selected.
 */

export interface TeamHourProject {
  id: string;
  name: string;
  color: string;
  clientName: string | null;
}

export interface TeamHourUser {
  id: string;
  name: string;
  email: string;
  image: string | null;
}

export interface TeamHourEntry {
  id: string;
  description: string;
  date: string;
  duration: number;
  billable: boolean;
  azdoSyncStatus: string;
  createdAt: string;
  user: TeamHourUser;
  project: TeamHourProject;
}

/** Headline numbers rendered in the KPI strip. */
export interface TeamHoursTotals {
  totalMinutes: number;
  billableMinutes: number;
  billableRate: number;
  entryCount: number;
  activePeople: number;
  activeProjects: number;
  topContributorName: string | null;
  topContributorMinutes: number;
}

/** One row of the collaborator list, aggregated in SQL. */
export interface TeamHoursCollaborator {
  user: TeamHourUser;
  totalMinutes: number;
  billableMinutes: number;
  billableRate: number;
  entryCount: number;
  projectsCount: number;
  latestDate: string | null;
  latestProjectName: string | null;
  /** Share of the filtered team total, 0-100. */
  sharePercent: number;
}

export interface TeamHoursSummaryResponse {
  totals: TeamHoursTotals;
  collaborators: TeamHoursCollaborator[];
  /** Options for the filter comboboxes, scoped to what the actor may see. */
  filterOptions: {
    users: TeamHourUser[];
    projects: TeamHourProject[];
  };
}

export interface TeamHoursEntriesResponse {
  entries: TeamHourEntry[];
  total: number;
  page: number;
  pageSize: number;
}

/** Per-project rollup for the selected collaborator. */
export interface TeamHoursProjectGroup {
  project: TeamHourProject;
  entries: TeamHourEntry[];
  totalMinutes: number;
  billableMinutes: number;
}

export interface TeamHoursCollaboratorResponse {
  entries: TeamHourEntry[];
  /** ISO week starts (yyyy-MM-dd) that contain at least one entry, newest first. */
  weeks: string[];
  truncated: boolean;
}

export type TeamHoursSortOption = "newest" | "oldest" | "longest";
