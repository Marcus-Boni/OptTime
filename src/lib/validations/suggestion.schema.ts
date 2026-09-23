import { z } from "zod";

export const SUGGESTION_STATUSES = [
  "pending",
  "in_review",
  "approved",
  "rejected",
  "implemented",
] as const;

export const suggestionAttachmentInputSchema = z.object({
  fileName: z.string().min(1, "Nome do arquivo é obrigatório").max(255),
  fileSize: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, "Arquivo não pode ultrapassar 10MB"),
  contentType: z
    .string()
    .regex(
      /^image\/(png|jpeg|jpg|webp|gif)$/,
      "Formato de imagem não suportado (apenas PNG, JPG, WEBP e GIF)",
    ),
  url: z
    .string()
    .min(1, "Conteúdo da imagem é obrigatório")
    .refine(
      (val) =>
        val.startsWith("data:image/") ||
        val.startsWith("http://") ||
        val.startsWith("https://"),
      "URL da imagem inválida",
    ),
});

export type SuggestionAttachmentInput = z.infer<
  typeof suggestionAttachmentInputSchema
>;

/** Schema for creating a new suggestion */
export const createSuggestionSchema = z.object({
  title: z
    .string()
    .min(5, "Título deve ter ao menos 5 caracteres")
    .max(120, "Título deve ter no máximo 120 caracteres"),
  description: z
    .string()
    .min(10, "Descrição deve ter ao menos 10 caracteres")
    .max(2000, "Descrição deve ter no máximo 2000 caracteres"),
  attachments: z
    .array(suggestionAttachmentInputSchema)
    .max(3, "Máximo de 3 imagens por sugestão")
    .optional(),
});

export type CreateSuggestionInput = z.infer<typeof createSuggestionSchema>;

/** Schema for admin updating suggestion status */
export const updateSuggestionStatusSchema = z.object({
  status: z.enum(SUGGESTION_STATUSES),
  adminNotes: z.string().max(1000).optional(),
});

export type UpdateSuggestionStatusInput = z.infer<
  typeof updateSuggestionStatusSchema
>;
