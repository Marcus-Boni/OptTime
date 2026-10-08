import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { db } from "@/lib/db";
import { timeEntry, timeSuggestionFeedback } from "@/lib/db/schema";
import type { ReconstructSourceKind } from "@/types/reconstruct";

/**
 * The transactional core of "apply a day plan", shared by the web route and
 * the agent API.
 *
 * It creates every accepted item as a time entry and records the feedback that
 * keeps the suggestion engine learning — all inside the caller's transaction,
 * so the agent path can commit its idempotency record in the same breath.
 */

export const MAX_DAY_MINUTES = 24 * 60;

/** Raised when the day would exceed 24 hours once the plan is applied. */
export class DayLimitError extends Error {
  constructor() {
    super("O total do dia ultrapassaria 24 horas.");
    this.name = "DayLimitError";
  }
}

/** Raised when a Teams call in the plan was already turned into an entry. */
export class CallAlreadyAppliedError extends Error {
  constructor() {
    super(
      "Uma chamada deste plano já foi registrada. Atualize as sugestões antes de continuar.",
    );
    this.name = "CallAlreadyAppliedError";
  }
}

export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface ApplyPlanItem {
  projectId: string;
  description: string;
  minutes: number;
  billable: boolean;
  azureWorkItemId?: number | null;
  azureWorkItemTitle?: string | null;
  source: ReconstructSourceKind;
  sourceId?: string;
  /**
   * Fields the person changed relative to the suggestion. Empty or absent
   * records plain acceptance; any entry records an "edited" outcome.
   */
  editedFields?: string[];
}

export interface RejectedPlanItem {
  /** Fingerprint the suggestion engine matches on a later rebuild. */
  fingerprint: string;
  source: ReconstructSourceKind;
  projectId: string | null;
}

export interface ApplyDayPlanInput {
  userId: string;
  date: string;
  items: ApplyPlanItem[];
  rejected?: RejectedPlanItem[];
  /** Extra provenance merged into every feedback row, e.g. which client wrote. */
  provenance?: Record<string, unknown>;
}

export interface ApplyDayPlanResult {
  entryIds: string[];
  totalMinutes: number;
}

function acceptanceFingerprint(date: string, item: ApplyPlanItem): string {
  return item.source === "teams_call" && item.sourceId
    ? `teams_call:${item.sourceId}`
    : `reconstruct:${date}:${item.projectId}:${item.source}`;
}

/**
 * Creates the entries and feedback rows for a day plan.
 *
 * @throws {DayLimitError} when the day would pass 24 hours.
 * @throws {CallAlreadyAppliedError} when a Teams call was already registered.
 */
export async function applyDayPlanEntries(
  tx: DbTransaction,
  input: ApplyDayPlanInput,
): Promise<ApplyDayPlanResult> {
  const { userId, date, items, rejected = [], provenance = {} } = input;
  const newMinutes = items.reduce((sum, item) => sum + item.minutes, 0);

  // Serialize this review flow across tabs before checking evidence or totals.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${userId}), hashtext(${date}))`,
  );

  const [existingTotals] = await tx
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

  if (Number(existingTotals?.minutes ?? 0) + newMinutes > MAX_DAY_MINUTES) {
    throw new DayLimitError();
  }

  const callFingerprints = items.flatMap((item) =>
    item.source === "teams_call" && item.sourceId
      ? [`teams_call:${item.sourceId}`]
      : [],
  );

  if (callFingerprints.length > 0) {
    const existing = await tx
      .select({ id: timeSuggestionFeedback.id })
      .from(timeSuggestionFeedback)
      .where(
        and(
          eq(timeSuggestionFeedback.userId, userId),
          eq(timeSuggestionFeedback.date, date),
          inArray(timeSuggestionFeedback.action, ["accepted", "edited"]),
          inArray(
            timeSuggestionFeedback.suggestionFingerprint,
            callFingerprints,
          ),
        ),
      )
      .limit(1);

    if (
      existing.length > 0 ||
      new Set(callFingerprints).size !== callFingerprints.length
    ) {
      throw new CallAlreadyAppliedError();
    }
  }

  const entryIds: string[] = [];

  for (const item of items) {
    const id = crypto.randomUUID();
    entryIds.push(id);

    await tx.insert(timeEntry).values({
      id,
      userId,
      projectId: item.projectId,
      description: item.description.trim(),
      date,
      duration: item.minutes,
      billable: item.billable,
      azureWorkItemId: item.azureWorkItemId ?? null,
      azureWorkItemTitle: item.azureWorkItemTitle ?? null,
      azdoSyncStatus: item.azureWorkItemId ? "pending" : "none",
    });

    const editedFields = item.editedFields ?? [];

    await tx.insert(timeSuggestionFeedback).values({
      id: crypto.randomUUID(),
      userId,
      date,
      suggestionFingerprint: acceptanceFingerprint(date, item),
      action: editedFields.length > 0 ? "edited" : "accepted",
      editedFields: editedFields.length > 0 ? editedFields.join(",") : null,
      sourceBreakdown: JSON.stringify({
        source: item.source,
        sourceId: item.sourceId,
        timeEntryId: id,
        minutes: item.minutes,
        reconstruct: true,
        ...provenance,
      }),
      score: null,
    });
  }

  for (const dismissal of rejected) {
    await tx.insert(timeSuggestionFeedback).values({
      id: crypto.randomUUID(),
      userId,
      date,
      suggestionFingerprint: dismissal.fingerprint,
      action: "rejected",
      editedFields: null,
      sourceBreakdown: JSON.stringify({
        source: dismissal.source,
        projectId: dismissal.projectId,
        reconstruct: true,
        ...provenance,
      }),
      score: null,
    });
  }

  return { entryIds, totalMinutes: newMinutes };
}
