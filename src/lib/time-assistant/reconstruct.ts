/**
 * Magic Timesheet Reconstructor ("Preencher meu dia").
 *
 * Rebuilds a full workday from three evidence layers:
 *   1. Outlook calendar meetings (exact durations),
 *   2. Azure DevOps activity (the existing autofill engine's proposals),
 *   3. the user's own historical patterns for that weekday.
 *
 * The composition is deterministic and auditable; an optional AI pass may only
 * polish descriptions and rebalance minutes — it can never invent items,
 * change projects or exceed the day target. When no provider is configured
 * (or the model answers garbage) the deterministic plan ships untouched.
 */

import { z } from "zod";
import { completeText } from "@/lib/ai/completion";
import { formatDuration } from "@/lib/utils";
import type { AutofillProposal } from "@/types/autofill";
import type {
  DayPlan,
  DayPlanItem,
  ReconstructConfidence,
  ReconstructSourceKind,
} from "@/types/reconstruct";
import type { AutofillProject } from "./autofill";

export type {
  DayPlan,
  DayPlanItem,
  ReconstructConfidence,
  ReconstructSourceKind,
} from "@/types/reconstruct";

export interface CalendarEventInput {
  subject: string;
  startIso: string;
  endIso: string;
}

export interface WeekdayPattern {
  projectId: string;
  projectName: string;
  projectColor: string;
  billable: boolean;
  description: string;
  /** Occurrences in the lookback window — higher = stronger habit. */
  weight: number;
}

export interface BuildDayPlanInput {
  date: string;
  targetMinutes: number;
  existingMinutes: number;
  existingDescriptions: string[];
  events: CalendarEventInput[];
  proposals: AutofillProposal[];
  patterns: WeekdayPattern[];
  projects: AutofillProject[];
  defaultBillable: boolean;
  warnings: string[];
  sources: DayPlan["sources"];
}

const MIN_ITEM_MINUTES = 15;
const MAX_MEETING_MINUTES = 240;
const MAX_PLAN_ITEMS = 8;
/** Gaps smaller than this are not worth reconstructing. */
export const MIN_GAP_MINUTES = 15;

const CONFIDENCE_RANK: Record<ReconstructConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function roundToQuarter(minutes: number): number {
  return Math.max(
    MIN_ITEM_MINUTES,
    Math.round(minutes / MIN_ITEM_MINUTES) * MIN_ITEM_MINUTES,
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Matches a meeting subject to a project by name or code mention. */
function matchProjectBySubject(
  subject: string,
  projects: AutofillProject[],
): AutofillProject | null {
  const needle = normalize(subject);
  if (!needle) return null;

  return (
    projects.find((project) => needle.includes(normalize(project.name))) ?? null
  );
}

function proposalSourceKind(
  signal: AutofillProposal["signal"],
): ReconstructSourceKind {
  switch (signal) {
    case "pr_completed":
    case "pr_active":
      return "pull_request";
    case "commits_unlogged":
      return "commits";
    default:
      return "work_item";
  }
}

/**
 * Deterministic day composition. Pure — every input is passed in, so the
 * behavior is unit-testable and identical between preview and re-runs.
 */
export function buildDeterministicDayPlan(input: BuildDayPlanInput): DayPlan {
  const {
    date,
    targetMinutes,
    existingMinutes,
    existingDescriptions,
    events,
    proposals,
    patterns,
    projects,
    defaultBillable,
    warnings,
    sources,
  } = input;

  const gapMinutes = Math.max(0, targetMinutes - existingMinutes);
  const items: DayPlanItem[] = [];

  const basePlan: Omit<DayPlan, "items" | "planMinutes"> = {
    date,
    targetMinutes,
    existingMinutes,
    gapMinutes,
    refinedBy: null,
    narrative: null,
    sources,
    warnings,
  };

  if (gapMinutes < MIN_GAP_MINUTES || projects.length === 0) {
    return { ...basePlan, items: [], planMinutes: 0 };
  }

  const alreadyLogged = new Set(existingDescriptions.map(normalize));
  const fallbackProject =
    patterns[0] != null
      ? projects.find((project) => project.id === patterns[0]?.projectId)
      : undefined;
  const defaultProject = fallbackProject ?? projects[0];

  // ── 1. Calendar meetings: exact durations, strongest evidence ──
  for (const event of events) {
    const start = new Date(event.startIso).getTime();
    const end = new Date(event.endIso).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;

    const description = `Reunião: ${event.subject.trim()}`.slice(0, 180);
    // An entry may exist either as the bare subject or already prefixed.
    if (
      alreadyLogged.has(normalize(description)) ||
      alreadyLogged.has(normalize(event.subject))
    ) {
      continue;
    }

    const minutes = Math.min(
      roundToQuarter((end - start) / 60_000),
      MAX_MEETING_MINUTES,
    );

    const matched = matchProjectBySubject(event.subject, projects);
    const project = matched ?? defaultProject;
    if (!project) continue;

    items.push({
      id: crypto.randomUUID(),
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      description,
      minutes,
      billable: project.billable && defaultBillable,
      azureWorkItemId: null,
      azureWorkItemTitle: null,
      source: "calendar",
      confidence: matched ? "high" : "medium",
      evidence: matched
        ? `Evento de ${formatDuration(minutes)} no seu calendário, associado a ${project.name}.`
        : `Evento de ${formatDuration(minutes)} no seu calendário (projeto sugerido — confira).`,
    });
  }

  // ── 2. Azure DevOps activity via the autofill engine ──
  for (const proposal of proposals) {
    if (proposal.date !== date) continue;

    items.push({
      id: crypto.randomUUID(),
      projectId: proposal.projectId,
      projectName: proposal.projectName,
      projectColor: proposal.projectColor,
      description: proposal.description,
      minutes: roundToQuarter(proposal.durationMinutes),
      billable: proposal.billable,
      azureWorkItemId: proposal.azureWorkItemId,
      azureWorkItemTitle: proposal.azureWorkItemTitle,
      source: proposalSourceKind(proposal.signal),
      confidence: proposal.confidence,
      evidence: proposal.reasons[0] ?? proposal.durationBasis,
    });
  }

  // ── 3. Pattern fill: close the remaining gap with the weekday habit ──
  const committed = items.reduce((sum, item) => sum + item.minutes, 0);
  const remainder = gapMinutes - committed;

  if (remainder >= 30) {
    const pattern = patterns[0];
    const project = pattern
      ? projects.find((item) => item.id === pattern.projectId)
      : defaultProject;

    if (project) {
      items.push({
        id: crypto.randomUUID(),
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        description:
          pattern?.description ?? "Desenvolvimento e atividades do dia",
        minutes: roundToQuarter(remainder),
        billable: project.billable && defaultBillable,
        azureWorkItemId: null,
        azureWorkItemTitle: null,
        source: "pattern",
        confidence: "low",
        evidence: pattern
          ? `Seu padrão neste dia da semana: ${pattern.weight}× "${pattern.description.slice(0, 60)}" em ${project.name}.`
          : `Bloco para completar o dia em ${project.name} — ajuste como preferir.`,
      });
    }
  }

  // ── 4. Balance: trim/drop lowest-confidence items until the plan fits ──
  const ordered = [...items].sort(
    (a, b) => CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence],
  );

  let total = ordered.reduce((sum, item) => sum + item.minutes, 0);

  for (
    let index = ordered.length - 1;
    index >= 0 && total > gapMinutes;
    index--
  ) {
    const item = ordered[index];
    if (!item) continue;

    const excess = total - gapMinutes;
    const reducible = item.minutes - MIN_ITEM_MINUTES;

    if (reducible >= excess) {
      item.minutes = roundToQuarter(item.minutes - excess);
      total = ordered.reduce((sum, current) => sum + current.minutes, 0);
    } else {
      total -= item.minutes;
      ordered.splice(index, 1);
    }
  }

  const finalItems = ordered.slice(0, MAX_PLAN_ITEMS);

  return {
    ...basePlan,
    items: finalItems,
    planMinutes: finalItems.reduce((sum, item) => sum + item.minutes, 0),
  };
}

// ─── AI refinement ────────────────────────────────────────────────────

const refinementSchema = z.object({
  note: z.string().max(240).optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string().min(3).max(200),
        minutes: z.number().int().min(MIN_ITEM_MINUTES).max(480),
      }),
    )
    .max(MAX_PLAN_ITEMS),
});

