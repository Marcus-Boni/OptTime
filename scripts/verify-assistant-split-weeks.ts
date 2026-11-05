import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import * as periods from "@/lib/ai/periods";
import * as capacity from "@/lib/capacity";
import * as schema from "@/lib/db/schema";
import * as timesheetPeriods from "@/lib/timesheet-periods";
import * as utils from "@/lib/utils";

const requireDependency = createRequire(resolve("package.json"));
const dialect = new PgDialect();
const entries = [
  { date: "2026-09-30", duration: 60 },
  { date: "2026-10-01", duration: 120 },
  { date: "2026-10-08", duration: 90 },
  { date: "2026-12-31", duration: 30 },
  { date: "2027-01-01", duration: 45 },
];
let status: string | null = null;
let queriedPeriod: unknown;
const actions: { period: string; totalMinutes: number; periodLabel: string }[] =
  [];

/** Load the real modules with inert server collaborators; no database is opened. */
function loadModule<T>(path: string, extra = "", overrides = {}): T {
  const exports = {};
  const source = ts.transpileModule(
    readFileSync(resolve(path), "utf8") + extra,
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  const mocks: Record<string, unknown> = {
    "@/lib/ai/periods": periods,
    "@/lib/capacity": capacity,
    "@/lib/db/schema": schema,
    "@/lib/timesheet-periods": timesheetPeriods,
    "@/lib/utils": utils,
    "@/lib/db": {
      db: {
        query: {
          timesheet: {
            findFirst: async ({ where }: { where: SQL }): Promise<unknown> => {
              queriedPeriod = dialect.sqlToQuery(where).params[1];
              return status ? { status } : null;
            },
          },
        },
        select: () => ({
          from: () => ({
            where: async (where: SQL): Promise<typeof entries> => {
              const [, start, end] = dialect.sqlToQuery(where).params;
              assert.equal(typeof start, "string");
              assert.equal(typeof end, "string");
              return entries.filter(
                (entry) =>
                  entry.date >= String(start) && entry.date <= String(end),
              );
            },
          }),
        }),
      },
    },
    "@/app/(dashboard)/dashboard/settings/tabs": { SETTINGS_TABS: [] },
    "@/lib/ai/operator/navigation": { NAVIGATION_TARGETS: {} },
    "@/lib/ai/operator/ui-commands": { UI_COMMAND_LIST: [] },
    "@/lib/timesheet-status": { getTimesheetStatusLabel: () => "aprovado" },
    ...overrides,
  };
  runInNewContext(source, {
    exports,
    require: (name: string): unknown => {
      if (name in mocks) return mocks[name];
      if (name.startsWith("@/") || name.startsWith("./")) return {};
      return requireDependency(name);
    },
  });
  return exports as T;
}

async function main(): Promise<void> {
  interface SubmitArgs {
    period?: "this_week" | "last_week";
    date?: string;
  }
  const tool = loadModule<{
    prepareTimesheetSubmitTool: {
      execute: (args: SubmitArgs, context: unknown) => Promise<unknown>;
      schema: { safeParse: (args: unknown) => { success: boolean } };
    };
  }>("src/lib/ai/tools/write-tools.ts").prepareTimesheetSubmitTool;
  const context = (today: string) => ({
    user: { userId: "fixture-user", today, weeklyCapacityHours: 40 },
    emitAction: (action: (typeof actions)[number]) => actions.push(action),
  });

  await tool.execute({}, context("2026-10-01"));
  assert.equal(queriedPeriod, "2026-W40@2026-10");
  assert.equal(actions.at(-1)?.period, "2026-W40@2026-10");
  assert.equal(
    actions.at(-1)?.totalMinutes,
    120,
    "Confirmation must exclude September entries",
  );
  assert.equal(actions.at(-1)?.periodLabel, "01/10/2026 – 04/10/2026");

  await tool.execute({ date: "2026-09-30" }, context("2026-10-01"));
  assert.equal(actions.at(-1)?.period, "2026-W40@2026-09");
  assert.equal(actions.at(-1)?.totalMinutes, 60);

  await tool.execute({ period: "last_week" }, context("2026-10-08"));
  assert.equal(actions.at(-1)?.period, "2026-W40@2026-10");

  await tool.execute({}, context("2026-10-08"));
  assert.equal(actions.at(-1)?.period, "2026-W41");
  assert.equal(actions.at(-1)?.totalMinutes, 90);

  await tool.execute({}, context("2027-01-01"));
  assert.equal(actions.at(-1)?.period, "2026-W53@2027-01");
  assert.equal(actions.at(-1)?.totalMinutes, 45);

  const actionCount = actions.length;
  status = "approved";
  await tool.execute({}, context("2026-10-01"));
  assert.equal(
    actions.length,
    actionCount,
    "Already approved segments must not offer submission",
  );
  assert.equal(tool.schema.safeParse({ date: "2026-02-31" }).success, false);

  const probes: string[] = [];
  let lockedMonth = "09";
  const { resolveLockedDates } = loadModule<{
    resolveLockedDates: (userId: string, dates: string[]) => Promise<string[]>;
  }>(
    "src/app/api/time-suggestions/autofill/route.ts",
    "\nexports.resolveLockedDates = resolveLockedDates;",
    {
      "@/lib/time-entry-locks": {
        getWeeklyTimesheetStatusForDate: async (
          _userId: string,
          date: string,
        ): Promise<{ locked: boolean }> => {
          probes.push(date);
          return { locked: date.slice(5, 7) === lockedMonth };
        },
      },
    },
  );
  const dates = ["2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02"];
  assert.deepEqual(
    Array.from(await resolveLockedDates("fixture-user", dates)).sort(),
    dates.slice(0, 2),
  );
  assert.equal(
    probes.length,
    2,
    "Lock resolution must probe both month segments",
  );
  lockedMonth = "10";
  assert.deepEqual(
    Array.from(await resolveLockedDates("fixture-user", dates)).sort(),
    dates.slice(2),
  );
  process.stdout.write(
    "Assistant submissions and autofill respect independent month segments.\n",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
