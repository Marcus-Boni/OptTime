import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { triggerCompletedWorkSync } from "@/lib/azure-devops/sync";
import { db } from "@/lib/db";
import { apiIdempotencyKey, timeEntry } from "@/lib/db/schema";
import {
  type ApplyPlanItem,
  applyDayPlanEntries,
  CallAlreadyAppliedError,
  DayLimitError,
  type RejectedPlanItem,
} from "@/lib/time-assistant/apply-day-plan";
import { clearCachedSuggestionsByPrefix } from "@/lib/time-assistant/cache";
import {
  type ApplySuggestionsInput,
  applySuggestionsSchema,
} from "@/lib/validations/apply-suggestions.schema";
import type { DayPlan, DayPlanItem } from "@/types/reconstruct";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";
import {
  hashIdempotencyInput,
  runIdempotentInTransaction,
} from "../idempotency";
import { clearAgendaCache } from "./agenda";
import { resolveProject } from "./projects";
import { defaultSuggestionsDeps, loadDayPlan } from "./suggestions";

/**
 * Applies reviewed suggestions as time entries, atomically and idempotently.
 *
 * The client never supplies durations or projects it was not offered: each
 * `suggestionId` is resolved against a plan rebuilt on the server, and only the
 * four documented edits (project, minutes, description, billable) can override
 * it — all re-validated here.
 */

export const APPLY_SCOPE = "apply_suggestions";

export interface ApplySuggestionsResult {
  date: string;
  createdEntryIds: string[];
  dayTotalMinutes: number;
  dailyCapacityMinutes: number;
  remainingMinutes: number;
  /** True when the idempotency key had already been applied: nothing was written. */
  replayed: boolean;
}

/** What gets stored for replay — everything except the replay flag itself. */
type StoredOutcome = Omit<ApplySuggestionsResult, "replayed">;

/** Minimum minutes for anything except a measured Teams call (same as the web). */
const MIN_ITEM_MINUTES = 5;

const REJECTION_SOURCES: Record<DayPlanItem["source"], string> = {
  calendar: "calendar",
  teams_attendance: "calendar",
  teams_call: "teams_call",
  document: "document",
  pull_request: "pull_request",
  commits: "commits",
  work_item: "work_item",
  pattern: "pattern",
};

/**
 * The fingerprint a later rebuild will recognise for a dismissed suggestion.
 *
 * Work items and pull requests reuse the radar's format, which the day plan
 * already honours; everything else is recorded for learning only.
 */
export function rejectionFingerprint(date: string, item: DayPlanItem): string {
  if (item.source === "work_item" && item.projectId && item.sourceRef) {
    return `autofill:work_item_active:${date}:${item.projectId}:wi${item.sourceRef}`;
  }

  if (
    item.source === "pull_request" &&
    item.projectId &&
    item.sourceRef?.startsWith("pr")
  ) {
    return `autofill:pr_completed:${date}:${item.projectId}:${item.sourceRef}`;
  }

  return `reconstruct:${date}:${item.projectId ?? "none"}:${REJECTION_SOURCES[item.source]}`;
}

/** Collaborators the apply flow needs, injectable so the logic runs offline. */
export interface ApplyDeps {
  loadPlan: (principal: AgentPrincipal, date: string) => Promise<DayPlan>;
  resolveProject: (
    principal: AgentPrincipal,
    reference: string,
  ) => Promise<{ id: string; name: string; billable: boolean }>;
  /** Looks for a previous outcome of this key without taking any lock. */
  peek: (
    principal: AgentPrincipal,
    key: string,
    input: unknown,
  ) => Promise<StoredOutcome | null>;
  /** Writes the entries and the idempotency record in one transaction. */
  commit: (
    principal: AgentPrincipal,
    request: CommitRequest,
  ) => Promise<{ result: StoredOutcome; replayed: boolean }>;
  afterWrite: (
    principal: AgentPrincipal,
    workItemIds: number[],
  ) => Promise<void> | void;
}

export interface CommitRequest {
  key: string;
  input: unknown;
  date: string;
  items: ApplyPlanItem[];
  rejected: RejectedPlanItem[];
  targetMinutes: number;
}

