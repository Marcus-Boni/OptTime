/**
 * Proactive delivery to a person's private chat with the OptSolv Time app.
 *
 * Anyone who installed the app already has a 1:1 conversation stored, so
 * notifications (like the evening digest) reach them in Teams with no
 * Power Automate flow to set up. Best-effort: callers fall back to their
 * previous channel on anything but "sent".
 */

import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { teamsBotConversation } from "@/lib/db/schema";
import { toAttachment } from "@/lib/teams/bot/cards";
import { type BotConfig, getBotConfig } from "@/lib/teams/bot/config";
import { ConnectorError, sendToConversation } from "@/lib/teams/bot/connector";
import { forgetPersonalConversation } from "@/lib/teams/bot/conversations";
import type { AdaptiveCard } from "@/lib/teams/client";

export type ProactiveResult = "sent" | "unavailable" | "failed";

/** HTTP statuses that mean the app is no longer installed for that person. */
const GONE_STATUSES = new Set([403, 404]);

export async function sendPersonalCard(
  userId: string,
  card: AdaptiveCard,
  summary: string,
  preloadedConfig?: BotConfig,
): Promise<ProactiveResult> {
  const config = preloadedConfig ?? (await getBotConfig());
  if (!config.enabled || !config.credentials) return "unavailable";

  const conversation = await db.query.teamsBotConversation.findFirst({
    where: eq(teamsBotConversation.userId, userId),
    columns: { conversationId: true, serviceUrl: true },
  });
  if (!conversation) return "unavailable";

  try {
    await sendToConversation(
      config.credentials,
      conversation.serviceUrl,
      conversation.conversationId,
      { type: "message", summary, attachments: [toAttachment(card)] },
    );
    return "sent";
  } catch (error: unknown) {
    if (
      error instanceof ConnectorError &&
      error.status !== null &&
      GONE_STATUSES.has(error.status)
    ) {
      // Uninstalled or blocked: stop trying and let the fallback take over.
      await forgetPersonalConversation(userId).catch(() => undefined);
      return "unavailable";
    }

    console.warn(
      "[teams-bot] proactive delivery failed:",
      error instanceof Error ? error.message : error,
    );
    return "failed";
  }
}