const REFINE_SYSTEM_PROMPT = `Você é o revisor de lançamentos de horas do OptSolv Time Tracker.
Recebe um plano de dia proposto (JSON) e devolve APENAS um JSON válido, sem markdown, no formato:
{"note": "frase curta sobre o dia", "items": [{"id": "...", "description": "...", "minutes": 60}]}

Regras invioláveis:
- Mantenha exatamente os mesmos itens (mesmos "id") — nunca adicione ou remova itens.
- Ajuste apenas "description" (português profissional, específica, máx. 140 caracteres, sem emojis) e "minutes" (múltiplos de 15).
- A soma de "minutes" não pode ultrapassar o limite informado.
- Não invente detalhes que não estejam nas evidências.`;

/** Extracts the first JSON object from a possibly noisy model answer. */
function extractJson(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

/**
 * Optional AI pass: better prose, balanced minutes — same items, same
 * projects, same evidence. Returns the original plan on ANY failure.
 */
export async function refineDayPlanWithAI(plan: DayPlan): Promise<DayPlan> {
  if (plan.items.length === 0) return plan;

  const payload = {
    data: plan.date,
    limiteMinutos: plan.gapMinutes,
    itens: plan.items.map((item) => ({
      id: item.id,
      projeto: item.projectName,
      description: item.description,
      minutes: item.minutes,
      origem: item.source,
      evidencia: item.evidence,
    })),
  };

  const completion = await completeText({
    system: REFINE_SYSTEM_PROMPT,
    prompt: JSON.stringify(payload),
    timeoutMs: 15_000,
  });

  if (!completion) return plan;

  try {
    const raw = extractJson(completion.text);
    if (!raw) return plan;

    const parsed = refinementSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return plan;

    const byId = new Map(plan.items.map((item) => [item.id, item]));
    if (parsed.data.items.length !== plan.items.length) return plan;

    let total = 0;
    const refinedItems: DayPlanItem[] = [];

    for (const refined of parsed.data.items) {
      const original = byId.get(refined.id);
      if (!original) return plan;

      const minutes =
        Math.round(refined.minutes / MIN_ITEM_MINUTES) * MIN_ITEM_MINUTES;
      total += minutes;

      refinedItems.push({
        ...original,
        description: refined.description.trim(),
        minutes,
      });
    }

    // The model must respect the gap; tolerate one 15-minute slot of drift.
    if (total > plan.gapMinutes + MIN_ITEM_MINUTES) return plan;

    return {
      ...plan,
      items: refinedItems,
      planMinutes: total,
      refinedBy: completion.provider,
      narrative: parsed.data.note?.trim() || null,
    };
  } catch {
    return plan;
  }
}
