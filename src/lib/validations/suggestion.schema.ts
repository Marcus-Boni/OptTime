import { z } from "zod";

export const SUGGESTION_STATUSES = [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "implemented",
] as const;

/** Schema for creating a new suggestion */
export const createSuggestionSchema = z.object({
  title: z
    .string()
    .min(5, "Título deve ter ao menos 5 caracteres")
    .max(120, "Título deve ter no máximo 120 caracteres"),
  description: z
    .string()
    .min(10, "Descrição deve ter ao menos 10 caracteres")
    .max(2000, "Descrição deve ter no máximo 2000 caracteres"),
});

export type CreateSuggestionInput = z.infer<typeof createSuggestionSchema>;

/** Schema for admin updating suggestion status */
export const updateSuggestionStatusSchema = z.object({
  status: z.enum(SUGGESTION_STATUSES),
  adminNotes: z.string().max(1000).optional(),
});

export type UpdateSuggestionStatusInput = z.infer<
  typeof updateSuggestionStatusSchema
>;