async function sumDayMinutes(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  userId: string,
  date: string,
): Promise<number> {
  const [row] = await tx
    .select({
      minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
    })
    .from(timeEntry)
    .where(
      and(
        eq(timeEntry.userId, userId),
        eq(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
      ),
    );

  return Number(row?.minutes ?? 0);
}

const defaultApplyDeps: ApplyDeps = {
  loadPlan: (principal, date) =>
    loadDayPlan(principal, date, defaultSuggestionsDeps),
  resolveProject: async (principal, reference) => {
    const found = await resolveProject(principal, reference);
    return { id: found.id, name: found.name, billable: found.billable };
  },
  peek: async (principal, key, input) => {
    const [row] = await db
      .select({
        requestHash: apiIdempotencyKey.requestHash,
        response: apiIdempotencyKey.response,
        expiresAt: apiIdempotencyKey.expiresAt,
      })
      .from(apiIdempotencyKey)
      .where(
        and(
          eq(apiIdempotencyKey.userId, principal.userId),
          eq(apiIdempotencyKey.scope, APPLY_SCOPE),
          eq(apiIdempotencyKey.key, key),
          gte(apiIdempotencyKey.expiresAt, new Date()),
        ),
      )
      .limit(1);

    if (!row) return null;

    if (row.requestHash !== hashIdempotencyInput(input)) {
      throw new AgentError(
        "IDEMPOTENCY_CONFLICT",
        "Esta idempotencyKey já foi usada com uma entrada diferente.",
        {
          hint: "Gere um UUID novo para uma operação nova; reutilize a chave só ao repetir exatamente a mesma chamada.",
        },
      );
    }

    return JSON.parse(row.response) as StoredOutcome;
  },
  commit: (principal, request) =>
    runIdempotentInTransaction<StoredOutcome>({
      userId: principal.userId,
      scope: APPLY_SCOPE,
      key: request.key,
      input: request.input,
      execute: async (tx) => {
        const written = await applyDayPlanEntries(tx, {
          userId: principal.userId,
          date: request.date,
          items: request.items,
          rejected: request.rejected,
          provenance: {
            agent: true,
            via: "mcp",
            tokenId: principal.tokenId,
          },
        });

        const dayTotalMinutes = await sumDayMinutes(
          tx,
          principal.userId,
          request.date,
        );

        return {
          date: request.date,
          createdEntryIds: written.entryIds,
          dayTotalMinutes,
          dailyCapacityMinutes: request.targetMinutes,
          remainingMinutes: Math.max(
            0,
            request.targetMinutes - dayTotalMinutes,
          ),
        };
      },
    }),
  afterWrite: (principal, workItemIds) => {
    clearCachedSuggestionsByPrefix(`${principal.userId}:`);
    clearAgendaCache(principal.userId);
    if (workItemIds.length > 0) {
      triggerCompletedWorkSync(principal.userId, workItemIds);
    }
  },
};

function describeInvalid(error: {
  issues: Array<{ path: PropertyKey[]; message: string }>;
}): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => {
      const path = issue.path.map(String).join(".");
      const message = issue.message.replace(/\.$/, "");
      return path ? `${path}: ${message}` : message;
    })
    .join("; ");
}

/**
 * Turns the reviewed items into rows to write, validating every edit.
 *
 * @throws {AgentError} naming the offending item — nothing is written on error.
 */
