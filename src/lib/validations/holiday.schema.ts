import { z } from "zod";

export const holidayScopeSchema = z.enum([
  "national",
  "state",
  "municipal",
  "bridge",
]);

export const createHolidaySchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use YYYY-MM-DD)"),
  name: z
    .string()
    .trim()
    .min(2, "Informe o nome do feriado ou emenda")
    .max(120, "Nome muito longo"),
  scope: holidayScopeSchema.default("bridge"),
  stateCode: z.string().trim().max(5).nullable().optional(),
  cityName: z.string().trim().max(80).nullable().optional(),
  isActive: z.boolean().default(true),
});

export const updateHolidaySchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  scope: holidayScopeSchema.optional(),
  isActive: z.boolean().optional(),
});

export const syncHolidaysSchema = z.object({
  year: z.coerce.number().int().min(2020).max(2100),
});

export type CreateHolidayInput = z.infer<typeof createHolidaySchema>;
export type UpdateHolidayInput = z.infer<typeof updateHolidaySchema>;
export type SyncHolidaysInput = z.infer<typeof syncHolidaysSchema>;
