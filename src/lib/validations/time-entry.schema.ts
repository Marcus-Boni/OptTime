import { z } from "zod";

/** Validation schema for creating/editing a time entry (form) */
export const timeEntrySchema = z.object({
  projectId: z.string().min(1, "Selecione um projeto"),
  taskId: z.string().optional(),
  taskTitle: z.string().optional(),
  description: z
    .string()
    .min(1, "Descrição é obrigatória")
    .max(500, "Máximo de 500 caracteres"),
  date: z.string().min(1, "Data é obrigatória"),
  duration: z
    .number()
    .min(1, "Duração mínima de 1 minuto")
    .max(1440, "Duração máxima de 24 horas"),
  billable: z.boolean().default(true),
  azureWorkItemId: z.number().optional(),
  tags: z.array(z.string()).optional(),
});

export type TimeEntryFormData = z.infer<typeof timeEntrySchema>;

/** Server-side schema for creating a time entry via API */
export const createTimeEntrySchema = z.object({
  projectId: z.string().min(1),
  description: z.string().min(1).max(500),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  duration: z.number().int().min(1).max(1440),
  billable: z.boolean().default(true),
  azureWorkItemId: z.number().int().positive().optional(),
  azureWorkItemTitle: z.string().max(500).optional(),
  startTime: z.string().datetime().optional(),
  endTime: z.string().datetime().optional(),
});

export type CreateTimeEntryData = z.infer<typeof createTimeEntrySchema>;

/** Server-side schema for updating a time entry via API */
export const updateTimeEntrySchema = z.object({
  projectId: z.string().min(1).optional(),
  description: z.string().min(1).max(500).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  duration: z.number().int().min(1).max(1440).optional(),
  billable: z.boolean().optional(),
  azureWorkItemId: z.number().int().positive().nullable().optional(),
  azureWorkItemTitle: z.string().max(500).nullable().optional(),
});

export type UpdateTimeEntryData = z.infer<typeof updateTimeEntrySchema>;

/** Schema for starting a timer */
export const startTimerSchema = z.object({
  projectId: z.string().min(1),
  description: z.string().max(500).default(""),
  billable: z.boolean().default(true),
  azureWorkItemId: z.number().int().positive().optional(),
  azureWorkItemTitle: z.string().max(500).optional(),
});

export type StartTimerData = z.infer<typeof startTimerSchema>;

/** Quick entry — simplified form for fast time logging */
export const quickEntrySchema = z.object({
  projectId: z.string().min(1, "Selecione um projeto"),
  hours: z
    .number()
    .min(0.25, "Mínimo de 15 minutos")
    .max(24, "Máximo de 24 horas"),
  description: z.string().min(1, "Descrição é obrigatória"),
});

export type QuickEntryFormData = z.infer<typeof quickEntrySchema>;

/**
 * Parse a "HH:MM" or "H:MM" duration string into total minutes.
 * Returns null if invalid.
 */
export function parseDuration(input: string): number | null {
  const match = input.trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (minutes >= 60) return null;
  const total = hours * 60 + minutes;
  if (total < 1 || total > 1440) return null;
  return total;
}
