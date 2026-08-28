import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const reconstructDaySchema = z.object({
  date: z.string().regex(datePattern, "Formato YYYY-MM-DD"),
});

export type ReconstructDayInput = z.infer<typeof reconstructDaySchema>;

export const applyDayPlanSchema = z.object({
  date: z.string().regex(datePattern, "Formato YYYY-MM-DD"),
  items: z
    .array(
      z.object({
        projectId: z.string().min(1),
        description: z.string().min(3).max(2000),
        minutes: z.number().int().min(5).max(1440),
        billable: z.boolean(),
        azureWorkItemId: z.number().int().positive().nullable().optional(),
        azureWorkItemTitle: z.string().max(500).nullable().optional(),
        source: z.enum([
          "calendar",
          "pull_request",
          "commits",
          "work_item",
          "pattern",
        ]),
      }),
    )
    .min(1)
    .max(12),
});

export type ApplyDayPlanInput = z.infer<typeof applyDayPlanSchema>;
