import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { subMonths } from "date-fns";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";
import type { ConfirmableAction } from "@/lib/ai/types";
import { timeEntry, timesheet } from "@/lib/db/schema";
import { getTimesheetPeriodForDate } from "@/lib/timesheet-periods";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";
import { formatLocalDate, parseLocalDate } from "@/lib/utils";

/** Uses a disposable loopback-only cluster. Never reads application DB URLs. */
function postgresBinary(name: string): string {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const directory = process.env.PG_BIN;
  if (directory) return join(directory, executable);
  const windowsDefault = join(
    process.env.ProgramFiles ?? "C:\\Program Files",
    "PostgreSQL",
    "17",
    "bin",
    executable,
  );
  return process.platform === "win32" && existsSync(windowsDefault)
    ? windowsDefault
    : executable;
}

function runPostgres(name: string, args: string[]): void {
  execFileSync(postgresBinary(name), args, {
    encoding: "utf8",
    timeout: 30_000,
    windowsHide: true,
    stdio: "ignore",
  });
}

async function availablePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close();
        reject(new Error("Could not reserve a local PostgreSQL test port."));
        return;
      }
      server.close((error) => {
        if (error) reject(error);
        else resolvePort(address.port);
      });
    });
  });
}

interface MigratedTimesheet {
  user_id: string;
  period: string;
  status: string;
  total_minutes: number;
  billable_minutes: number;
  approved_by: string | null;
  rejection_reason: string | null;
  has_submission: boolean;
  has_approval: boolean;
}

const fixtures = `
  CREATE TABLE timesheet (
    id text PRIMARY KEY, user_id text NOT NULL, period text NOT NULL,
    period_type text NOT NULL DEFAULT 'weekly',
    total_minutes integer NOT NULL DEFAULT 0,
    billable_minutes integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'open', submitted_at timestamp,
    approved_by text, approved_at timestamp, rejection_reason text,
    UNIQUE (user_id, period)
  );
  CREATE TABLE time_entry (
    id text PRIMARY KEY, user_id text NOT NULL,
    timesheet_id text REFERENCES timesheet(id), date text NOT NULL,
    duration integer NOT NULL, billable boolean NOT NULL, deleted_at timestamp
  );
  INSERT INTO timesheet
    (id, user_id, period, status, submitted_at, approved_by, approved_at, rejection_reason)
  VALUES
    ('approved', 'approved', '2026-W40', 'approved', '2026-09-30', 'manager', '2026-09-30', NULL),
    ('submitted', 'submitted', '2026-W40', 'submitted', '2026-10-04', NULL, NULL, NULL),
    ('rejected', 'rejected', '2026-W40', 'rejected', '2026-10-04', NULL, NULL, 'Please correct the project'),
    ('open', 'open', '2026-W40', 'open', NULL, NULL, NULL, NULL),
    ('normal', 'normal', '2026-W41', 'approved', '2026-10-11', 'manager', '2026-10-11', NULL),
    ('year', 'year', '2026-W53', 'approved', '2027-01-03', 'manager', '2027-01-03', NULL);
  INSERT INTO timesheet (id, user_id, period, period_type, status)
  VALUES ('monthly', 'monthly', '2026-09', 'monthly', 'approved');
  INSERT INTO time_entry (id, user_id, timesheet_id, date, duration, billable, deleted_at)
  VALUES
    ('approved-sep', 'approved', 'approved', '2026-09-28', 60, true, NULL),
    ('approved-unlinked', 'approved', NULL, '2026-09-30', 30, false, NULL),
    ('approved-deleted-sep', 'approved', 'approved', '2026-09-29', 999, true, '2026-09-30'),
    ('approved-deleted-oct', 'approved', 'approved', '2026-10-01', 999, true, '2026-10-02'),
    ('submitted-sep', 'submitted', 'submitted', '2026-09-29', 45, true, NULL),
    ('submitted-oct', 'submitted', NULL, '2026-10-02', 75, false, NULL),
    ('rejected-sep', 'rejected', 'rejected', '2026-09-29', 20, true, NULL),
    ('rejected-oct', 'rejected', 'rejected', '2026-10-02', 40, false, NULL),
    ('open-sep', 'open', 'open', '2026-09-29', 10, true, NULL),
    ('open-oct', 'open', 'open', '2026-10-02', 20, false, NULL),
    ('normal-entry', 'normal', 'normal', '2026-10-06', 90, true, NULL),
    ('monthly-entry', 'monthly', 'monthly', '2026-09-29', 35, true, NULL),
    ('year-dec', 'year', 'year', '2026-12-31', 50, true, NULL),
    ('year-jan', 'year', 'year', '2027-01-01', 25, false, NULL);
`;

