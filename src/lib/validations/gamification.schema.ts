import { z } from "zod";

/** Preferences the user controls over their own gamification experience. */
export const gamificationPreferencesSchema = z
  .object({
    /** Appear on the team mural and on the opt-in ranking. */
    publicProfile: z.boolean().optional(),
    /** Confetti and the celebration overlay after closing a week. */
    celebrationsEnabled: z.boolean().optional(),
  })
  .refine(
    (data) =>
      data.publicProfile !== undefined ||
      data.celebrationsEnabled !== undefined,
    { message: "Informe ao menos uma preferência para atualizar." },
  );

export type GamificationPreferencesInput = z.infer<
  typeof gamificationPreferencesSchema
>;

/** Org-wide gamification switches, editable by admins only. */
export const gamificationSettingsSchema = z.object({
  rankingEnabled: z.boolean(),
});

export type GamificationSettingsInput = z.infer<
  typeof gamificationSettingsSchema
>;
