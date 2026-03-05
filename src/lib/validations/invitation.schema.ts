import { z } from "zod";

export const createInvitationSchema = z.object({
  email: z
    .string()
    .email("Email inválido")
    .endsWith(
      "@optsolv.com.br",
      "Apenas e-mails @optsolv.com.br são permitidos",
    ),
  role: z
    .union([z.literal("admin"), z.literal("manager"), z.literal("member")])
    .default("member"),
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().min(1, "Token inválido"),
  name: z.string().min(2, "Nome deve ter ao menos 2 caracteres").max(100),
  password: z.string().min(8, "Senha deve ter ao menos 8 caracteres").max(128),
});

export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