async function verifyMigration(client: Client): Promise<void> {
  await client.query("BEGIN");
  await client.query(fixtures);
  const entrySnapshot = async (): Promise<unknown[]> =>
    (
      await client.query(
        "SELECT id, user_id, date, duration, billable, deleted_at FROM time_entry ORDER BY id",
      )
    ).rows;
  const originalEntries = await entrySnapshot();
  const migration = readFileSync(
    resolve("drizzle/0033_split_weekly_timesheets_by_month.sql"),
    "utf8",
  );
  await client.query(migration);

  const { rows } = await client.query<MigratedTimesheet>(`
    SELECT user_id, period, status, total_minutes, billable_minutes,
      approved_by, rejection_reason,
      submitted_at IS NOT NULL AS has_submission,
      approved_at IS NOT NULL AS has_approval
    FROM timesheet ORDER BY user_id, period
  `);
  const find = (user: string, competence: string): MigratedTimesheet => {
    const row = rows.find(
      (sheet) => sheet.user_id === user && sheet.period.endsWith(competence),
    );
    assert.ok(row, `Missing ${user}/${competence} segment`);
    return row;
  };

  assert.equal(rows.length, 12);
  assert.equal(
    rows.filter((sheet) => sheet.period.includes("@")).length,
    9,
    "Only segments with active entries are provisioned",
  );
  assert.deepEqual(
    rows
      .filter((sheet) => sheet.period === "2026-W40")
      .map((sheet) => sheet.user_id),
    ["approved"],
    "The split week remains only when a deleted entry still references it",
  );
  assert.deepEqual(find("approved", "2026-09"), {
    user_id: "approved",
    period: "2026-W40@2026-09",
    status: "approved",
    total_minutes: 90,
    billable_minutes: 60,
    approved_by: "manager",
    rejection_reason: null,
    has_submission: true,
    has_approval: true,
  });
  assert.ok(
    !rows.some(
      (sheet) =>
        sheet.user_id === "approved" && sheet.period === "2026-W40@2026-10",
    ),
    "A segment with only deleted entries is unprovisioned",
  );
  for (const competence of ["2026-09", "2026-10"]) {
    assert.equal(find("submitted", competence).status, "submitted");
    assert.equal(find("submitted", competence).has_submission, true);
    assert.equal(find("rejected", competence).status, "rejected");
    assert.equal(
      find("rejected", competence).rejection_reason,
      "Please correct the project",
    );
    assert.equal(find("open", competence).status, "open");
  }
  assert.equal(find("submitted", "2026-09").total_minutes, 45);
  assert.equal(find("submitted", "2026-10").total_minutes, 75);
  assert.equal(find("submitted", "2026-10").billable_minutes, 0);
  assert.equal(find("rejected", "2026-09").total_minutes, 20);
  assert.equal(find("rejected", "2026-10").total_minutes, 40);
  assert.equal(find("year", "2026-12").total_minutes, 50);
  assert.equal(find("year", "2027-01").total_minutes, 25);
  assert.equal(find("normal", "2026-W41").status, "approved");
  assert.equal(find("monthly", "2026-09").status, "approved");

  const links = await client.query<{ id: string; period: string }>(`
    SELECT e.id, t.period FROM time_entry e
    JOIN timesheet t ON t.id = e.timesheet_id ORDER BY e.id
  `);
  assert.equal(
    links.rowCount,
    14,
    "Every original or locked unlinked entry is linked",
  );
  assert.equal(
    links.rows.find((entry) => entry.id === "approved-deleted-sep")?.period,
    "2026-W40@2026-09",
    "Deleted entries move to an existing segment and are excluded from totals",
  );
  assert.equal(
    links.rows.find((entry) => entry.id === "approved-deleted-oct")?.period,
    "2026-W40",
    "A deleted entry keeps its original link when its segment does not exist",
  );
  assert.equal(
    links.rows.find((entry) => entry.id === "submitted-oct")?.period,
    "2026-W40@2026-10",
    "Unlinked entries inside a locked period join that segment",
  );
  assert.deepEqual(await entrySnapshot(), originalEntries);

  const snapshot = async (): Promise<unknown[]> =>
    (await client.query("SELECT * FROM timesheet ORDER BY id")).rows;
  const afterFirstRun = await snapshot();
  await client.query(migration);
  assert.deepEqual(await snapshot(), afterFirstRun, "Migration is idempotent");
  assert.deepEqual(await entrySnapshot(), originalEntries);
  await client.query("ROLLBACK");
}

