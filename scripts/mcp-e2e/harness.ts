import { eq, inArray, like } from "drizzle-orm";
import { createApiToken, revokeApiToken } from "@/lib/api-tokens";
import type { ApiTokenScope } from "@/lib/api-tokens.shared";
import { db } from "@/lib/db";
import {
  activeTimer,
  apiToken,
  project,
  projectMember,
  timeEntry,
  timesheet,
  user,
} from "@/lib/db/schema";

/**
 * Test harness for the MCP production-readiness suite.
 *
 * Two rules shape everything here:
 *  1. Destructive assertions run against **ephemeral fixtures** — users and
 *     projects created by this run and hard-deleted afterwards. Real accounts
 *     are only ever read.
 *  2. Every fixture id carries the `E2E_PREFIX`, so a crashed run can be cleaned
 *     up by pattern instead of by guesswork.
 */

export const E2E_PREFIX = "e2e-mcp-";
export const E2E_EMAIL_DOMAIN = "@e2e.optsolv.invalid";

/**
 * Ports probed when `VERIFY_BASE_URL` is not set.
 *
 * `next dev` wants 3000 and walks upward when it is taken, so a developer with
 * another project already running lands on 3001+ without noticing. Probing the
 * range keeps the common case configuration-free; each candidate is verified to
 * actually be OptSolv before it is used.
 */
const CANDIDATE_PORTS = [3100, 3000, 3001, 3002, 3003];

const EXPLICIT_BASE_URL = process.env.VERIFY_BASE_URL?.replace(/\/+$/, "");

let resolvedBaseUrl =
  EXPLICIT_BASE_URL ?? `http://localhost:${CANDIDATE_PORTS[0]}`;

/** The base URL in use. Only meaningful after `assertServerReachable()`. */
export function getBaseUrl(): string {
  return resolvedBaseUrl;
}

class ServerUnreachableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ServerUnreachableError";
  }
}

/**
 * How long to wait for a candidate to answer.
 *
 * Generous on purpose: `next dev` compiles a route on its first request, which
 * routinely takes longer than a naive few seconds and would make the preflight
 * report a perfectly healthy server as unreachable. A port with nothing
 * listening still fails instantly with ECONNREFUSED, so this patience only
 * applies where it is actually needed — a server that is warming up.
 */
const PROBE_TIMEOUT_MS = 30_000;

