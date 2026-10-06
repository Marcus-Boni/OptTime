/**
 * Personal conversation registry — where the bot can write to someone
 * privately, captured from installs and 1:1 messages.
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamsBotConversation } from "@/lib/db/schema";
import type { BotCredentials } from "@/lib/teams/bot/auth";
import { createPersonalConversation } from "@/lib/teams/bot/connector";
import type { BotActivity } from "@/lib/teams/bot/types";

export interface PersonalConversation {
  conversationId: string;
  serviceUrl: string;
}

export async function rememberPersonalConversation(
  userId: string,
  activity: BotActivity,
  tenantId: string,
): Promise<void> {
  if (activity.conversation.conversationType !== "personal") return;
  if (!activity.from.aadObjectId) return;

  const values = {
    aadObjectId: activity.from.aadObjectId,
    botUserId: activity.from.id,
    conversationId: activity.conversation.id,
    serviceUrl: activity.serviceUrl,
    tenantId,
  };

  await db
    .insert(teamsBotConversation)
    .values({ userId, ...values })
    .onConflictDoUpdate({
      target: teamsBotConversation.userId,
      set: { ...values, updatedAt: new Date() },
    });
}

export async function forgetPersonalConversation(
  userId: string,
): Promise<void> {
  await db
    .delete(teamsBotConversation)
    .where(eq(teamsBotConversation.userId, userId));
}

/**
 * Returns the user's 1:1 chat with the bot, opening it from the current
 * activity when none is stored yet (possible whenever the app is installed
 * for that person). Null means a private message cannot be delivered.
 */
export async function ensurePersonalConversation(
  credentials: BotCredentials,
  userId: string,
  activity: BotActivity,
  tenantId: string,
): Promise<PersonalConversation | null> {
  const stored = await db.query.teamsBotConversation.findFirst({
    where: eq(teamsBotConversation.userId, userId),
    columns: { conversationId: true, serviceUrl: true },
  });
  if (stored) return stored;

  if (!activity.from.aadObjectId) return null;

  try {
    const created = await createPersonalConversation(
      credentials,
      activity.serviceUrl,
      { botUserId: activity.from.id, tenantId },
    );

    await db
      .insert(teamsBotConversation)
      .values({
        userId,
        aadObjectId: activity.from.aadObjectId,
        botUserId: activity.from.id,
        conversationId: created.id,
        serviceUrl: activity.serviceUrl,
        tenantId,
      })
      .onConflictDoNothing();

    return { conversationId: created.id, serviceUrl: activity.serviceUrl };
  } catch (error: unknown) {
    console.warn(
      "[teams-bot] could not open a personal conversation:",
      error instanceof Error ? error.message : error,
    );
    return null;
  }
}
