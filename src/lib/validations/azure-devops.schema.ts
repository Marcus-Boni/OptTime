import { z } from "zod";

export const azureDevopsConfigSchema = z.object({
  organizationUrl: z
    .string()
    .trim()
    .url("A URL da organização deve ser válida.")
    .min(1, "URL da organização é obrigatória."),
  pat: z.string().trim().min(1, "O Personal Access Token (PAT) é obrigatório."),
  commitAuthor: z.string().trim(),
});

export type AzureDevopsConfigInput = z.infer<typeof azureDevopsConfigSchema>;
