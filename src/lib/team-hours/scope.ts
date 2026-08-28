import {
  and,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import type { ActorContext } from "@/lib/access-control";
import { getDirectReportIds, getManagedProjectIds } from "@/lib/access-control";
import { project, timeEntry, user } from "@/lib/db/schema";

interface TeamHoursFilterInput {
  from?: string;
  to?: string;
  projectId?: string;
  userId?: string;
  q?: string;
}

/**
 * Builds the WHERE clause shared by every team-hours query.
 *
 * Visibility rules live here once so the aggregate, the paginated table and
 * the per-collaborator drill down can never drift apart: a manager sees their
 * own hours plus their direct reports plus anyone logging into the projects
 * they manage; an admin sees everything.
 */
export async function buildTeamHoursWhere(
  actor: ActorContext,
  filters: TeamHoursFilterInput,
): Promise<SQL | undefined> {
  const conditions: SQL[] = [isNull(timeEntry.deletedAt)];

  if (filters.from) {
    conditions.push(gte(timeEntry.date, filters.from));
  }
  if (filters.to) {
    conditions.push(lte(timeEntry.date, filters.to));
  }
  if (filters.projectId) {
    conditions.push(eq(timeEntry.projectId, filters.projectId));
  }
  if (filters.userId) {
    conditions.push(eq(timeEntry.userId, filters.userId));
  }

  const search = filters.q?.trim();
  if (search) {
    const pattern = `%${escapeLikePattern(search)}%`;
    const matches = or(
      ilike(timeEntry.description, pattern),
      ilike(user.name, pattern),
      ilike(user.email, pattern),
      ilike(project.name, pattern),
      ilike(project.clientName, pattern),
    );

    if (matches) {
      conditions.push(matches);
    }
  }

  if (actor.role === "manager") {
    const [directReportIds, managedProjectIds] = await Promise.all([
      getDirectReportIds(actor.userId),
      getManagedProjectIds(actor),
    ]);

    // The manager always sees their own hours, even with no reports/projects.
    const visibility: SQL[] = [eq(timeEntry.userId, actor.userId)];

    if (directReportIds.length > 0) {
      visibility.push(inArray(timeEntry.userId, directReportIds));
    }
    if (managedProjectIds && managedProjectIds.length > 0) {
      visibility.push(inArray(timeEntry.projectId, managedProjectIds));
    }

    const scoped = or(...visibility);
    if (scoped) {
      conditions.push(scoped);
    }
  }

  return and(...conditions);
}

/** Escapes the LIKE wildcards so a user typing "%" searches for a literal "%". */
function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
