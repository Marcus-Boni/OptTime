import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

/** Most items one call may apply — the day plan itself never exceeds ten. */
export const MAX_APPLY_ITEMS = 12;

export const applySuggestionItemSchema = z.object({
  suggestionId: z.string().trim().min(1).max(64),
  /** Overrides the suggested project. Accepts id, code or name. */
  projectId: z.string().trim().min(1).max(255).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  description: z.string().trim().min(3).max(2000).optional(),
  billable: z.boolean().optional(),
});

export type ApplySuggestionItemInput = z.infer<
  typeof applySuggestionItemSchema
>;

export const applySuggestionsSchema = z
  .object({
    date: z.string().regex(datePattern, "Formato YYYY-MM-DD"),
    idempotencyKey: z.string().trim().min(8).max(128),
    items: z.array(applySuggestionItemSchema).min(1).max(MAX_APPLY_ITEMS),
    rejectedSuggestionIds: z.array(z.string().trim().min(1).max(64)).max(50),
  })
  .superRefine((value, ctx) => {
    const seen = new Set<string>();

    value.items.forEach((item, index) => {
      if (seen.has(item.suggestionId)) {
        ctx.addIssue({
          code: "custom",
          message: `A sugestão ${item.suggestionId} aparece mais de uma vez.`,
          path: ["items", index, "suggestionId"],
        });
      }
      seen.add(item.suggestionId);
    });

    value.rejectedSuggestionIds.forEach((id, index) => {
      if (seen.has(id)) {
        ctx.addIssue({
          code: "custom",
          message: `A sugestão ${id} não pode ser aplicada e recusada ao mesmo tempo.`,
          path: ["rejectedSuggestionIds", index],
        });
      }
    });
  });

export type ApplySuggestionsInput = z.infer<typeof applySuggestionsSchema>;
