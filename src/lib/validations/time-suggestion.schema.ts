import { z } from "zod";

export const getTimeSuggestionsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  timezone: z.string().min(1).max(80).default("UTC"),
});

export const createSuggestionFeedbackSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  suggestionFingerprint: z.string().min(8).max(240),
  action: z.enum(["accepted", "edited", "rejected"]),
  editedFields: z.array(z.string().min(1).max(40)).max(20).optional(),
  sourceBreakdown: z
    .object({
      commits: z.number().int().min(0).max(100).default(0),
      meetings: z.number().int().min(0).max(100).default(0),
      recency: z.number().int().min(0).max(1000).default(0),
    })
    .optional(),
  score: z.number().min(0).max(1).optional(),
});

export type CreateSuggestionFeedbackInput = z.infer<
  typeof createSuggestionFeedbackSchema
>;