/** Fetches the public manifest, or null if the origin is not our server. */
async function probe(
  baseUrl: string,
): Promise<{ name?: string; counts?: { tools: number } } | null> {
  try {
    const res = await fetch(`${baseUrl}/api/mcp/manifest`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return (await res.json()) as { name?: string; counts?: { tools: number } };
  } catch {
    return null;
  }
}

/**
 * Confirms a usable server before any fixture is created.
 *
 * Without this the suite dies on the first request with a raw `ECONNREFUSED`
 * stack trace, which says nothing about the actual problem: the dev server is
 * not running. When `VERIFY_BASE_URL` is unset it also probes the ports the dev
 * server realistically lands on, so the common case needs no configuration.
 *
 * @throws {ServerUnreachableError} with instructions the reader can act on.
 */
export async function assertServerReachable(): Promise<void> {
  const candidates = EXPLICIT_BASE_URL
    ? [EXPLICIT_BASE_URL]
    : CANDIDATE_PORTS.map((port) => `http://localhost:${port}`);

  for (const candidate of candidates) {
    const manifest = await probe(candidate);
    if (!manifest) continue;

    if (manifest.name !== "opt-time") {
      throw new ServerUnreachableError(
        `${candidate} respondeu, mas não é o OptSolv Time Tracker ` +
          `(recebido: "${manifest.name ?? "desconhecido"}").\n` +
          `   Outro projeto deve estar ocupando essa porta.\n` +
          `   Suba este projeto em outra porta e rode:\n` +
          `     VERIFY_BASE_URL=http://localhost:<porta> pnpm verify:mcp`,
      );
    }

    resolvedBaseUrl = candidate;
    return;
  }

  const tried = candidates.join(", ");
  throw new ServerUnreachableError(
    `Nenhum servidor OptSolv respondeu em: ${tried}\n\n` +
      `   Suba o servidor primeiro, em outro terminal:\n` +
      `     pnpm dev\n\n` +
      `   Se ele estiver em outra porta ou ambiente:\n` +
      `     VERIFY_BASE_URL=http://localhost:3100 pnpm verify:mcp`,
  );
}

export function isServerUnreachable(error: unknown): boolean {
  return error instanceof ServerUnreachableError;
}

// ─── Reporting ─────────────────────────────────────────────────────────

export interface Finding {
  phase: string;
  label: string;
  detail: string;
  severity: "blocker" | "warning";
}

const results = { passed: 0, failed: 0, skipped: 0 };
export const findings: Finding[] = [];

let currentPhase = "";

export function phase(title: string): void {
  currentPhase = title;
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 58 - title.length))}`);
}

export function check(
  label: string,
  ok: boolean,
  detail = "",
  severity: "blocker" | "warning" = "blocker",
): boolean {
  if (ok) {
    results.passed += 1;
    console.log(`  ✅ ${label}${detail ? ` — ${detail}` : ""}`);
  } else {
    results.failed += 1;
    console.log(`  ❌ ${label}${detail ? ` — ${detail}` : ""}`);
    findings.push({ phase: currentPhase, label, detail, severity });
  }
  return ok;
}

export function warn(label: string, detail = ""): void {
  console.log(`  ⚠️  ${label}${detail ? ` — ${detail}` : ""}`);
  findings.push({ phase: currentPhase, label, detail, severity: "warning" });
}

export function skip(label: string, why: string): void {
  results.skipped += 1;
  console.log(`  ⏭️  ${label} — ${why}`);
}

export function info(text: string): void {
  console.log(`     ${text}`);
}

export function summary(): number {
  const blockers = findings.filter((f) => f.severity === "blocker");
  const warnings = findings.filter((f) => f.severity === "warning");

  console.log(
    `\n${"═".repeat(62)}\n` +
      `  ✅ ${results.passed} passaram   ❌ ${results.failed} falharam   ⏭️  ${results.skipped} puladas`,
  );

  if (blockers.length > 0) {
    console.log("\n  BLOQUEADORES:");
    for (const f of blockers)
      console.log(
        `   • [${f.phase}] ${f.label}${f.detail ? ` — ${f.detail}` : ""}`,
      );
  }
  if (warnings.length > 0) {
    console.log("\n  ATENÇÃO:");
    for (const f of warnings)
      console.log(
        `   • [${f.phase}] ${f.label}${f.detail ? ` — ${f.detail}` : ""}`,
      );
  }
  console.log(`${"═".repeat(62)}\n`);

  return blockers.length === 0 && results.failed === 0 ? 0 : 1;
}

// ─── HTTP helpers ──────────────────────────────────────────────────────

export interface RpcResult {
  status: number;
  headers: Headers;
  body: {
    result?: {
      isError?: boolean;
      content?: Array<{ type: string; text: string }>;
      structuredContent?: Record<string, unknown>;
      [key: string]: unknown;
    };
    error?: { code: number; message: string; data?: unknown };
    [key: string]: unknown;
  };
}

/** Sends one JSON-RPC message to the hosted MCP endpoint. */
export async function rpc(
  token: string,
  method: string,
  params?: Record<string, unknown>,
  id: string | number = 1,
): Promise<RpcResult> {
  const res = await fetch(`${getBaseUrl()}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id, method, params }),
  });

  const text = await res.text();
  let body: RpcResult["body"] = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {
      error: { code: -1, message: `resposta não-JSON: ${text.slice(0, 120)}` },
    };
  }

  return { status: res.status, headers: res.headers, body };
}

/** Calls a tool and returns the tool result. */
export async function tool(
  token: string,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
  errorCode: string | null;
  status: number;
}> {
  const { status, body } = await rpc(token, "tools/call", {
    name,
    arguments: args,
  });
  const result = body.result;
  const data = (result?.structuredContent ?? {}) as Record<string, unknown>;
  const errorBlock = data.error as { code?: string } | undefined;

  return {
    isError: result?.isError === true,
    text: result?.content?.[0]?.text ?? "",
    data,
    errorCode: errorBlock?.code ?? null,
    status,
  };
}

