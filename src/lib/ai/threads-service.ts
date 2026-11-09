import { and, desc, eq, notInArray, sql } from "drizzle-orm";
import type { OperatorInputMode } from "@/lib/ai/operator/types";
import type {
  AssistantAction,
  AssistantCard,
  ProviderName,
} from "@/lib/ai/types";
import { db } from "@/lib/db";
import { operatorActionLog, timebotThread } from "@/lib/db/schema";
import type {
  PatchTimeBotThreadInput,
  PersistedTimeBotMessageInput,
  SyncTimeBotThreadsInput,
} from "@/lib/validations/ai.schema";

export const MAX_PERSISTED_MESSAGES = 60;
export const MAX_THREADS = 20;
export const MAX_EXECUTED_KEYS = 400;

export interface PersistedTimeBotMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: AssistantCard[];
  actions: AssistantAction[];
  provider?: ProviderName;
  error?: string;
  inputMode?: OperatorInputMode;
  createdAt: number;
}

export interface PersistedTimeBotThread {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messages: PersistedTimeBotMessage[];
}

export interface TimeBotThreadsStatePayload {
  activeThreadId: string;
  threads: PersistedTimeBotThread[];
  executedKeys: string[];
}

let tableEnsured = false;

/**
 * Ensures the `timebot_thread` table exists even if a local or staging
 * environment has not run `pnpm db:migrate` yet.
 */
async function ensureTimebotThreadTable(): Promise<void> {
  if (tableEnsured) return;

  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "timebot_thread" (
        "id" text PRIMARY KEY NOT NULL,
        "user_id" text NOT NULL REFERENCES "public"."user"("id") ON DELETE cascade,
        "title" text DEFAULT 'Nova conversa' NOT NULL,
        "messages" text DEFAULT '[]' NOT NULL,
        "is_active" boolean DEFAULT false NOT NULL,
        "executed_keys" text DEFAULT '[]' NOT NULL,
        "created_at" timestamp DEFAULT now() NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      );
    `);
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS "timebot_thread_user_updated_idx"
      ON "timebot_thread" USING btree ("user_id", "updated_at");
    `);
    tableEnsured = true;
  } catch (error: unknown) {
    console.error("[threads-service] ensureTimebotThreadTable:", error);
  }
}

function toRowId(userId: string, threadId: string): string {
  const prefix = `${userId}:`;
  return threadId.startsWith(prefix) ? threadId : `${prefix}${threadId}`;
}

function fromRowId(userId: string, rowId: string): string {
  const prefix = `${userId}:`;
  return rowId.startsWith(prefix) ? rowId.slice(prefix.length) : rowId;
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function sanitizeMessage(
  raw: PersistedTimeBotMessageInput | PersistedTimeBotMessage,
): PersistedTimeBotMessage {
  return {
    id: String(raw.id),
    role: raw.role === "assistant" ? "assistant" : "user",
    content: typeof raw.content === "string" ? raw.content.slice(0, 32000) : "",
    cards: Array.isArray(raw.cards)
      ? (raw.cards.slice(0, 30) as unknown as AssistantCard[])
      : [],
    actions: Array.isArray(raw.actions)
      ? (raw.actions.slice(0, 30) as unknown as AssistantAction[])
      : [],
    ...(raw.provider ? { provider: raw.provider } : {}),
    ...(raw.error ? { error: String(raw.error).slice(0, 1000) } : {}),
    ...(raw.inputMode ? { inputMode: raw.inputMode } : {}),
    createdAt:
      typeof raw.createdAt === "number" && Number.isFinite(raw.createdAt)
        ? Math.trunc(raw.createdAt)
        : Date.now(),
  };
}

function serializeRow(
  userId: string,
  row: typeof timebotThread.$inferSelect,
): PersistedTimeBotThread {
  const rawMessages = parseJsonArray<PersistedTimeBotMessage>(row.messages);
  return {
    id: fromRowId(userId, row.id),
    title: row.title || "Nova conversa",
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
    messages: rawMessages
      .slice(-MAX_PERSISTED_MESSAGES)
      .map((msg) => sanitizeMessage(msg)),
  };
}

function mergeExecutedKeys(
  ...lists: ReadonlyArray<readonly string[]>
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];

  for (const list of lists) {
    for (const item of list) {
      if (typeof item === "string" && item.length > 0 && !seen.has(item)) {
        seen.add(item);
        merged.push(item);
      }
    }
  }

  return merged.length > MAX_EXECUTED_KEYS
    ? merged.slice(-MAX_EXECUTED_KEYS)
    : merged;
}

/**
 * Lists the signed-in user's persisted TimeBot threads and executed action keys.
 */
export async function listUserTimeBotThreads(
  userId: string,
): Promise<TimeBotThreadsStatePayload> {
  await ensureTimebotThreadTable();

  const [rows, logRows] = await Promise.all([
    db
      .select()
      .from(timebotThread)
      .where(eq(timebotThread.userId, userId))
      .orderBy(desc(timebotThread.updatedAt))
      .limit(MAX_THREADS),
    db
      .select({ planId: operatorActionLog.planId })
      .from(operatorActionLog)
      .where(eq(operatorActionLog.userId, userId))
      .orderBy(desc(operatorActionLog.createdAt))
      .limit(100)
      .catch(() => []),
  ]);

  const threads = rows.map((row) => serializeRow(userId, row));
  const activeRow = rows.find((row) => row.isActive);
  const activeThreadId = activeRow
    ? fromRowId(userId, activeRow.id)
    : (threads[0]?.id ?? "");

  const rowExecutedLists = rows.map((row) =>
    parseJsonArray<string>(row.executedKeys),
  );
  const logPlanKeys = logRows
    .map((row) => (row.planId ? `plan:${row.planId}` : ""))
    .filter((key): key is string => key.length > 0);

  const executedKeys = mergeExecutedKeys(...rowExecutedLists, logPlanKeys);

  return {
    activeThreadId,
    threads,
    executedKeys,
  };
}

