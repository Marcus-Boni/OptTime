import { z } from "zod";

/** ISO week id, e.g. "2026-W35". */
const isoWeekPattern = /^\d{4}-W\d{2}$/;

// ─── Workload matrix ──────────────────────────────────────────────────

export const getWorkloadSchema = z.object({
  past: z.coerce.number().int().min(1).max(8).default(4),
  future: z.coerce.number().int().min(0).max(8).default(4),
});

export type GetWorkloadInput = z.infer<typeof getWorkloadSchema>;

// ─── FTE allocations ──────────────────────────────────────────────────

export const upsertAllocationSchema = z.object({
  userId: z.string().min(1),
  projectId: z.string().min(1),
  week: z.string().regex(isoWeekPattern, "Semana no formato YYYY-Www"),
  /** 15min to 100h per week keeps typos out of the planner. */
  plannedMinutes: z.number().int().min(15).max(6000),
  note: z.string().max(280).nullable().optional(),
});

export type UpsertAllocationInput = z.infer<typeof upsertAllocationSchema>;

export const updateAllocationSchema = z.object({
  plannedMinutes: z.number().int().min(15).max(6000).optional(),
  note: z.string().max(280).nullable().optional(),
});

export type UpdateAllocationInput = z.infer<typeof updateAllocationSchema>;

// ─── Batch approval ───────────────────────────────────────────────────

export const batchApprovalSchema = z.object({
  timesheetIds: z.array(z.string().min(1)).min(1).max(100),
});

export type BatchApprovalInput = z.infer<typeof batchApprovalSchema>;

// ─── Scope creep ──────────────────────────────────────────────────────

export const scopeCreepQuerySchema = z.object({
  projectId: z.string().min(1),
});

// ─── Client portal links ──────────────────────────────────────────────

export const createPortalLinkSchema = z.object({
  projectId: z.string().min(1),
  label: z.string().min(3, "Dê um nome ao link (mín. 3 caracteres)").max(120),
  /** Plain password; hashed server-side. Null/absent = public link. */
  password: z.string().min(6).max(72).nullable().optional(),
  /** Days until expiry; null/absent = never expires. */
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
  showBudget: z.boolean().default(true),
  showTeam: z.boolean().default(true),
  showDescriptions: z.boolean().default(false),
});

export type CreatePortalLinkInput = z.infer<typeof createPortalLinkSchema>;

export const updatePortalLinkSchema = z.object({
  action: z.enum(["revoke", "update"]),
  label: z.string().min(3).max(120).optional(),
  showBudget: z.boolean().optional(),
  showTeam: z.boolean().optional(),
  showDescriptions: z.boolean().optional(),
  expiresInDays: z.number().int().min(1).max(365).nullable().optional(),
});

export type UpdatePortalLinkInput = z.infer<typeof updatePortalLinkSchema>;

export const portalPasswordSchema = z.object({
  password: z.string().min(1).max(72),
});