export async function rest(
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}> {
  const res = await fetch(`${getBaseUrl()}/api/v1/me${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }
  return { status: res.status, body, headers: res.headers };
}

// ─── Fixtures ──────────────────────────────────────────────────────────

export interface EphemeralUser {
  id: string;
  name: string;
  email: string;
  role: string;
  tokenId: string;
  token: string;
}

const createdUserIds: string[] = [];
const createdProjectIds: string[] = [];
const createdTokenIds: Array<{ userId: string; tokenId: string }> = [];

export async function makeUser(
  suffix: string,
  options: {
    role?: string;
    scopes?: ApiTokenScope[];
    weeklyCapacity?: number;
  } = {},
): Promise<EphemeralUser> {
  const id = `${E2E_PREFIX}${suffix}-${crypto.randomUUID().slice(0, 8)}`;
  const email = `${id}${E2E_EMAIL_DOMAIN}`;
  const role = options.role ?? "member";

  await db.insert(user).values({
    id,
    name: `E2E ${suffix}`,
    email,
    role,
    weeklyCapacity: options.weeklyCapacity ?? 40,
    isActive: true,
  });
  createdUserIds.push(id);

  const { plaintext, token } = await createApiToken({
    userId: id,
    name: `e2e ${suffix}`,
    scopes: options.scopes ?? ["time:read", "time:write", "timesheets:submit"],
    client: "ci",
    expiresInDays: 1,
  });
  createdTokenIds.push({ userId: id, tokenId: token.id });

  return {
    id,
    name: `E2E ${suffix}`,
    email,
    role,
    tokenId: token.id,
    token: plaintext,
  };
}

/** Mints an extra token for an existing user (real or ephemeral). */
export async function makeToken(
  userId: string,
  suffix: string,
  scopes: ApiTokenScope[],
  expiresInDays: number | null = 1,
): Promise<{ token: string; tokenId: string }> {
  const { plaintext, token } = await createApiToken({
    userId,
    name: `e2e ${suffix}`,
    scopes,
    client: "ci",
    expiresInDays,
  });
  createdTokenIds.push({ userId, tokenId: token.id });
  return { token: plaintext, tokenId: token.id };
}

export async function makeProject(
  suffix: string,
  members: string[],
  options: { managerId?: string; status?: string; billable?: boolean } = {},
): Promise<{ id: string; name: string; code: string }> {
  const id = crypto.randomUUID();
  const name = `E2E ${suffix}`;
  const code = `${E2E_PREFIX}${suffix}`.slice(0, 20).toUpperCase();

  await db.insert(project).values({
    id,
    name,
    code,
    color: "#f97316",
    status: options.status ?? "active",
    billable: options.billable ?? true,
    managerId: options.managerId ?? null,
  });
  createdProjectIds.push(id);

  for (const userId of members) {
    await db.insert(projectMember).values({
      id: crypto.randomUUID(),
      projectId: id,
      userId,
    });
  }

  return { id, name, code };
}

/**
 * Removes every fixture this run created, in FK-safe order.
 * Runs in `finally`, so a mid-suite crash still leaves the database clean.
 */
export async function cleanup(): Promise<{ ok: boolean; detail: string }> {
  try {
    for (const { userId, tokenId } of createdTokenIds) {
      await revokeApiToken(userId, tokenId).catch(() => undefined);
    }

    if (createdUserIds.length > 0) {
      await db
        .delete(activeTimer)
        .where(inArray(activeTimer.userId, createdUserIds));
      await db
        .delete(timeEntry)
        .where(inArray(timeEntry.userId, createdUserIds));
      await db
        .delete(timesheet)
        .where(inArray(timesheet.userId, createdUserIds));
      await db
        .delete(projectMember)
        .where(inArray(projectMember.userId, createdUserIds));
      await db.delete(apiToken).where(inArray(apiToken.userId, createdUserIds));
    }

    if (createdProjectIds.length > 0) {
      await db
        .delete(timeEntry)
        .where(inArray(timeEntry.projectId, createdProjectIds));
      await db
        .delete(activeTimer)
        .where(inArray(activeTimer.projectId, createdProjectIds));
      await db
        .delete(projectMember)
        .where(inArray(projectMember.projectId, createdProjectIds));
      await db.delete(project).where(inArray(project.id, createdProjectIds));
    }

    if (createdUserIds.length > 0) {
      await db.delete(user).where(inArray(user.id, createdUserIds));
    }

    // Belt and braces: sweep anything left from an earlier crashed run.
    const strays = await db.query.user.findMany({
      where: like(user.id, `${E2E_PREFIX}%`),
      columns: { id: true },
    });
    const strayProjects = await db.query.project.findMany({
      where: like(project.code, `${E2E_PREFIX.toUpperCase()}%`),
      columns: { id: true },
    });

    return {
      ok: strays.length === 0 && strayProjects.length === 0,
      detail:
        strays.length === 0 && strayProjects.length === 0
          ? `${createdUserIds.length} usuário(s), ${createdProjectIds.length} projeto(s) e ${createdTokenIds.length} token(s) removidos`
          : `restaram ${strays.length} usuário(s) e ${strayProjects.length} projeto(s) órfãos`,
    };
  } catch (error: unknown) {
    return {
      ok: false,
      detail: error instanceof Error ? error.message : "erro desconhecido",
    };
  }
}

/** Revokes tokens created for a real (non-ephemeral) account. */
export async function revokeRealAccountTokens(userId: string): Promise<number> {
  const mine = createdTokenIds.filter((t) => t.userId === userId);
  for (const { tokenId } of mine) {
    await revokeApiToken(userId, tokenId).catch(() => undefined);
    await db.delete(apiToken).where(eq(apiToken.id, tokenId));
  }
  return mine.length;
}

// ─── Timing ────────────────────────────────────────────────────────────

export async function timed<T>(
  fn: () => Promise<T>,
): Promise<{ ms: number; value: T }> {
  const start = performance.now();
  const value = await fn();
  return { ms: Math.round(performance.now() - start), value };
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.floor((p / 100) * sorted.length),
  );
  return sorted[index] ?? 0;
}
