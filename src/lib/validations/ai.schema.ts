import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(4000),
  quickAction: z
    .object({
      type: z.enum(["parse_entry", "suggest_week", "faq"]),
      data: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  message: z.string().min(1, "A mensagem não pode estar vazia").max(2000),
  history: z.array(chatMessageSchema).optional().default([]),
  context: z
    .object({
      activePath: z.string().optional(),
      userRole: z.string().optional(),
      userName: z.string().optional(),
    })
    .optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const parseEntryRequestSchema = z.object({
  input: z
    .string()
    .min(1, "Informe o texto com os detalhes das horas")
    .max(1000),
});

export type ParseEntryRequest = z.infer<typeof parseEntryRequestSchema>;

export const parsedTimeEntrySchema = z.object({
  projectId: z.string().nullable().optional(),
  projectName: z.string().nullable().optional(),
  description: z.string(),
  durationMinutes: z.number().int().min(1).max(1440),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  azureWorkItemId: z.number().int().positive().nullable().optional(),
  confidence: z.number().min(0).max(1),
  explanation: z.string().optional(),
});

export type ParsedTimeEntry = z.infer<typeof parsedTimeEntrySchema>;
