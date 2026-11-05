import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import type { AwardSubmissionInput } from "@/lib/gamification/engine";
import type { CelebrationPayload } from "@/lib/gamification/types";

type Row = Record<string, unknown>;
type Predicate = (row: Row) => boolean;

const state: Row = {
  userId: "person",
  xp: 0,
  currentStreak: 0,
  bestStreak: 0,
  lastSubmittedPeriod: null,
  submittedWeeks: 0,
  onTimeWeeks: 0,
  consistentWeeks: 0,
  balancedWeeks: 0,
  detailedWeeks: 0,
  approvedWeeks: 0,
  celebrationsEnabled: true,
};
const events: Row[] = [];
const table = (name: string): Row =>
  new Proxy({ name }, { get: (target, key) => target[key as "name"] ?? key });
const schema = {
  userGamification: table("state"),
  gamificationEvent: table("event"),
  userAchievement: table("achievement"),
  user: table("user"),
  timeEntry: table("entry"),
};

// Model the database's row lock, including its transaction lifetime. Without
// SELECT FOR UPDATE concurrent callers both see the same pre-award state.
let lockTail = Promise.resolve();
function executor(transaction = false) {
  let releaseLock: (() => void) | undefined;
  return {
    release(): void {
      releaseLock?.();
    },
    query: {
      userGamification: {
        async findFirst(): Promise<Row> {
          return { ...state };
        },
      },
      gamificationEvent: {
        async findFirst({
          where,
        }: {
          where: Predicate;
        }): Promise<Row | undefined> {
          return events.find(where);
        },
      },
      user: {
        async findFirst(): Promise<{ weeklyCapacity: number }> {
          return { weeklyCapacity: 40 };
        },
      },
    },
    select() {
      return {
        from() {
          return {
            where() {
              return Object.assign(Promise.resolve([]), {
                async for(mode: string): Promise<Row[]> {
                  assert.equal(transaction, true, "Lock needs a transaction");
                  assert.equal(mode, "update");
                  const previous = lockTail;
                  lockTail = new Promise<void>((release) => {
                    releaseLock = release;
                  });
                  await previous;
                  return [{ ...state }];
                },
              });
            },
          };
        },
      };
    },
    update() {
      return {
        set(changes: Row) {
          return {
            async where(): Promise<void> {
              Object.assign(state, changes);
            },
          };
        },
      };
    },
    insert(target: Row) {
      return {
        values(value: Row) {
          if (target === schema.gamificationEvent) events.push(value);
          return {
            onConflictDoNothing() {
              return {
                async returning(): Promise<Row[]> {
                  return [];
                },
              };
            },
          };
        },
      };
    },
  };
}

const db = {
  ...executor(),
  async transaction<T>(
    callback: (tx: ReturnType<typeof executor>) => Promise<T>,
  ): Promise<T> {
    const tx = executor(true);
    try {
      return await callback(tx);
    } finally {
      tx.release();
    }
  },
};
const enginePath = resolve("src/lib/gamification/engine.ts");
const requireEngineDependency = createRequire(enginePath);
const moduleScope: { exports: unknown } = { exports: {} };
const compiled = ts.transpileModule(readFileSync(enginePath, "utf8"), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText;
runInNewContext(compiled, {
  module: moduleScope,
  exports: moduleScope.exports,
  crypto: globalThis.crypto,
  require(id: string): unknown {
    if (id === "@/lib/db") return { db };
    if (id === "@/lib/db/schema") return schema;
    if (id === "drizzle-orm") {
      return {
        eq:
          (key: string, value: unknown): Predicate =>
          (row) =>
            row[key] === value,
        and:
          (...conditions: Predicate[]): Predicate =>
          (row) =>
            conditions.every((condition) => condition(row)),
        isNull: (): Predicate => () => true,
        sql: (): Predicate => () => true,
      };
    }
    return requireEngineDependency(id);
  },
});
const { awardWeekSubmission, awardWeekApproval } = moduleScope.exports as {
  awardWeekSubmission: (
    input: AwardSubmissionInput,
  ) => Promise<CelebrationPayload>;
  awardWeekApproval: (userId: string, period: string) => Promise<void>;
};

async function verify(): Promise<void> {
  const submit = (period: string): Promise<CelebrationPayload> =>
    awardWeekSubmission({
      userId: "person",
      period,
      periodType: "weekly",
      submittedAt: new Date("2026-11-05T12:00:00Z"),
      totalMinutes: 60,
    });

  await submit("2026-W40");
  await submit("2026-W41");
  const xpBeforeReplay = state.xp;
  const replay = await submit("2026-W40@2026-09");
  assert.equal(
    replay.alreadyCredited,
    true,
    "Reopened historical weeks stay credited",
  );
  assert.equal(replay.xpGained, 0);
  assert.equal(state.xp, xpBeforeReplay);
  assert.equal(state.submittedWeeks, 2);

  const concurrent = await Promise.all([
    submit("2026-W44@2026-10"),
    submit("2026-W44@2026-11"),
  ]);
  assert.equal(
    concurrent.filter((result) => !result.alreadyCredited).length,
    1,
  );
  assert.equal(
    state.submittedWeeks,
    3,
    "Concurrent slices credit one ISO week",
  );

  await Promise.all([
    awardWeekApproval("person", "2026-W44@2026-10"),
    awardWeekApproval("person", "2026-W44@2026-11"),
  ]);
  assert.equal(state.approvedWeeks, 1);
  assert.equal(
    events.filter((event) => event.kind === "week_approved").length,
    1,
  );
  const xpBeforeApprovalReplay = state.xp;
  await awardWeekApproval("person", "2026-W44");
  assert.equal(state.xp, xpBeforeApprovalReplay);

  await Promise.all([
    awardWeekApproval("person", "2026-W45"),
    submit("2026-W45"),
  ]);
  assert.equal(state.approvedWeeks, 2);
  assert.equal(
    state.submittedWeeks,
    4,
    "Distinct awards preserve both counters",
  );
  process.stdout.write(
    "Weekly awards: historical replay and concurrent split closure verified.\n",
  );
}

verify().catch((error: unknown) => {
  console.error("[verify-week-awards]", error);
  process.exitCode = 1;
});
