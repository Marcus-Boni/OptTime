/**
 * Project phases.
 *
 * A client engagement that restarts with a new budget — while the team keeps
 * working in the same Azure DevOps project — is modelled as a new *phase* of
 * the original project: a separate `project` row (own budget, own hours, own
 * dates) linked to the first phase through `phaseRootId`.
 *
 * Invariant kept by the database: at most one **live** (`open` or `active`)
 * project per Azure DevOps project. Every Azure-driven lookup (import,
 * suggestions, extension) therefore resolves to the current phase without
 * ambiguity.
 *
 * Everything in this file is pure so it can be verified without a database.
 */

/**
 * Statuses that still take hours somewhere (v1 API, HQ, timer). Only one
 * project per Azure DevOps project may be in one of them at a time.
 */
export const LIVE_PROJECT_STATUSES = ["open", "active"] as const;

export function isLiveProjectStatus(status: string): boolean {
  return (LIVE_PROJECT_STATUSES as readonly string[]).includes(status);
}

/** Maximum length of `project.code` (see `projectSchema`). */
export const PROJECT_CODE_MAX_LENGTH = 20;

const PHASE_NAME_SUFFIX = /\s*[-–—·|]\s*fase\s+\d+\s*$/i;
const PHASE_CODE_SUFFIX = /-F\d+$/;

/** One phase as shown in the project's phase history. */
export interface ProjectPhaseSummary {
  id: string;
  name: string;
  code: string;
  phase: number;
  status: string;
  color: string;
  budgetHours: number | null;
  consumedHours: number;
  usageRatio: number | null;
  startDate: string | null;
  endDate: string | null;
  isCurrent: boolean;
  /** False when the viewer cannot open this phase (not a member) */
  accessible: boolean;
}

export interface ProjectPhaseLineage {
  lineageId: string;
  currentPhaseId: string | null;
  nextPhase: number;
  phases: ProjectPhaseSummary[];
}

export interface PhaseCandidate {
  id: string;
  status: string;
  phase: number;
  createdAt: Date | string;
}

/** Identifier shared by every phase of a lineage (the first phase's id). */
export function getPhaseLineageId(project: {
  id: string;
  phaseRootId: string | null;
}): string {
  return project.phaseRootId ?? project.id;
}

/** "Marca Ambiental — Fase 2" → "Marca Ambiental". */
export function stripPhaseSuffix(name: string): string {
  return name.replace(PHASE_NAME_SUFFIX, "").trim();
}

/** Display name of a phase. The first phase keeps the bare name. */
export function buildPhaseName(baseName: string, phase: number): string {
  const bare = stripPhaseSuffix(baseName);
  return phase > 1 ? `${bare} — Fase ${phase}` : bare;
}

/** "MARCA-AMB-F2" style code, always within the 20-char column limit. */
export function buildPhaseCode(baseCode: string, phase: number): string {
  const suffix = `-F${phase}`;
  const bare = baseCode
    .toUpperCase()
    .replace(PHASE_CODE_SUFFIX, "")
    .replace(/[^A-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const room = PROJECT_CODE_MAX_LENGTH - suffix.length;
  const trimmed = bare.slice(0, room).replace(/-+$/, "") || "PROJ";
  return `${trimmed}${suffix}`;
}

/**
 * Picks a free code given the ones already taken, appending a numeric
 * disambiguator (`-2`, `-3`, …) that still fits the column.
 */
export function ensureUniqueCode(
  desired: string,
  takenCodes: ReadonlySet<string>,
): string {
  if (!takenCodes.has(desired)) return desired;

  for (let attempt = 2; attempt < 100; attempt += 1) {
    const suffix = `-${attempt}`;
    const candidate = `${desired.slice(0, PROJECT_CODE_MAX_LENGTH - suffix.length)}${suffix}`;
    if (!takenCodes.has(candidate)) return candidate;
  }

  throw new Error(
    `Não foi possível gerar um código único a partir de ${desired}.`,
  );
}

/**
 * The phase that should receive new hours for a lineage or Azure project:
 * the live one (active before open); otherwise the latest phase; ties broken
 * by creation date.
 */
export function pickCurrentPhase<T extends PhaseCandidate>(
  candidates: readonly T[],
): T | null {
  if (candidates.length === 0) return null;

  const active = candidates.filter(
    (candidate) => candidate.status === "active",
  );
  const live = candidates.filter((candidate) =>
    isLiveProjectStatus(candidate.status),
  );
  const pool = active.length > 0 ? active : live.length > 0 ? live : candidates;

  return pool.reduce((best, candidate) => {
    if (candidate.phase !== best.phase) {
      return candidate.phase > best.phase ? candidate : best;
    }
    return new Date(candidate.createdAt).getTime() >
      new Date(best.createdAt).getTime()
      ? candidate
      : best;
  });
}

/** Next phase number for a lineage. */
export function getNextPhaseNumber(
  phases: readonly Pick<PhaseCandidate, "phase">[],
): number {
  return phases.reduce((max, item) => Math.max(max, item.phase), 0) + 1;
}

export interface PhaseBudgetUsage {
  /** Budget in hours, or null when the phase has no budget */
  budgetHours: number | null;
  consumedHours: number;
  /** 0..∞ — above 1 means the budget was exceeded; null without budget */
  usageRatio: number | null;
}

/** Budget consumption of a single phase. Budgets never carry over. */
export function summarizePhaseBudget(
  budgetHours: number | null,
  consumedMinutes: number,
): PhaseBudgetUsage {
  const consumedHours = Math.round((consumedMinutes / 60) * 10) / 10;
  if (!budgetHours || budgetHours <= 0) {
    return { budgetHours: null, consumedHours, usageRatio: null };
  }
  return {
    budgetHours,
    consumedHours,
    usageRatio: consumedMinutes / (budgetHours * 60),
  };
}
