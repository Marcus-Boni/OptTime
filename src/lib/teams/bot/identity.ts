/**
 * Maps the Teams sender to an OptSolv Time user.
 *
 * The fast path is the Entra object id already stored on the user (`azure_id`,
 * written when the person opens the Teams settings page). When it is missing,
 * the bot asks Teams for the member's e-mail and links the account on the
 * spot — so nobody has to visit a settings page before their first message.
 * Senders from a foreign tenant are never resolved.
 */

import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import type { AgentPrincipal } from "@/lib/mcp/auth";
import type { BotCredentials } from "@/lib/teams/bot/auth";
import { getConversationMember } from "@/lib/teams/bot/connector";
import type { BotActivity } from "@/lib/teams/bot/types";
import { buildTeamsPrincipal, resolveTeamsUser } from "@/lib/teams/commands";

export type IdentityResult =
  | { status: "linked"; principal: AgentPrincipal; linkedNow: boolean }
  | { status: "foreign_tenant" }
  | { status: "not_found"; displayName: string };

export function activityTenantId(activity: BotActivity): string | null {
  return (
    activity.conversation.tenantId ?? activity.channelData?.tenant?.id ?? null
  );
}

export async function resolveBotIdentity(
  activity: BotActivity,
  credentials: BotCredentials,
): Promise<IdentityResult> {
  const displayName = activity.from.name ?? "colega";
  const tenantId = activityTenantId(activity);

  if (
    tenantId &&
    tenantId.toLowerCase() !== credentials.tenantId.toLowerCase()
  ) {
    return { status: "foreign_tenant" };
  }

  const aadObjectId = activity.from.aadObjectId;
  const known = await resolveTeamsUser(aadObjectId);
  if (known) return { status: "linked", principal: known, linkedNow: false };
  if (!aadObjectId) return { status: "not_found", displayName };

  let email: string | null = null;
  try {
    const member = await getConversationMember(
      credentials,
      activity.serviceUrl,
      activity.conversation.id,
      activity.from.id,
    );
    email = (member.email ?? member.userPrincipalName ?? "").trim() || null;
  } catch (error: unknown) {
    console.warn(
      "[teams-bot] member lookup failed:",
      error instanceof Error ? error.message : error,
    );
  }

  if (!email) return { status: "not_found", displayName };

  const row = await db.query.user.findFirst({
    where: and(
      sql`lower(${user.email}) = ${email.toLowerCase()}`,
      eq(user.isActive, true),
    ),
    columns: { id: true, name: true, email: true, role: true, azureId: true },
  });

  if (!row) return { status: "not_found", displayName };

  // Never overwrite a different oid: that would hand this account to whoever
  // happens to share the e-mail alias.
  if (row.azureId && row.azureId !== aadObjectId) {
    console.warn("[teams-bot] e-mail matches a user linked to another oid", {
      userId: row.id,
    });
    return { status: "not_found", displayName };
  }

  if (!row.azureId) {
    await db
      .update(user)
      .set({ azureId: aadObjectId })
      .where(eq(user.id, row.id));
    console.info("[teams-bot] identity linked by e-mail", { userId: row.id });
  }

  return {
    status: "linked",
    principal: buildTeamsPrincipal(row),
    linkedNow: !row.azureId,
  };
}
