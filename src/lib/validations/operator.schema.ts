import { z } from "zod";
import { OPERATOR_ACTIONS } from "@/lib/ai/operator/policy";

const actionKindSchema = z.enum(
  Object.keys(OPERATOR_ACTIONS) as [string, ...string[]],
);

const permissionSchema = z.enum(["ask", "auto", "never"]);

export const updateOperatorPolicySchema = z.object({
  mode: z.enum(["always_ask", "smart", "autopilot"]).optional(),
  overrides: z.record(actionKindSchema, permissionSchema).optional(),
  voiceEnabled: z.boolean().optional(),
  voiceLocale: z.string().min(2).max(20).optional(),
  speakReplies: z.boolean().optional(),
});

export type UpdateOperatorPolicyInput = z.infer<
  typeof updateOperatorPolicySchema
>;

export const createOperatorLogSchema = z.object({
  planId: z.string().max(80).nullable().optional(),
  stepIndex: z.number().int().min(0).max(50).optional(),
  kind: actionKindSchema,
  summary: z.string().min(1).max(300),
  status: z.enum(["executed", "failed", "skipped"]),
  authorization: z.enum(["confirmed", "auto"]),
  inputMode: z.enum(["text", "voice"]).optional(),
  params: z.unknown().optional(),
  resultId: z.string().max(80).nullable().optional(),
  errorMessage: z.string().max(500).nullable().optional(),
});

export type CreateOperatorLogInput = z.infer<typeof createOperatorLogSchema>;

export const undoOperatorLogSchema = z.object({
  action: z.literal("undo"),
});

export const operatorNotifySchema = z.object({
  subject: z.string().min(1).max(150),
  message: z.string().min(1).max(2000),
  contextLines: z.array(z.string().max(200)).max(6).optional(),
  recipientIds: z.array(z.string().min(1)).min(1).max(100),
  projectId: z.string().min(1).nullable().optional(),
});

export type OperatorNotifyInput = z.infer<typeof operatorNotifySchema>;

export const operatorReportSchema = z.object({
  scope: z.enum(["me", "project", "team"]),
  projectId: z.string().min(1).nullable().optional(),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type OperatorReportInput = z.infer<typeof operatorReportSchema>;
