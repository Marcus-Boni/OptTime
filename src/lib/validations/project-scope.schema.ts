import { z } from "zod";

/** Valid stage value in a project scope */
export const projectScopeSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Máximo de 100 caracteres"),
  stages: z
    .array(z.string().min(1, "Etapa não pode ser vazia").max(100))
    .default([]),
  defaultStatus: z.enum(["open", "active", "archived"]).default("open"),
});

export type ProjectScopeFormData = z.infer<typeof projectScopeSchema>;
