import { z } from "zod";

export const azureDevopsConfigSchema = z.object({
  organizationUrl: z
    .string()
    .url("A URL da organização deve ser válida.")
    .min(1, "URL da organização é obrigatória."),
  pat: z.string().min(1, "O Personal Access Token (PAT) é obrigatório."),
});

export type AzureDevopsConfigInput = z.infer<typeof azureDevopsConfigSchema>;