interface McpResult {
  isError: boolean;
  structuredContent?: { entry?: { id: string } };
  _meta?: { "opt-time/error"?: { code: string; message: string } };
}

async function waitForAdvisoryLocks(
  client: Client,
  expectedWaiters: number,
): Promise<void> {
  for (let attempt = 0; attempt < 250; attempt++) {
    const { rows } = await client.query<{ holders: number; waiters: number }>(`
      SELECT COUNT(*) FILTER (WHERE granted)::int AS holders,
             COUNT(*) FILTER (WHERE NOT granted)::int AS waiters
      FROM pg_locks
      WHERE locktype = 'advisory'
        AND classid = (hashtext('harvest:timesheet-period')::bigint & 4294967295)
    `);
    if (rows[0].holders === 1 && rows[0].waiters >= expectedWaiters) return;
    await delay(20);
  }
  assert.fail(
    `O PostgreSQL não observou ${expectedWaiters} alterações aguardando a trava.`,
  );
}

async function verifyTimeEntryMutations(
  client: Client,
  port: number,
): Promise<void> {
  // Import the app only after directing it to this disposable database.
  const origin = `http://127.0.0.1:${port}`;
  process.env.DATABASE_URL = `postgresql://postgres@127.0.0.1:${port}/postgres`;
  process.env.BETTER_AUTH_URL = origin;
  process.env.BETTER_AUTH_SECRET = "harvest-disposable-postgres-test-secret";
  const { db, dbPool } = await import("@/lib/db");
  const originalFetch = globalThis.fetch;

  try {
    await migrate(db, { migrationsFolder: resolve("drizzle") });
    // This historical patch lives outside the Drizzle journal.
    await client.query(
      readFileSync(resolve("drizzle/0012_project_scope_fields.sql"), "utf8"),
    );
    const { POST: mcpPost } = await import("@/app/api/mcp/route");
    const { POST: entryPost } = await import("@/app/api/time-entries/route");
    const { PATCH: entryPatch, DELETE: entryDelete } = await import(
      "@/app/api/time-entries/[id]/route"
    );
    const { PATCH: changeTimesheet } = await import(
      "@/app/api/timesheets/[id]/route"
    );
    const { executeAction, ExecutionError } = await import(
      "@/lib/ai/operator/executors"
    );
    const { TIMESHEET_PERIOD_LOCKED_MESSAGE } = await import(
      "@/lib/time-entry-locks"
    );
    const { makeUser, makeProject, makeSessionCookie } = await import(
      "./mcp-e2e/harness"
    );
    const member = await makeUser("period-guard-member");
    const admin = await makeUser("period-guard-admin", { role: "admin" });
    const project = await makeProject("period-guard", [member.id]);
    const cookie = await makeSessionCookie(member.id);
    const adminCookie = await makeSessionCookie(admin.id);

    globalThis.fetch = async (input, init): Promise<Response> => {
      if (
        typeof input === "string" &&
        input.startsWith("https://brasilapi.com.br/api/feriados/v1/")
      ) {
        return Response.json([
          {
            date: `${input.slice(-4)}-01-01`,
            name: "Confraternização Universal",
          },
        ]);
      }
      assert.ok(
        typeof input === "string" && input.startsWith("/api/time-entries"),
      );
      const req = new Request(new URL(input, origin), init);
      req.headers.set("Cookie", cookie);
      if (req.method === "POST") return entryPost(req);
      const id = new URL(req.url).pathname.split("/").at(-1) ?? "";
      const context = { params: Promise.resolve({ id }) };
      if (req.method === "PATCH") return entryPatch(req, context);
      assert.equal(req.method, "DELETE");
      return entryDelete(req, context);
    };

    async function callMcp(
      name: string,
      args: Record<string, unknown>,
    ): Promise<McpResult> {
      const res = await mcpPost(
        new Request(`${origin}/api/mcp`, {
          method: "POST",
          headers: { Authorization: `Bearer ${member.token}` },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: { name, arguments: args },
          }),
        }),
      );
      assert.equal(res.status, 200);
      const body: { result: McpResult } = await res.json();
      return body.result;
    }

    const fields = {
      projectId: project.id,
      durationMinutes: 45,
      description: "Verificação de período",
    };
    const projectDisplay = { projectName: project.name, projectColor: null };
    const createMcp = (date: string) =>
      callMcp("opt_time_log_time", { ...fields, date });
    const createAi = (date: string) =>
      executeAction({
        kind: "create_time_entry",
        ...fields,
        ...projectDisplay,
        date,
        billable: true,
        azureWorkItemId: null,
        azureWorkItemTitle: null,
        warning: null,
      });
    const updateMcp = (entryId: string) =>
      callMcp("opt_time_update_time_entry", { entryId, durationMinutes: 60 });
    const updateAi = (entryId: string, date: string) => {
      const current = {
        description: fields.description,
        durationMinutes: 45,
        billable: true,
      };
      return executeAction({
        kind: "update_time_entry",
        entryId,
        date,
        ...projectDisplay,
        current,
        next: { ...current, durationMinutes: 60 },
        warning: null,
      });
    };
    const assertMcpLocked = (result: McpResult): void => {
      assert.equal(result.isError, true);
      const error = result._meta?.["opt-time/error"];
      assert.equal(error?.code, "PERIOD_LOCKED");
      assert.equal(error.message, TIMESHEET_PERIOD_LOCKED_MESSAGE);
    };
    const assertAiLocked = (error: unknown): boolean =>
      error instanceof ExecutionError &&
      error.message === TIMESHEET_PERIOD_LOCKED_MESSAGE;
    const recent = todayInAppTimeZone();
    const ninetyDaysAgo = shiftDay(recent, -90);
    const sixMonthsAgo = formatLocalDate(subMonths(parseLocalDate(recent), 6));

    const mcp90 = await createMcp(ninetyDaysAgo);
    assert.equal(mcp90.isError, false);
    const mcp90Id = mcp90.structuredContent?.entry?.id;
    assert.ok(mcp90Id);
    assert.ok((await createAi(ninetyDaysAgo)).resultId);

    const mcpOld = await createMcp(sixMonthsAgo);
    assert.equal(mcpOld.isError, false);
    const mcpOldId = mcpOld.structuredContent?.entry?.id;
    const aiOldId = (await createAi(sixMonthsAgo)).resultId;
    assert.ok(mcpOldId && aiOldId);
    assert.equal((await updateMcp(mcpOldId)).isError, false);
    assert.ok((await updateAi(aiOldId, sixMonthsAgo)).ok);

    const oldPeriod = getTimesheetPeriodForDate(sixMonthsAgo);
    const sheetId = crypto.randomUUID();
    const closedMonthId = crypto.randomUUID();
    await db.insert(timesheet).values([
      { id: sheetId, userId: member.id, period: oldPeriod, status: "approved" },
      {
        id: closedMonthId,
        userId: member.id,
        period: sixMonthsAgo.slice(0, 7),
        periodType: "monthly",
        status: "approved",
      },
    ]);
    await db
      .update(timeEntry)
      .set({ timesheetId: sheetId })
      .where(eq(timeEntry.id, mcpOldId));
    const changeStatus = (id: string, action: string, sessionCookie: string) =>
      changeTimesheet(
        new Request(`${origin}/api/timesheets/${id}`, {
          method: "PATCH",
          headers: { Cookie: sessionCookie },
          body: JSON.stringify({ action }),
        }),
        { params: Promise.resolve({ id }) },
      );

    assert.equal((await changeStatus(sheetId, "reopen", cookie)).status, 403);
    assert.equal(
      (await changeStatus(sheetId, "reopen", adminCookie)).status,
      200,
    );
    assertMcpLocked(await createMcp(sixMonthsAgo));
    await assert.rejects(createAi(sixMonthsAgo), assertAiLocked);
    assertMcpLocked(await updateMcp(mcpOldId));
    await assert.rejects(updateAi(aiOldId, sixMonthsAgo), assertAiLocked);
    assert.equal((await changeStatus(sheetId, "submit", cookie)).status, 409);
    assertMcpLocked(
      await callMcp("opt_time_submit_timesheet", {
        period: oldPeriod,
        force: true,
      }),
    );
    assertMcpLocked(
      await callMcp("opt_time_update_time_entry", {
        entryId: mcp90Id,
        date: sixMonthsAgo,
      }),
    );

    assert.equal(
      (await changeStatus(closedMonthId, "reopen", adminCookie)).status,
      200,
    );
    assert.equal((await updateMcp(mcpOldId)).isError, false);
    assert.ok((await updateAi(aiOldId, sixMonthsAgo)).ok);
    const getEntry = (id: string) =>
      db.query.timeEntry.findFirst({ where: eq(timeEntry.id, id) });
    assert.equal((await getEntry(mcpOldId))?.timesheetId, sheetId);
    assert.equal(
      (
        await callMcp("opt_time_update_time_entry", {
          entryId: mcpOldId,
          date: ninetyDaysAgo,
        })
      ).isError,
      false,
    );
    assert.equal((await getEntry(mcpOldId))?.timesheetId, null);
    assert.equal(
      (await callMcp("opt_time_delete_time_entry", { entryId: mcpOldId }))
        .isError,
      false,
    );
    const deletion: ConfirmableAction = {
      kind: "delete_time_entry",
      entryId: aiOldId,
      ...projectDisplay,
      description: fields.description,
      date: sixMonthsAgo,
      durationMinutes: 60,
      warning: null,
    };
    assert.ok((await executeAction(deletion)).ok);
    assert.ok((await getEntry(mcpOldId))?.deletedAt);
    assert.ok((await getEntry(aiOldId))?.deletedAt);

    const recentId = (await createAi(recent)).resultId;
    assert.ok(recentId);
    const recentSheet = crypto.randomUUID();
    await db.insert(timesheet).values({
      id: recentSheet,
      userId: member.id,
      period: getTimesheetPeriodForDate(recent),
    });

    // Hold the entry row so submission acquires the period lock but cannot
    // finish. Start both writers while submission is in flight.
    await client.query("BEGIN");
    await client.query("SELECT id FROM time_entry WHERE id = $1 FOR UPDATE", [
      recentId,
    ]);
    const submission = changeStatus(recentSheet, "submit", cookie);
    let queued: Promise<void> | undefined;
    try {
      await waitForAdvisoryLocks(client, 0);
      queued = Promise.all([
        updateMcp(recentId).then(assertMcpLocked),
        assert.rejects(updateAi(recentId, recent), assertAiLocked),
      ]).then(() => undefined);
      // Mark the promise handled even if the database assertion fails first.
      void queued.catch(() => undefined);
      await waitForAdvisoryLocks(client, 2);
    } finally {
      await client.query("COMMIT");
      assert.equal((await submission).status, 200);
      await queued;
    }

    assertMcpLocked(await updateMcp(recentId));
    await assert.rejects(updateAi(recentId, recent), assertAiLocked);
    const row = await getEntry(recentId);
    assert.equal(row?.duration, 45);
    assert.equal(row?.timesheetId, recentSheet);
    process.stdout.write(
      "Apontamentos MCP e TimeBot: datas antigas, fechamento mensal, reabertura autorizada e submissão concorrente verificados.\n",
    );
  } finally {
    globalThis.fetch = originalFetch;
    await dbPool.end();
  }
}

