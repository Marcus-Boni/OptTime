import { createHash } from "node:crypto";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { apiIdempotencyKey } from "@/lib/db/schema";
import type { DbTransaction } from "@/lib/time-assistant/apply-day-plan";
import { AgentError } from "./errors";

/**
 * Idempotency for agent writes.
 *
 * A desktop assistant retries when the network drops mid-request, so a write
 * that already landed must not land twice. The client mints one key per logical
 * operation; this module remembers what the key produced for 24 hours:
 *
 *  - same key, same input → the stored response, nothing written;
 *  - same key, different input → `IDEMPOTENCY_CONFLICT` (a client bug);
 *  - a failed attempt stores nothing, so the same key can be retried.
 *
 * The decision logic is separated from storage so it can be verified offline.
 */

export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

/** A UUID fits; anything printable and short enough is accepted. */
const KEY_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;

/**
 * Validates the caller-supplied key.
 *
 * @throws {AgentError} `VALIDATION_ERROR` when the key is missing or malformed.
 */
export function parseIdempotencyKey(value: unknown): string {
  if (typeof value !== "string" || !KEY_PATTERN.test(value.trim())) {
    throw new AgentError(
      "VALIDATION_ERROR",
      "Informe 'idempotencyKey': um identificador único (UUID) gerado pelo cliente para esta operação.",
      {
        hint: "Gere um UUID novo por operação e reutilize o mesmo valor apenas ao repetir a mesma chamada.",
      },
    );
  }
  return value.trim();
}

/** JSON with object keys sorted, so equal inputs always hash equal. */
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, item]) => item !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonicalize(item)]),
    );
  }
  return value;
}

/** SHA-256 of the canonical JSON form of an operation's input. */
export function hashIdempotencyInput(input: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonicalize(input)))
    .digest("hex");
}

export interface IdempotencyRecord {
  requestHash: string;
  response: unknown;
  expiresAt: Date;
}

/** Where idempotency records live. The database in production, a map in tests. */
export interface IdempotencyStore {
  find: (scope: string, key: string) => Promise<IdempotencyRecord | null>;
  save: (
    scope: string,
    key: string,
    record: IdempotencyRecord,
  ) => Promise<void>;
  remove: (scope: string, key: string) => Promise<void>;
}

export interface RunIdempotentInput<T> {
  store: IdempotencyStore;
  scope: string;
  key: string;
  /** Everything that defines the operation; hashed to detect key reuse. */
  input: unknown;
  execute: () => Promise<T>;
  now?: Date;
}

/**
 * Runs `execute` at most once per key.
 *
 * @throws {AgentError} `IDEMPOTENCY_CONFLICT` when the key was already used with
 * a different input.
 */
export async function runIdempotent<T>({
  store,
  scope,
  key,
  input,
  execute,
  now = new Date(),
}: RunIdempotentInput<T>): Promise<{ result: T; replayed: boolean }> {
  const requestHash = hashIdempotencyInput(input);
  const existing = await store.find(scope, key);

  if (existing) {
    if (existing.expiresAt.getTime() > now.getTime()) {
      if (existing.requestHash !== requestHash) throw idempotencyConflict();
      return { result: existing.response as T, replayed: true };
    }

    await store.remove(scope, key);
  }

  const result = await execute();

  await store.save(scope, key, {
    requestHash,
    response: result,
    expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
  });

  return { result, replayed: false };
}

export interface PeekIdempotencyInput {
  userId: string;
  scope: string;
  key: string;
  /** The same value the write will later pass to `runIdempotent`. */
  input: unknown;
}

/**
 * Looks for the stored outcome of a key without opening a transaction or taking
 * a lock.
 *
 * Callers use it before doing any expensive or validating work: once a key has
 * been applied, the state it depended on (suggestions that no longer exist, a
 * week that was submitted since) has moved on, so re-validating would fail a
 * request that is simply a repeat.
 *
 * @returns the stored response, or null when the key is unused or expired.
 * @throws {AgentError} `IDEMPOTENCY_CONFLICT` when the key belongs to a
 * different input.
 */
