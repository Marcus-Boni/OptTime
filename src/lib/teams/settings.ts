/**
 * Organization-level Microsoft Teams configuration.
 *
 * Stored as one JSON value in `system_setting` (key "teams_config") following
 * the SMTP-config pattern: sensitive fields are AES-256-GCM encrypted
 * individually and masked on read, so the admin UI can show *that* something
 * is configured without ever echoing the secret back.
 */

import { db } from "@/lib/db";
import { systemSetting } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";

export const TEAMS_CONFIG_KEY = "teams_config";
export const MASKED_SECRET = "••••••••";

export interface TeamsSettings {
  /** Master switch for every Teams automation. */
  enabled: boolean;
  /** Incoming-webhook URL of the squad channel (digests land here). */
  channelWebhookUrl: string | null;
  /** Shared secret of the Teams outgoing webhook (HMAC validation). */
  outgoingSecret: string | null;
  /** Morning standup digest in the channel. */
  standupEnabled: boolean;
  /** Personal end-of-day digests (Teams webhook or e-mail fallback). */
  eveningEnabled: boolean;
}

export const DEFAULT_TEAMS_SETTINGS: TeamsSettings = {
  enabled: false,
  channelWebhookUrl: null,
  outgoingSecret: null,
  standupEnabled: true,
  eveningEnabled: true,
};

interface StoredTeamsSettings {
  enabled?: boolean;
  channelWebhookUrl?: string | null;
  outgoingSecret?: string | null;
  standupEnabled?: boolean;
  eveningEnabled?: boolean;
}

/** Decrypted settings for server-side use (crons, webhook receiver). */
export async function getTeamsSettings(): Promise<TeamsSettings> {
  const row = await db.query.systemSetting.findFirst({
    where: (fields, { eq }) => eq(fields.key, TEAMS_CONFIG_KEY),
  });

  if (!row) return { ...DEFAULT_TEAMS_SETTINGS };

  try {
    const stored = JSON.parse(row.value) as StoredTeamsSettings;
    return {
      enabled: stored.enabled ?? false,
      channelWebhookUrl: stored.channelWebhookUrl
        ? decrypt(stored.channelWebhookUrl) || null
        : null,
      outgoingSecret: stored.outgoingSecret
        ? decrypt(stored.outgoingSecret) || null
        : null,
      standupEnabled: stored.standupEnabled ?? true,
      eveningEnabled: stored.eveningEnabled ?? true,
    };
  } catch (error: unknown) {
    console.error("[teams] failed to parse teams_config:", error);
    return { ...DEFAULT_TEAMS_SETTINGS };
  }
}

export interface SaveTeamsSettingsInput {
  enabled: boolean;
  /** Undefined = keep the stored value; null = clear; string = replace. */
  channelWebhookUrl?: string | null;
  outgoingSecret?: string | null;
  standupEnabled: boolean;
  eveningEnabled: boolean;
}

export async function saveTeamsSettings(
  input: SaveTeamsSettingsInput,
  updatedById: string,
): Promise<void> {
  const current = await getTeamsSettings();

  const nextChannelUrl =
    input.channelWebhookUrl === undefined
      ? current.channelWebhookUrl
      : input.channelWebhookUrl;
  const nextSecret =
    input.outgoingSecret === undefined
      ? current.outgoingSecret
      : input.outgoingSecret;

  const stored: StoredTeamsSettings = {
    enabled: input.enabled,
    channelWebhookUrl: nextChannelUrl ? encrypt(nextChannelUrl) : null,
    outgoingSecret: nextSecret ? encrypt(nextSecret) : null,
    standupEnabled: input.standupEnabled,
    eveningEnabled: input.eveningEnabled,
  };

  const value = JSON.stringify(stored);

  await db
    .insert(systemSetting)
    .values({
      key: TEAMS_CONFIG_KEY,
      value,
      updatedById,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value, updatedById, updatedAt: new Date() },
    });
}

export interface MaskedTeamsSettings {
  enabled: boolean;
  hasChannelWebhook: boolean;
  channelWebhookPreview: string | null;
  hasOutgoingSecret: boolean;
  standupEnabled: boolean;
  eveningEnabled: boolean;
}

/** Read model for the admin UI — secrets never leave the server. */
export function maskTeamsSettings(
  settings: TeamsSettings,
): MaskedTeamsSettings {
  return {
    enabled: settings.enabled,
    hasChannelWebhook: Boolean(settings.channelWebhookUrl),
    channelWebhookPreview: settings.channelWebhookUrl
      ? `${settings.channelWebhookUrl.slice(0, 38)}…`
      : null,
    hasOutgoingSecret: Boolean(settings.outgoingSecret),
    standupEnabled: settings.standupEnabled,
    eveningEnabled: settings.eveningEnabled,
  };
}
