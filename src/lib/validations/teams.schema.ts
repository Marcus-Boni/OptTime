import { z } from "zod";

const GUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Admin: organization-level Teams settings. */
export const saveTeamsSettingsSchema = z.object({
  enabled: z.boolean(),
  /**
   * Secrets use tri-state semantics: undefined = keep stored value,
   * null = clear, string = replace.
   */
  channelWebhookUrl: z
    .string()
    .url("Informe uma URL https válida.")
    .max(2000)
    .nullable()
    .optional(),
  outgoingSecret: z.string().min(8).max(200).nullable().optional(),
  standupEnabled: z.boolean(),
  eveningEnabled: z.boolean(),
  meetingNudgesEnabled: z.boolean().optional(),
  /** Azure Bot registration — same tri-state semantics as the secrets. */
  botAppId: z
    .string()
    .trim()
    .regex(GUID_PATTERN, "O App ID do bot é um GUID.")
    .nullable()
    .optional(),
  botAppPassword: z.string().min(8).max(200).nullable().optional(),
  botTenantId: z
    .string()
    .trim()
    .regex(GUID_PATTERN, "O Tenant ID é um GUID.")
    .nullable()
    .optional(),
});

export type SaveTeamsSettingsPayload = z.infer<typeof saveTeamsSettingsSchema>;

/** Per-user Teams preferences. */
export const saveTeamsPreferencesSchema = z.object({
  teamsStatusSyncEnabled: z.boolean().optional(),
  eveningDigestEnabled: z.boolean().optional(),
  teamsMeetingNudgeEnabled: z.boolean().optional(),
  /** undefined = keep, null = clear, string = replace. */
  teamsWebhookUrl: z
    .string()
    .url("Informe uma URL https válida.")
    .max(2000)
    .nullable()
    .optional(),
});

export type SaveTeamsPreferencesPayload = z.infer<
  typeof saveTeamsPreferencesSchema
>;
