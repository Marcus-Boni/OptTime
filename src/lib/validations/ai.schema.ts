import { z } from "zod";

export const chatMessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().min(1).max(8000),
});

export type ChatMessage = z.infer<typeof chatMessageSchema>;

export const chatRequestSchema = z.object({
  message: z.string().min(1, "A mensagem não pode estar vazia").max(2000),
  history: z.array(chatMessageSchema).max(40).optional().default([]),
  context: z
    .object({
      activePath: z.string().max(200).optional(),
      timeZone: z.string().max(60).optional(),
    })
    .optional(),
});

export type ChatRequest = z.infer<typeof chatRequestSchema>;

export const parseEntryRequestSchema = z.object({
  input: z
    .string()
    .min(1, "Informe o texto com os detalhes das horas")
    .max(1000),
  timeZone: z.string().max(60).optional(),
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

// ─── TimeBot Persisted Conversation Schemas ──────────────────────────

export const persistedTimeBotMessageSchema = z.object({
  id: z.string().min(1).max(128),
  role: z.union([z.literal("user"), z.literal("assistant")]),
  content: z.string().max(32000),
  cards: z.array(z.record(z.string(), z.unknown())).max(30).default([]),
  actions: z.array(z.record(z.string(), z.unknown())).max(30).default([]),
  provider: z
    .union([z.literal("foundry"), z.literal("local_fallback")])
    .optional(),
  error: z.string().max(1000).optional(),
  inputMode: z.union([z.literal("text"), z.literal("voice")]).optional(),
  createdAt: z.number().int().nonnegative(),
});

export type PersistedTimeBotMessageInput = z.infer<
  typeof persistedTimeBotMessageSchema
>;

export const persistedTimeBotThreadSchema = z.object({
  id: z.string().min(1).max(128),
  title: z.string().min(1).max(120),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  messages: z.array(persistedTimeBotMessageSchema).max(60).default([]),
});

export type PersistedTimeBotThreadInput = z.infer<
  typeof persistedTimeBotThreadSchema
>;

export const syncTimeBotThreadsSchema = z.object({
  activeThreadId: z.string().max(128).optional().default(""),
  threads: z.array(persistedTimeBotThreadSchema).max(20),
  executedKeys: z
    .array(z.string().min(1).max(2000))
    .max(400)
    .optional()
    .default([]),
});

export type SyncTimeBotThreadsInput = z.infer<typeof syncTimeBotThreadsSchema>;

export const patchTimeBotThreadSchema = z
  .object({
    title: z.string().min(1).max(120).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => data.title !== undefined || data.isActive !== undefined, {
    message: "Informe ao menos um campo para atualizar",
  });

export type PatchTimeBotThreadInput = z.infer<typeof patchTimeBotThreadSchema>;
