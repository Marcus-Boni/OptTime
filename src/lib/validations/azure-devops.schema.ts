import { z } from "zod";

export const azureDevopsConfigSchema = z.object({
  organizationUrl: z
    .string()
    .trim()
    .url("A URL da organizacao deve ser valida.")
    .min(1, "URL da organizacao e obrigatoria."),
  pat: z.string().trim().min(1, "O Personal Access Token (PAT) e obrigatorio."),
  commitAuthor: z.string().trim(),
});

export type AzureDevopsConfigInput = z.infer<typeof azureDevopsConfigSchema>;
