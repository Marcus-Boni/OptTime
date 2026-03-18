import { z } from "zod";

/** Valid project status values */
export type ProjectStatusValue = "active" | "archived" | "completed";

/** Validation schema for creating/editing a project */
export const projectSchema = z.object({
  name: z
    .string()
    .min(2, "Nome deve ter pelo menos 2 caracteres")
    .max(100, "Máximo de 100 caracteres"),
  code: z
    .string()
    .min(2, "Código deve ter pelo menos 2 caracteres")
    .max(20, "Máximo de 20 caracteres")
    .regex(
      /^[A-Z0-9-]+$/,
      "Código deve conter apenas letras maiúsculas, números e hífens",
    )
    .optional(),
  clientName: z.string().optional(),
  description: z.string().max(500).optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "Cor deve ser um código hex válido"),
  status: z.enum(["active", "archived", "completed"]).optional(),
  billable: z.boolean().default(true),
  budget: z.number().min(0).optional(),
  azureProjectId: z.string().optional(),
  /** Base64 data URI or remote URL for the project cover image */
  imageUrl: z.string().optional().nullable(),
  memberIds: z.array(z.string()).default([]),
  managerId: z.string().optional(),
});

export type ProjectFormData = z.infer<typeof projectSchema>;
