import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z.string().regex(datePattern, "Formato YYYY-MM-DD");

/**
 * Counts the client already holds from `/api/collaboration/actions`.
 *
 * Accepted from the request so the narrative can mention deliveries without a
 * second sweep of every Azure DevOps repository. They only ever shape the
 * user's own summary, and the ceiling keeps a malformed payload from padding
 * the prompt.
 */
export const deliveryCountsSchema = z.object({
  pullRequests: z.number().int().min(0).max(999),
  commits: z.number().int().min(0).max(9999),
  workItems: z.number().int().min(0).max(999),
});

export const periodAssistantSchema = z.object({
  from: isoDate,
  to: isoDate,
  delivery: deliveryCountsSchema.nullable().optional(),
});

export type PeriodAssistantInput = z.infer<typeof periodAssistantSchema>;
