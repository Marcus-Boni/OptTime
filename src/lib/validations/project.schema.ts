import { z } from "zod";

/** Valid project status values */
export type ProjectStatusValue = "active" | "archived" | "completed" | "open";

/** Validation schema for creating/editing a project */
export const projectSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Máximo de 100 caracteres"),
  commercialName: z.string().optional().nullable(),
  code: z
    .string()
    .min(2, "Código deve ter pelo menos 2 caracteres")
    .max(20, "Máximo de 20 caracteres")
    .regex(
      /^[A-Z0-9-]+$/,
      "Código deve conter apenas letras maiúsculas, números e hífens",
    )
    .optional()
    .nullable(),
  clientName: z.string().optional().nullable(),
  description: z.string().max(500).optional().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser um código hex válido"),
  status: z.enum(["active", "archived", "completed", "open"]).optional(),
  currentStage: z.string().optional().nullable(),
  billable: z.boolean().default(true),
  budget: z.number().min(0).optional().nullable(),
  azureProjectId: z.string().optional().nullable(),
  scopeId: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  /** Base64 data URI or remote URL for the project cover image */
  imageUrl: z.string().optional().nullable(),
  memberIds: z.array(z.string()).default([]),
  managerId: z.string().optional(),
});

export type ProjectFormData = z.infer<typeof projectSchema>;
