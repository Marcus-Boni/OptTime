import { z } from "zod";

const reconstructDate = z.iso.date("Data válida no formato YYYY-MM-DD");

export const reconstructDaySchema = z.object({
  date: reconstructDate,
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
  date: reconstructDate,
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
