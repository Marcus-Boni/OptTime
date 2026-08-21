import { z } from "zod";
import { OptSolvApiError } from "../client.js";

/**
 * Shared plumbing for every tool: the argument shapes that repeat across the
 * catalog, and one error funnel.
 */

export interface ToolOutput {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
  [key: string]: unknown;
}

/**
 * Runs a tool body, converting a failed API call into an MCP tool error.
 *
 * Tool failures are returned as results with `isError: true`, never as thrown
 * protocol errors: the model has to *see* the message to correct course, and a
 * transport-level error is invisible to it.
 */
export async function runTool(
  fn: () => Promise<ToolOutput>,
): Promise<ToolOutput> {
  try {
    return await fn();
  } catch (error: unknown) {
    if (error instanceof OptSolvApiError) {
      return {
        content: [{ type: "text", text: error.toAgentText() }],
        structuredContent: {
          error: {
            code: error.code,
            message: error.message,
            hint: error.hint,
          },
        },
        isError: true,
      };
    }

    const message =
      error instanceof Error ? error.message : "Erro desconhecido.";

    return {
      content: [{ type: "text", text: `❌ ${message}` }],
      structuredContent: { error: { code: "INTERNAL_ERROR", message } },
      isError: true,
    };
  }
}

/** Builds a successful tool result from a summary line and its payload. */
export function ok(text: string, data: Record<string, unknown>): ToolOutput {
  return {
    content: [{ type: "text", text }],
    structuredContent: data,
    isError: false,
  };
}

// ─── Reusable argument shapes ──────────────────────────────────────────

export const projectRefArg = z
  .string()
  .min(1)
  .describe(
    "Projeto de destino. Aceita o ID, o código (ex.: OPT-001) ou o nome (ex.: 'Harvest'). Se houver ambiguidade a chamada falha listando os candidatos.",
  );

export const descriptionArg = z
  .string()
  .min(1)
  .max(500)
  .describe(
    "O que foi (ou está sendo) feito. Seja específico: esse texto vai para o relatório lido pelo gestor.",
  );

export const dateArg = z
  .string()
  .optional()
  .describe(
    "Data no formato YYYY-MM-DD. Também aceita 'hoje' e 'ontem'. Padrão: hoje. Não é permitido registrar em datas futuras nem há mais de 30 dias.",
  );

export const periodArg = z
  .string()
  .optional()
  .describe(
    "Semana ISO no formato YYYY-Wnn (ex.: 2026-W33). Também aceita uma data YYYY-MM-DD dentro da semana, 'atual' ou 'semana passada'. Padrão: semana atual.",
  );

export const workItemIdArg = z
  .number()
  .int()
  .positive()
  .optional()
  .describe(
    "ID numérico do Work Item do Azure DevOps a vincular. As horas são sincronizadas no campo Completed Work.",
  );

export const billableArg = z
  .boolean()
  .optional()
  .describe(
    "Se as horas são faturáveis. Padrão: herda a configuração do projeto.",
  );

export const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

export const MUTATING = {
  readOnlyHint: false,
  destructiveHint: false,
  idempotentHint: false,
  openWorldHint: false,
} as const;

export const DESTRUCTIVE = {
  readOnlyHint: false,
  destructiveHint: true,
  idempotentHint: false,
  openWorldHint: false,
} as const;
