import { z } from "zod";

const optionalTrimmedText = z
  .string()
  .trim()
  .max(100, "Máximo de 100 caracteres")
  .transform((value) => (value === "" ? null : value))
  .optional();

/** Campos editáveis pelo próprio usuário em perfil e preferências */
export const updateProfileSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Nome deve ter pelo menos 2 caracteres")
      .max(100, "Máximo de 100 caracteres")
      .optional(),
    department: optionalTrimmedText,
    jobTitle: optionalTrimmedText,
    officeLocation: optionalTrimmedText,
    weeklyCapacity: z
      .number()
      .int("Capacidade deve ser um número inteiro")
      .min(1, "Capacidade mínima de 1 hora")
      .max(168, "Capacidade máxima de 168 horas (1 semana)")
      .optional(),
    timeDefaultView: z.enum(["day", "week", "month", "timesheets"]).optional(),
    timeDefaultDuration: z
      .number()
      .int("A duração deve ser um número inteiro")
      .min(15, "Duração mínima de 15 minutos")
      .max(480, "Duração máxima de 480 minutos")
      .optional(),
    timeSubmitMode: z.enum(["close", "continue"]).optional(),
    timeDefaultBillable: z.boolean().optional(),
    timeAssistantEnabled: z.boolean().optional(),
    timeOutlookDefaultOpen: z.boolean().optional(),
    timeShowWeekends: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "Nenhuma alteração informada.",
  });

export type UpdateProfileFormInput = z.input<typeof updateProfileSchema>;
export type UpdateProfileInput = z.output<typeof updateProfileSchema>;