async function buildRows(
  principal: AgentPrincipal,
  plan: DayPlan,
  input: ApplySuggestionsInput,
  deps: ApplyDeps,
): Promise<{ items: ApplyPlanItem[]; rejected: RejectedPlanItem[] }> {
  const byId = new Map(plan.items.map((item) => [item.id, item]));
  const items: ApplyPlanItem[] = [];

  for (const [index, edit] of input.items.entries()) {
    const suggestion = byId.get(edit.suggestionId);
    if (!suggestion) {
      throw new AgentError(
        "NOT_FOUND",
        `Item ${index + 1}: a sugestão ${edit.suggestionId} não existe mais para ${input.date} — o dia mudou desde que foi gerada.`,
        {
          details: { itemIndex: index, suggestionId: edit.suggestionId },
          hint: "Chame opt_time_suggest_daily_entries de novo e use os ids novos.",
        },
      );
    }

    const editedFields: string[] = [];
    let projectId = suggestion.projectId;
    let billable = suggestion.billable;

    if (edit.projectId) {
      const chosen = await deps.resolveProject(principal, edit.projectId);
      if (chosen.id !== suggestion.projectId) {
        editedFields.push("projectId");
        // A project the engine did not pick brings its own billing default.
        billable = chosen.billable && plan.defaultBillable;
      }
      projectId = chosen.id;
    }

    if (!projectId) {
      throw new AgentError(
        "VALIDATION_ERROR",
        `Item ${index + 1}: a sugestão ${edit.suggestionId} não tem projeto identificado — informe 'projectId'.`,
        { details: { itemIndex: index, suggestionId: edit.suggestionId } },
      );
    }

    const minutes = edit.durationMinutes ?? suggestion.minutes;
    if (edit.durationMinutes !== undefined && minutes !== suggestion.minutes) {
      editedFields.push("minutes");
    }
    if (suggestion.source !== "teams_call" && minutes < MIN_ITEM_MINUTES) {
      throw new AgentError(
        "VALIDATION_ERROR",
        `Item ${index + 1}: duração mínima de ${MIN_ITEM_MINUTES} minutos (recebido ${minutes}).`,
        { details: { itemIndex: index, suggestionId: edit.suggestionId } },
      );
    }

    const description = edit.description ?? suggestion.description;
    if (
      edit.description !== undefined &&
      edit.description !== suggestion.description
    ) {
      editedFields.push("description");
    }

    if (edit.billable !== undefined) {
      if (edit.billable !== billable) editedFields.push("billable");
      billable = edit.billable;
    }

    items.push({
      projectId,
      description,
      minutes,
      billable,
      azureWorkItemId: suggestion.azureWorkItemId,
      azureWorkItemTitle: suggestion.azureWorkItemTitle,
      source: suggestion.source,
      sourceId:
        suggestion.source === "teams_call"
          ? (suggestion.sourceRef ?? undefined)
          : undefined,
      editedFields,
    });
  }

  // A rejection of something the plan no longer holds is harmless: skip it.
  const rejected = input.rejectedSuggestionIds.flatMap((id) => {
    const dismissed = byId.get(id);
    if (!dismissed) return [];
    return [
      {
        fingerprint: rejectionFingerprint(input.date, dismissed),
        source: dismissed.source,
        projectId: dismissed.projectId,
      },
    ];
  });

  return { items, rejected };
}

/**
 * Applies the reviewed suggestions.
 *
 * @throws {AgentError} `VALIDATION_ERROR` for malformed input or an item that
 * cannot be applied (the message names which), `NOT_FOUND` for a stale
 * suggestion id, `PERIOD_LOCKED` for a submitted week, `IDEMPOTENCY_CONFLICT`
 * when the key was used with different input.
 */
export async function applySuggestions(
  principal: AgentPrincipal,
  rawInput: unknown,
  deps: ApplyDeps = defaultApplyDeps,
): Promise<ApplySuggestionsResult> {
  const parsed = applySuggestionsSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AgentError(
      "VALIDATION_ERROR",
      `Entrada inválida — ${describeInvalid(parsed.error)}.`,
      { details: parsed.error.flatten() },
    );
  }

  const input = parsed.data;

  // The ledger is consulted first: once a key has been applied, the suggestions
  // it referred to are gone from the plan, so rebuilding it would only fail.
  const previous = await deps.peek(principal, input.idempotencyKey, input);
  if (previous) return { ...previous, replayed: true };

  const plan = await deps.loadPlan(principal, input.date);
  const { items, rejected } = await buildRows(principal, plan, input, deps);

  try {
    const { result, replayed } = await deps.commit(principal, {
      key: input.idempotencyKey,
      input,
      date: input.date,
      items,
      rejected,
      targetMinutes: plan.targetMinutes,
    });

    if (!replayed) {
      await deps.afterWrite(principal, [
        ...new Set(
          items
            .map((item) => item.azureWorkItemId)
            .filter((id): id is number => id != null),
        ),
      ]);

      // Audit trail: who wrote, how much, never what was written.
      console.info("[mcp][apply_suggestions]", {
        userId: principal.userId,
        tokenId: principal.tokenId,
        date: input.date,
        entries: result.createdEntryIds.length,
        edited: items.filter((item) => (item.editedFields ?? []).length > 0)
          .length,
        rejected: rejected.length,
      });
    }

    return { ...result, replayed };
  } catch (error: unknown) {
    if (error instanceof DayLimitError) {
      throw new AgentError("VALIDATION_ERROR", error.message);
    }
    if (error instanceof CallAlreadyAppliedError) {
      throw new AgentError("CONFLICT", error.message, {
        hint: "Chame opt_time_suggest_daily_entries de novo: a chamada já virou um lançamento.",
      });
    }
    throw error;
  }
}
