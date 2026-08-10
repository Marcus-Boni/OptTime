import { z } from "zod";

export const smtpConfigSchema = z.object({
  host: z.string().min(1, "Host do SMTP é obrigatório"),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().email("Formato de e-mail de usuário inválido"),
  pass: z.string().min(1, "Senha de app do Gmail é obrigatória"),
  fromEmail: z.string().min(1, "E-mail do remetente é obrigatório"),
});

export type SmtpConfigInput = z.infer<typeof smtpConfigSchema>;

export const testSmtpSchema = z.object({
  host: z.string().min(1, "Host do SMTP é obrigatório"),
  port: z.number().int().min(1).max(65535).default(587),
  secure: z.boolean().default(false),
  user: z.string().email("Formato de e-mail de usuário inválido"),
  pass: z.string().optional(),
  fromEmail: z.string().min(1, "E-mail do remetente é obrigatório"),
  testRecipient: z.string().email("E-mail de destino inválido").optional(),
});

export type TestSmtpInput = z.infer<typeof testSmtpSchema>;
