import { z } from "zod";

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida (use AAAA-MM-DD)");

/** Validation schema for starting a new phase of an existing project */
export const createProjectPhaseSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(2, "Nome deve ter pelo menos 2 caracteres")
      .max(100, "Máximo de 100 caracteres"),
    code: z
      .string()
      .trim()
      .min(2, "Código deve ter pelo menos 2 caracteres")
      .max(20, "Máximo de 20 caracteres")
      .regex(
        /^[A-Z0-9-]+$/,
        "Código deve conter apenas letras maiúsculas, números e hífens",
      )
      .optional()
      .nullable(),
    /** Budget of the new phase, in hours. Starts from zero consumption. */
    budget: z
      .number()
      .int("Informe horas inteiras")
      .min(0, "O orçamento não pode ser negativo")
      .max(1_000_000, "Orçamento muito alto")
      .nullable(),
    startDate: isoDate,
    endDate: isoDate.optional().nullable(),
    description: z.string().max(500).optional().nullable(),
    /** Copy the current team to the new phase */
    copyMembers: z.boolean().default(true),
  })
  .refine((data) => !data.endDate || data.endDate >= data.startDate, {
    message: "A data fim deve ser igual ou posterior à data início",
    path: ["endDate"],
  });

export type CreateProjectPhaseInput = z.infer<typeof createProjectPhaseSchema>;
