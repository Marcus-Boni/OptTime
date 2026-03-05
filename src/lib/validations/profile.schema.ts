import { z } from "zod";

/** Campos que o próprio usuário pode editar no perfil */
export const updateProfileSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Máximo de 100 caracteres"),
  department: z.string().max(100, "Máximo de 100 caracteres").optional(),
  weeklyCapacity: z
    .number()
    .int("Capacidade deve ser um número inteiro")
    .min(1, "Capacidade mínima de 1 hora")
    .max(168, "Capacidade máxima de 168 horas (1 semana)"),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
