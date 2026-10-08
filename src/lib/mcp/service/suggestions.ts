import {
  assertDayPlannable,
  buildDayPlanForUser,
  DayPlanRejectedError,
} from "@/lib/time-assistant/day-plan";
import { formatInstantWithOffset, getAppTimeZone } from "@/lib/timezone";
import type {
  DayPlan,
  DayPlanItem,
  ReconstructSourceKind,
} from "@/types/reconstruct";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";
import { humanizeMinutes } from "../format";
import { getAgentMicrosoftToken } from "./microsoft";

/**
 * Smart daily suggestions for agents.
 *
 * The same "Preencher meu dia" engine the web uses — Outlook meetings, Teams
 * calls, commit sessions, assigned work items and weekday habits — fed by the
 * server-held Microsoft token, so an agent sees the day exactly as the person
 * does in the browser. Every source is best-effort and failures come back as
 * `warnings`, never as errors.
 */

/** Where a suggestion comes from, in the vocabulary agents see. */
export type AgentSuggestionSource =
  | "calendar"
  | "teams_call"
  | "commits"
  | "work_item"
  | "pattern"
  | "document";

export interface AgentSuggestion {
  /** Deterministic: the same day rebuilds to the same ids. */
  id: string;
  source: AgentSuggestionSource;
  /** Event id, commit session, `pr<id>` or work item id behind the suggestion. */
  sourceRef: string | null;
  /** Null when the evidence did not identify a project: the caller must choose one. */
  projectId: string | null;
  projectName: string | null;
  description: string;
  date: string;
  /** When the activity started, ISO 8601 with offset, for items anchored in time. */
  startsAt: string | null;
  durationMinutes: number;
  durationLabel: string;
  billable: boolean;
  azureWorkItemId: number | null;
  confidence: "high" | "medium" | "low";
  /** Why this was suggested; also exposed as `reasons` for older clients. */
  evidence: string;
  reasons: string[];
}

export interface SuggestDailyEntriesResult {
  date: string;
  suggestions: AgentSuggestion[];
  alreadyLoggedMinutes: number;
  alreadyLoggedLabel: string;
  targetMinutes: number;
  /** Minutes still missing to reach the day's target. */
  gapMinutes: number;
  sources: {
    outlook: boolean;
    teamsCalls: boolean;
    azureDevOps: boolean;
    /** The user's own weekday habits contributed a suggestion. */
    history: boolean;
    /** How many suggestions came from commit sessions. */
    commits: number;
  };
  warnings: string[];
  notes: string[];
}

/** Collapses the engine's eight evidence kinds into the agent vocabulary. */
export function toAgentSource(
  source: ReconstructSourceKind,
): AgentSuggestionSource {
  switch (source) {
    case "calendar":
    case "teams_attendance":
      return "calendar";
    case "teams_call":
      return "teams_call";
    case "commits":
    case "pull_request":
      return "commits";
    case "work_item":
      return "work_item";
    case "document":
      return "document";
    case "pattern":
      return "pattern";
  }
}

function toAgentSuggestion(
  item: DayPlanItem,
  date: string,
  timeZone: string,
): AgentSuggestion {
  return {
    id: item.id,
    source: toAgentSource(item.source),
    sourceRef: item.sourceRef ?? null,
    projectId: item.projectId,
    projectName: item.projectId ? item.projectName : null,
    description: item.description,
    date,
    startsAt: item.startsAt
      ? formatInstantWithOffset(item.startsAt, timeZone)
      : null,
    durationMinutes: item.minutes,
    durationLabel: humanizeMinutes(item.minutes),
    billable: item.billable,
    azureWorkItemId: item.azureWorkItemId,
    confidence: item.confidence,
    evidence: item.evidence,
    reasons: [item.evidence],
  };
}

