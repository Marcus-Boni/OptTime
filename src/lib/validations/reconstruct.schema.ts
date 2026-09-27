import { z } from "zod";

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

export const reconstructDaySchema = z.object({
  date: z.string().regex(datePattern, "Formato YYYY-MM-DD"),
});

export type ReconstructDayInput = z.infer<typeof reconstructDaySchema>;

const reconstructSourceSchema = z.enum([
  "calendar",
  "teams_attendance",
  "teams_call",
  "document",
  "pull_request",
  "commits",
  "work_item",
  "pattern",
]);

export const applyDayPlanSchema = z.object({
  date: z.string().regex(datePattern, "Formato YYYY-MM-DD"),
  items: z
    .array(
      z
        .object({
          projectId: z.string().min(1),
          description: z.string().min(3).max(2000),
          minutes: z.number().int().min(1).max(1440),
          billable: z.boolean(),
          azureWorkItemId: z.number().int().positive().nullable().optional(),
          azureWorkItemTitle: z.string().max(500).nullable().optional(),
          source: reconstructSourceSchema,
          sourceId: z.string().min(1).max(160).optional(),
        })
        .superRefine((item, ctx) => {
          if (item.source !== "teams_call" && item.minutes < 5) {
            ctx.addIssue({
              code: "custom",
              message: "Duração mínima de 5 minutos",
              path: ["minutes"],
            });
          }
        }),
    )
    .min(1)
    .max(12),
});

export type ApplyDayPlanInput = z.infer<typeof applyDayPlanSchema>;
