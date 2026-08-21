import { z } from "zod";

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
});

export type SaveTeamsSettingsPayload = z.infer<typeof saveTeamsSettingsSchema>;

/** Per-user Teams preferences. */
export const saveTeamsPreferencesSchema = z.object({
  teamsStatusSyncEnabled: z.boolean().optional(),
  eveningDigestEnabled: z.boolean().optional(),
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