/**
 * Synchronizes the user's conversation threads and executed action keys.
 */
export async function syncUserTimeBotThreads(
  userId: string,
  input: SyncTimeBotThreadsInput,
): Promise<TimeBotThreadsStatePayload> {
  await ensureTimebotThreadTable();

  const existingRows = await db
    .select({
      id: timebotThread.id,
      executedKeys: timebotThread.executedKeys,
    })
    .from(timebotThread)
    .where(eq(timebotThread.userId, userId));

  const existingExecuted = existingRows.map((row) =>
    parseJsonArray<string>(row.executedKeys),
  );
  const mergedExecuted = mergeExecutedKeys(
    ...existingExecuted,
    input.executedKeys ?? [],
  );
  const serializedExecuted = JSON.stringify(mergedExecuted);

  // Deduplicate by client thread id and keep at most MAX_THREADS sorted by updatedAt desc.
  const byId = new Map<string, SyncTimeBotThreadsInput["threads"][number]>();
  for (const thread of input.threads) {
    const cleanId = fromRowId(userId, thread.id.trim());
    if (!cleanId) continue;
    const prev = byId.get(cleanId);
    if (!prev || thread.updatedAt >= prev.updatedAt) {
      byId.set(cleanId, { ...thread, id: cleanId });
    }
  }

  const sorted = [...byId.values()]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS);

  const requestedActiveId = input.activeThreadId
    ? fromRowId(userId, input.activeThreadId.trim())
    : "";
  const resolvedActiveId =
    sorted.find((thread) => thread.id === requestedActiveId)?.id ??
    sorted[0]?.id ??
    "";

  const keepRowIds: string[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const item = sorted[index];
    if (!item) continue;

    const rowId = toRowId(userId, item.id);
    keepRowIds.push(rowId);

    const cleanTitle =
      item.title.replace(/\s+/g, " ").trim().slice(0, 120) || "Nova conversa";
    const cleanMessages = item.messages
      .slice(-MAX_PERSISTED_MESSAGES)
      .map((msg) => sanitizeMessage(msg));
    const createdAtDate = new Date(
      item.createdAt > 0 ? item.createdAt : Date.now(),
    );
    const updatedAtDate = new Date(
      item.updatedAt > 0 ? item.updatedAt : Date.now(),
    );
    const isActive = item.id === resolvedActiveId;
    // Store executedKeys on the active (or first) thread row to avoid duplicating across all 20 rows.
    const rowExecutedJson = isActive || index === 0 ? serializedExecuted : "[]";

    await db
      .insert(timebotThread)
      .values({
        id: rowId,
        userId,
        title: cleanTitle,
        messages: JSON.stringify(cleanMessages),
        isActive,
        executedKeys: rowExecutedJson,
        createdAt: createdAtDate,
        updatedAt: updatedAtDate,
      })
      .onConflictDoUpdate({
        target: timebotThread.id,
        set: {
          title: cleanTitle,
          messages: JSON.stringify(cleanMessages),
          isActive,
          executedKeys: rowExecutedJson,
          updatedAt: updatedAtDate,
        },
        setWhere: eq(timebotThread.userId, userId),
      });
  }

  if (keepRowIds.length > 0) {
    await db
      .delete(timebotThread)
      .where(
        and(
          eq(timebotThread.userId, userId),
          notInArray(timebotThread.id, keepRowIds),
        ),
      );
  } else {
    await db.delete(timebotThread).where(eq(timebotThread.userId, userId));
  }

  return listUserTimeBotThreads(userId);
}

/**
 * Deletes a single conversation thread owned by `userId`.
 */
export async function deleteUserTimeBotThread(
  userId: string,
  threadId: string,
): Promise<boolean> {
  await ensureTimebotThreadTable();

  const rowId = toRowId(userId, threadId);
  const deleted = await db
    .delete(timebotThread)
    .where(and(eq(timebotThread.id, rowId), eq(timebotThread.userId, userId)))
    .returning({ id: timebotThread.id });

  return deleted.length > 0;
}

/**
 * Updates metadata (title and/or active flag) of a single thread owned by `userId`.
 */
export async function patchUserTimeBotThread(
  userId: string,
  threadId: string,
  input: PatchTimeBotThreadInput,
): Promise<PersistedTimeBotThread | null> {
  await ensureTimebotThreadTable();

  const rowId = toRowId(userId, threadId);

  if (input.isActive === true) {
    await db
      .update(timebotThread)
      .set({ isActive: false })
      .where(eq(timebotThread.userId, userId));
  }

  const updateFields: Partial<typeof timebotThread.$inferInsert> = {};
  if (input.title !== undefined) {
    updateFields.title =
      input.title.replace(/\s+/g, " ").trim().slice(0, 120) || "Nova conversa";
  }
  if (input.isActive !== undefined) {
    updateFields.isActive = input.isActive;
  }

  const [updated] = await db
    .update(timebotThread)
    .set(updateFields)
    .where(and(eq(timebotThread.id, rowId), eq(timebotThread.userId, userId)))
    .returning();

  return updated ? serializeRow(userId, updated) : null;
}
