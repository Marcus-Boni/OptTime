/**
 * Everything the bot needs to read a request on behalf of one person: their
 * day, their projects, their direct manager and their autonomy settings.
 */

import { and, count, desc, eq, gte, isNull } from "drizzle-orm";
import { toOperatorSettings } from "@/lib/ai/operator/policy";
import type { OperatorSettings } from "@/lib/ai/operator/types";
import { db } from "@/lib/db";
import { timeEntry, user } from "@/lib/db/schema";
import type { AgentPrincipal } from "@/lib/mcp/auth";
import { getVisibleProjects } from "@/lib/mcp/service/projects";
import type { BotParseContext, BotProject } from "@/lib/teams/bot/intent";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";

/** Window that defines "projects you have been using". */
const RECENT_WINDOW_DAYS = 14;
const RECENT_PROJECT_LIMIT = 5;

export interface BotUserContext {
  parse: BotParseContext;
  operator: OperatorSettings;
}

async function loadRecentProjectIds(
  userId: string,
  today: string,
): Promise<string[]> {
  const rows = await db
    .select({ projectId: timeEntry.projectId, uses: count() })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.userId, userId),
        isNull(timeEntry.deletedAt),
        gte(timeEntry.date, shiftDay(today, -RECENT_WINDOW_DAYS)),
      ),
    )
    .groupBy(timeEntry.projectId)
    .orderBy(desc(count()))
    .limit(RECENT_PROJECT_LIMIT);

  return rows.map((row) => row.projectId);
}

async function loadProfile(userId: string): Promise<{
  managerName: string | null;
  operator: OperatorSettings;
}> {
  const profile = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: { managerId: true, operatorMode: true, operatorPolicies: true },
  });

  const manager = profile?.managerId
    ? await db.query.user.findFirst({
        where: eq(user.id, profile.managerId),
        columns: { name: true },
      })
    : null;

  return {
    managerName: manager?.name?.trim() || null,
    operator: toOperatorSettings(profile ?? {}),
  };
}

/**
 * Most used projects first, the rest alphabetically — the order the card
 * picker shows, so the likely choice is at the top of a long list.
 */
function orderByRecentUse(
  projects: BotProject[],
  recentProjectIds: string[],
): BotProject[] {
  const rank = (id: string): number => {
    const index = recentProjectIds.indexOf(id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  return [...projects].sort(
    (a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name, "pt-BR"),
  );
}

export async function loadBotUserContext(
  principal: AgentPrincipal,
): Promise<BotUserContext> {
  const today = todayInAppTimeZone();

  const [projects, recentProjectIds, profile] = await Promise.all([
    getVisibleProjects(principal),
    loadRecentProjectIds(principal.userId, today),
    loadProfile(principal.userId),
  ]);

  return {
    parse: {
      today,
      managerName: profile.managerName,
      projects: orderByRecentUse(
        projects.map((project) => ({
          id: project.id,
          name: project.name,
          code: project.code,
          billable: project.billable,
          clientName: project.clientName,
        })),
        recentProjectIds,
      ),
      recentProjectIds,
    },
    operator: profile.operator,
  };
}
