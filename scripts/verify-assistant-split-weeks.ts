import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import type { SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import ts from "typescript";
import * as duration from "@/lib/ai/duration";
import * as periods from "@/lib/ai/periods";
import type { OperatorStepAction } from "@/lib/ai/types";
import * as capacity from "@/lib/capacity";
import * as schema from "@/lib/db/schema";
import * as timesheetPeriods from "@/lib/timesheet-periods";
import * as timesheetStatus from "@/lib/timesheet-status";
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
    "@/lib/ai/duration": duration,
    "@/lib/ai/periods": periods,
    "@/lib/capacity": capacity,
    "@/lib/db/schema": schema,
    "@/lib/holidays/service": { getHolidaysInRange: async () => [] },
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
    "@/lib/timesheet-status": timesheetStatus,
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

async function verifyEntryPreparation(): Promise<void> {
  type TimesheetRecord = {
    id: string;
    userId: string;
    period: string;
    periodType: "weekly" | "monthly";
    status: "open" | "submitted" | "approved" | "rejected";
  };
  const records: TimesheetRecord[] = [];
  const userId = "fixture-user";
  const today = "2026-10-01";
  const oldDate = "2026-04-01";
  const createdDate = "2026-07-03";
  const oldSegment = timesheetPeriods.getTimesheetSegmentForDate(oldDate);
  const recentSegment = timesheetPeriods.getTimesheetSegmentForDate(today);
  const lockedRecord: TimesheetRecord = {
    id: "submitted",
    userId,
    period: recentSegment.period,
    periodType: "weekly",
    status: "submitted",
  };
  const emitActions: OperatorStepAction[] = [];
  const context = {
    actor: { role: "member" },
    user: { userId, today },
    emitAction: (action: OperatorStepAction) => emitActions.push(action),
  };

  const locks = loadModule<typeof import("@/lib/time-entry-locks")>(
    "src/lib/time-entry-locks.ts",
    "",
    {
      "@/lib/db": {
        db: {
          query: {
            timesheet: {
              findMany: async ({
                where,
              }: {
                where: SQL;
              }): Promise<TimesheetRecord[]> => {
                const params = dialect.sqlToQuery(where).params;
                return records.filter(
                  (row) =>
                    params.includes(row.period) || params.includes(row.id),
                );
              },
            },
          },
        },
      },
    },
  );
  const entryPeriod = loadModule("src/lib/ai/tools/entry-period.ts", "", {
    "@/lib/time-entry-locks": locks,
  });
  const project = {
    id: "fixture-project",
    name: "Projeto",
    color: "#000000",
    isMember: true,
  };
  let linkedId: string | null = null;
  const readTools = {
    listLoggableProjects: async () => [project],
    matchProject: () => project,
  };
  const dependencies = {
    "@/lib/ai/tools/entry-period": entryPeriod,
    "./read-tools": readTools,
    "@/lib/db": {
      db: {
        query: {
          timeEntry: {
            findMany: async ({ where }: { where: SQL }) => {
              const [, date] = dialect.sqlToQuery(where).params;
              return [
                {
                  id: "fixture-entry",
                  date,
                  timesheetId: linkedId,
                  description: "Atividade histórica",
                  duration: 30,
                  billable: true,
                  project,
                },
              ];
            },
          },
        },
      },
    },
  };
  interface EntryTool {
    execute(
      args: { date: string; description?: string; newDurationMinutes?: number },
      ctx: unknown,
    ): Promise<{ data: { status: string; message?: string } }>;
  }
  const { prepareTimeEntryTool: create } = loadModule<{
    prepareTimeEntryTool: EntryTool;
  }>("src/lib/ai/tools/write-tools.ts", "", dependencies);
  const {
    prepareTimeEntryUpdateTool: edit,
    prepareTimeEntryDeleteTool: remove,
  } = loadModule<{
    prepareTimeEntryUpdateTool: EntryTool;
    prepareTimeEntryDeleteTool: EntryTool;
  }>("src/lib/ai/tools/operator-tools.ts", "", dependencies);

  assert.equal(
    (
      await create.execute(
        { date: createdDate, description: "Atividade" },
        context,
      )
    ).data.status,
    "awaiting_confirmation",
  );
  assert.equal(emitActions.at(-1)?.kind, "create_time_entry");
  assert.equal(
    (await edit.execute({ date: oldDate, newDurationMinutes: 45 }, context))
      .data.status,
    "awaiting_confirmation",
  );
  assert.equal(emitActions.at(-1)?.kind, "update_time_entry");
  assert.equal(
    (await remove.execute({ date: oldDate }, context)).data.status,
    "awaiting_confirmation",
  );
  assert.equal(emitActions.at(-1)?.kind, "delete_time_entry");

  records.push(lockedRecord);
  const blockedEdit = await edit.execute(
    { date: today, newDurationMinutes: 45 },
    context,
  );
  assert.equal(blockedEdit.data.status, "period_locked");
  assert.equal(blockedEdit.data.message, locks.TIMESHEET_PERIOD_LOCKED_MESSAGE);
  linkedId = lockedRecord.id;
  assert.equal(
    (await remove.execute({ date: oldDate }, context)).data.status,
    "period_locked",
  );
  linkedId = null;

  records.push(
    {
      id: "reopened",
      userId,
      period: oldSegment.period,
      periodType: "weekly",
      status: "rejected",
    },
    {
      id: "closedMonth",
      userId,
      period: oldSegment.competence,
      periodType: "monthly",
      status: "approved",
    },
  );
  assert.equal(
    (await create.execute({ date: oldDate, description: "Atividade" }, context))
      .data.status,
    "period_locked",
  );
  assert.equal(
    (await edit.execute({ date: oldDate, newDurationMinutes: 45 }, context))
      .data.status,
    "period_locked",
  );
  assert.equal(
    emitActions.length,
    3,
    "Bloqueios não devem produzir cartões executáveis",
  );
  records.pop();
  assert.equal(
    (await edit.execute({ date: oldDate, newDurationMinutes: 45 }, context))
      .data.status,
    "awaiting_confirmation",
  );
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
  await verifyEntryPreparation();
  process.stdout.write(
    "AI: submissões por competência, apontamentos históricos, bloqueios e reabertura verificados.\n",
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
