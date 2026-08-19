import { z } from "zod";

export const getAutofillSchema = z.object({
  /** How many days back to inspect, including today. */
  days: z.coerce.number().int().min(1).max(14).default(7),
  timezone: z.string().min(1).max(60).default("America/Sao_Paulo"),
});

export type GetAutofillInput = z.infer<typeof getAutofillSchema>;

export const dismissAutofillSchema = z.object({
  fingerprint: z.string().min(1).max(200),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** Kept so the dismissal feeds the suggestion weight-learning loop. */
  signal: z.string().min(1).max(40),
  score: z.number().int().min(0).max(100).optional(),
});

export type DismissAutofillInput = z.infer<typeof dismissAutofillSchema>;