async function main(): Promise<void> {
  const root = resolve(".omx");
  mkdirSync(root, { recursive: true });
  const directory = mkdtempSync(join(root, "split-weeks-pg-"));
  const data = join(directory, "data");
  const log = join(directory, "server.log");
  const port = await availablePort();
  let client: Client | undefined;
  try {
    runPostgres("initdb", [
      "-D",
      data,
      "-U",
      "postgres",
      "-A",
      "trust",
      "--no-locale",
      "--encoding=UTF8",
    ]);
    runPostgres("pg_ctl", [
      "-D",
      data,
      "-l",
      log,
      "-o",
      `-h 127.0.0.1 -p ${port}`,
      "-w",
      "start",
    ]);
    client = new Client({
      host: "127.0.0.1",
      port,
      user: "postgres",
      database: "postgres",
      connectionTimeoutMillis: 5_000,
    });
    await client.connect();
    if (process.argv.includes("--entry-mutations")) {
      await verifyTimeEntryMutations(client, port);
    } else {
      await verifyMigration(client);
      process.stdout.write(
        "Split-week migration: statuses, month totals, entry links, deleted entries, year boundary and idempotency passed on disposable PostgreSQL.\n",
      );
    }
  } finally {
    await client?.end();
    if (existsSync(join(data, "postmaster.pid")))
      runPostgres("pg_ctl", ["-D", data, "-m", "immediate", "-w", "stop"]);
    // Only remove the freshly-created test directory inside the verified root.
    assert.equal(resolve(directory, ".."), root);
    rmSync(directory, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100,
    });
  }
}

main().catch((error: unknown) => {
  console.error("[verify-split-weeks-e2e]", error);
  process.exitCode = 1;
});
