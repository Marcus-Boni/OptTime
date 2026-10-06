/**
 * Resolves the bot registration from the organization's Teams settings.
 *
 * Credentials live next to the other Teams secrets (encrypted in
 * `system_setting`), so an admin wires the app from the settings screen with
 * no redeploy. The tenant falls back to the one the Microsoft login uses.
 */

import type { BotCredentials } from "@/lib/teams/bot/auth";
import { getTeamsSettings } from "@/lib/teams/settings";

export interface BotConfig {
  /** Master switch of the Teams integration. */
  enabled: boolean;
  credentials: BotCredentials | null;
}

export function resolveBotTenantId(stored: string | null): string | null {
  const fallback = process.env.MICROSOFT_TENANT_ID?.trim();
  return stored || (fallback && fallback !== "common" ? fallback : null);
}

export async function getBotConfig(): Promise<BotConfig> {
  const settings = await getTeamsSettings();
  const tenantId = resolveBotTenantId(settings.botTenantId);

  const credentials =
    settings.botAppId && settings.botAppPassword && tenantId
      ? {
          appId: settings.botAppId,
          appPassword: settings.botAppPassword,
          tenantId,
        }
      : null;

  return { enabled: settings.enabled, credentials };
}
