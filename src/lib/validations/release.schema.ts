import { z } from "zod";

export const createReleaseSchema = z.object({
  versionTag: z
    .string()
    .min(1, "A tag da versão é obrigatória")
    .max(50, "A tag é muito longa")
    .regex(
      /^v?\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/,
      "Use o formato vX.Y.Z (ex: v1.2.0 ou v2.0.0-beta.1)",
    ),
  title: z
    .string()
    .min(3, "O título precisa ter pelo menos 3 caracteres")
    .max(255, "O título não pode exceder 255 caracteres"),
  description: z
    .string()
    .min(10, "A descrição (release notes) precisa ser mais detalhada")
    .max(10000, "A descrição é muito longa"),
  videoUrl: z
    .string()
    .max(500, "A URL do vídeo é muito longa")
    .optional()
    .nullable(),
});

export const updateReleaseSchema = createReleaseSchema.partial();

export const publishReleaseSchema = z.object({
  notifyUsers: z.boolean().default(false),
});

export type CreateReleaseInput = z.infer<typeof createReleaseSchema>;
export type UpdateReleaseInput = z.infer<typeof updateReleaseSchema>;
export type PublishReleaseInput = z.infer<typeof publishReleaseSchema>;
