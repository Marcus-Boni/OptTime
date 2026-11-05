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
import { Client } from "pg";

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

  assert.equal(rows.length, 12, "Five crossing weeks become ten segments");
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
  assert.deepEqual(find("approved", "2026-10"), {
    user_id: "approved",
    period: "2026-W40@2026-10",
    status: "open",
    total_minutes: 0,
    billable_minutes: 0,
    approved_by: null,
    rejection_reason: null,
    has_submission: false,
    has_approval: false,
  });
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
    13,
    "Every original or locked unlinked entry is linked",
  );
  assert.equal(
    links.rows.find((entry) => entry.id === "approved-deleted-oct")?.period,
    "2026-W40@2026-10",
    "Soft-deleted entries move without contributing to totals or status",
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
    await verifyMigration(client);
    process.stdout.write(
      "Split-week migration: statuses, month totals, entry links, deleted entries, year boundary and idempotency passed on disposable PostgreSQL.\n",
    );
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