/** Shapes a day plan into the agent contract. Pure. */
export function buildSuggestResult(
  plan: DayPlan,
  timeZone: string = getAppTimeZone(),
): SuggestDailyEntriesResult {
  const suggestions = plan.items.map((item) =>
    toAgentSuggestion(item, plan.date, timeZone),
  );

  const notes: string[] = [];
  if (suggestions.length === 0) {
    notes.push(
      plan.gapMinutes <= 0
        ? "O dia já está completo — não há o que sugerir."
        : "Nenhuma sugestão automática para este dia. Pergunte ao usuário o que foi feito e use opt_time_log_time.",
    );
  }
  if (suggestions.some((item) => item.projectId === null)) {
    notes.push(
      "Sugestões sem projeto identificado exigem que o usuário escolha o projeto; informe-o em 'projectId' ao aplicar.",
    );
  }

  return {
    date: plan.date,
    suggestions,
    alreadyLoggedMinutes: plan.existingMinutes,
    alreadyLoggedLabel: humanizeMinutes(plan.existingMinutes),
    targetMinutes: plan.targetMinutes,
    gapMinutes: plan.gapMinutes,
    sources: {
      outlook: plan.sources.calendar,
      teamsCalls: plan.sources.calls ?? false,
      azureDevOps: plan.sources.azureDevops,
      history: plan.sources.patterns,
      commits: suggestions.filter((item) => item.source === "commits").length,
    },
    warnings: plan.warnings,
    notes,
  };
}

/** Collaborators the suggestion flow needs, injectable so the logic runs offline. */
export interface SuggestionsDeps {
  assertPlannable: (userId: string, date: string) => Promise<void>;
  getToken: (principal: AgentPrincipal) => Promise<string | null>;
  buildPlan: (input: {
    userId: string;
    date: string;
    microsoftAccessToken: string | null;
  }) => Promise<DayPlan>;
}

export const defaultSuggestionsDeps: SuggestionsDeps = {
  assertPlannable: assertDayPlannable,
  getToken: getAgentMicrosoftToken,
  buildPlan: buildDayPlanForUser,
};

/** Shown when the token cannot read the calendar, so the plan skips Outlook and Teams. */
export const CALENDAR_SCOPE_WARNING =
  "Reuniões e chamadas do Teams não foram consideradas: o token não tem o escopo calendar:read.";

/** Translates a day that cannot be planned into the agent error vocabulary. */
export function toAgentPlanError(error: unknown): unknown {
  if (!(error instanceof DayPlanRejectedError)) return error;

  return new AgentError(
    error.reason === "period_locked" ? "PERIOD_LOCKED" : "VALIDATION_ERROR",
    error.message,
  );
}

/**
 * Builds the day plan for the principal without any presentation concerns.
 * Shared by `suggestDailyEntries` and `applySuggestions`.
 *
 * @throws {AgentError} `VALIDATION_ERROR` for future or out-of-window dates,
 * `PERIOD_LOCKED` when the week was already submitted or approved.
 */
export async function loadDayPlan(
  principal: AgentPrincipal,
  date: string,
  deps: SuggestionsDeps = defaultSuggestionsDeps,
): Promise<DayPlan> {
  try {
    await deps.assertPlannable(principal.userId, date);

    // The calendar is personal data: a token that was never granted
    // `calendar:read` does not get meeting titles through the suggestions
    // either. Without a Graph token the plan simply loses the calendar.
    const canReadCalendar = principal.scopes.includes("calendar:read");
    const microsoftAccessToken = canReadCalendar
      ? await deps.getToken(principal)
      : null;

    const plan = await deps.buildPlan({
      userId: principal.userId,
      date,
      microsoftAccessToken,
    });

    if (canReadCalendar) return plan;

    return {
      ...plan,
      warnings: [
        CALENDAR_SCOPE_WARNING,
        // "Reconecte sua conta Microsoft…" would blame the wrong thing here.
        ...plan.warnings.filter(
          (warning) => !warning.startsWith("Reconecte sua conta Microsoft"),
        ),
      ],
    };
  } catch (error: unknown) {
    throw toAgentPlanError(error);
  }
}

export async function suggestDailyEntries(
  principal: AgentPrincipal,
  date: string,
  deps: SuggestionsDeps = defaultSuggestionsDeps,
): Promise<SuggestDailyEntriesResult> {
  const plan = await loadDayPlan(principal, date, deps);
  return buildSuggestResult(plan);
}