export async function peekIdempotency<T>(
  args: PeekIdempotencyInput,
): Promise<T | null> {
  const [row] = await db
    .select({
      requestHash: apiIdempotencyKey.requestHash,
      response: apiIdempotencyKey.response,
    })
    .from(apiIdempotencyKey)
    .where(
      and(
        eq(apiIdempotencyKey.userId, args.userId),
        eq(apiIdempotencyKey.scope, args.scope),
        eq(apiIdempotencyKey.key, args.key),
        gte(apiIdempotencyKey.expiresAt, new Date()),
      ),
    )
    .limit(1);

  if (!row) return null;

  if (row.requestHash !== hashIdempotencyInput(args.input)) {
    throw idempotencyConflict();
  }

  return JSON.parse(row.response) as T;
}

function idempotencyConflict(): AgentError {
  return new AgentError(
    "IDEMPOTENCY_CONFLICT",
    "Esta idempotencyKey já foi usada com uma entrada diferente.",
    {
      hint: "Gere um UUID novo para uma operação nova; reutilize a chave só ao repetir exatamente a mesma chamada.",
    },
  );
}

/** Database-backed store bound to one transaction and one user. */
export function createDbIdempotencyStore(
  tx: DbTransaction,
  userId: string,
): IdempotencyStore {
  return {
    find: async (scope, key) => {
      const [row] = await tx
        .select({
          requestHash: apiIdempotencyKey.requestHash,
          response: apiIdempotencyKey.response,
          expiresAt: apiIdempotencyKey.expiresAt,
        })
        .from(apiIdempotencyKey)
        .where(
          and(
            eq(apiIdempotencyKey.userId, userId),
            eq(apiIdempotencyKey.scope, scope),
            eq(apiIdempotencyKey.key, key),
          ),
        )
        .limit(1);

      if (!row) return null;

      return {
        requestHash: row.requestHash,
        response: JSON.parse(row.response) as unknown,
        expiresAt: row.expiresAt,
      };
    },
    save: async (scope, key, record) => {
      await tx.insert(apiIdempotencyKey).values({
        id: crypto.randomUUID(),
        userId,
        scope,
        key,
        requestHash: record.requestHash,
        response: JSON.stringify(record.response),
        expiresAt: record.expiresAt,
      });
    },
    remove: async (scope, key) => {
      await tx
        .delete(apiIdempotencyKey)
        .where(
          and(
            eq(apiIdempotencyKey.userId, userId),
            eq(apiIdempotencyKey.scope, scope),
            eq(apiIdempotencyKey.key, key),
          ),
        );
    },
  };
}

export interface RunIdempotentInTransactionInput<T> {
  userId: string;
  scope: string;
  key: string;
  input: unknown;
  /** Work to do exactly once. Runs inside the transaction that records the key. */
  execute: (tx: DbTransaction) => Promise<T>;
}

/**
 * Database flavour of `runIdempotent`: one transaction holds an advisory lock on
 * the key, performs the work and records the key — so two concurrent retries
 * serialize, and the entries and the record commit or roll back together.
 */
export async function runIdempotentInTransaction<T>(
  args: RunIdempotentInTransactionInput<T>,
): Promise<{ result: T; replayed: boolean }> {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${args.userId}), hashtext(${`${args.scope}:${args.key}`}))`,
    );

    // Expired records are swept by whoever writes next; there is no cron.
    await tx
      .delete(apiIdempotencyKey)
      .where(
        and(
          eq(apiIdempotencyKey.userId, args.userId),
          lte(apiIdempotencyKey.expiresAt, new Date()),
        ),
      );

    return runIdempotent({
      store: createDbIdempotencyStore(tx, args.userId),
      scope: args.scope,
      key: args.key,
      input: args.input,
      execute: () => args.execute(tx),
    });
  });
}
