import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { eq, inArray } from "drizzle-orm";
import { createApiToken } from "@/lib/api-tokens";
import { db } from "@/lib/db";
import {
  activeTimer,
  apiToken,
  project,
  projectMember,
  timeEntry,
  user,
} from "@/lib/db/schema";
import {
  assertServerReachable,
  getBaseUrl,
  isServerUnreachable,
} from "./harness";

/**
 * Full-stack check for the published npm package.
 *
 * Spawns `opt-time-mcp` exactly as an MCP client would — as a child
 * process speaking JSON-RPC over stdio — and drives a real session through it.
 * Every call therefore crosses stdio → HTTPS → `/api/v1/me` → service → Postgres
 * and back, which is the one path the in-process suite cannot exercise.
 *
 *   npx tsx --env-file=.env.local scripts/mcp-e2e/package-e2e.ts
 */

const PREFIX = "e2e-pkg-";

/** Kept in sync with the package manifest so the published check pins a version. */
const PACKAGE_NAME = "opt-time-mcp";
const PACKAGE_VERSION = "1.0.1";
let failures = 0;

function check(label: string, ok: boolean, detail = ""): void {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
}

interface JsonRpcResponse {
  id?: number | string;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

/** Minimal stdio MCP client: writes newline-delimited JSON, reads the same. */
class StdioClient {
  private readonly pending = new Map<
    number,
    (value: JsonRpcResponse) => void
  >();
  private nextId = 1;
  readonly stderr: string[] = [];

  constructor(private readonly child: ReturnType<typeof spawn>) {
    const stdout = child.stdout;
    const stderrStream = child.stderr;
    if (!stdout || !stderrStream) throw new Error("stdio indisponível");

    createInterface({ input: stdout }).on("line", (line) => {
      if (!line.trim()) return;
      try {
        const message = JSON.parse(line) as JsonRpcResponse;
        if (message.id !== undefined) {
          const resolve = this.pending.get(Number(message.id));
          if (resolve) {
            this.pending.delete(Number(message.id));
            resolve(message);
          }
        }
      } catch {
        this.stderr.push(`[stdout não-JSON] ${line}`);
      }
    });

    createInterface({ input: stderrStream }).on("line", (line) =>
      this.stderr.push(line),
    );
  }

  send(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<JsonRpcResponse> {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`timeout em ${method}`));
      }, 30_000);

      this.pending.set(id, (value) => {
        clearTimeout(timer);
        resolve(value);
      });

      this.child.stdin?.write(
        `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
      );
    });
  }

  notify(method: string): void {
    this.child.stdin?.write(`${JSON.stringify({ jsonrpc: "2.0", method })}\n`);
  }

  close(): void {
    this.child.kill();
  }
}

async function main(): Promise<void> {
  console.log(
    "\nOptSolv MCP — pacote npm ponta a ponta (stdio → HTTP → banco)",
  );

  // Same preflight as the main suite: a missing server should read as a setup
  // mistake, not as a stack trace.
  await assertServerReachable();
  console.log(`Servidor: ${getBaseUrl()}\n`);

  const userId = `${PREFIX}${crypto.randomUUID().slice(0, 8)}`;
  const projectId = crypto.randomUUID();
  let client: StdioClient | null = null;

  try {
    await db.insert(user).values({
      id: userId,
      name: "E2E pacote",
      email: `${userId}@e2e.optsolv.invalid`,
      role: "member",
      isActive: true,
    });
    await db.insert(project).values({
      id: projectId,
      name: "E2E Pacote NPM",
      code: "E2E-PKG-NPM",
      color: "#f97316",
      status: "active",
    });
    await db.insert(projectMember).values({
      id: crypto.randomUUID(),
      projectId,
      userId,
    });

    const { plaintext } = await createApiToken({
      userId,
      name: "e2e pacote",
      scopes: ["time:read", "time:write"],
      client: "cli",
      expiresInDays: 1,
    });

    // `VERIFY_PUBLISHED=1` drives the artifact downloaded from npm instead of the
    // working tree — the only way to prove that what was published actually runs,
    // rather than what happens to be on disk.
    const published = process.env.VERIFY_PUBLISHED === "1";
    const child = published
      ? // npx is a .cmd shim on Windows, and Node refuses to spawn those
        // without a shell (EINVAL, since the CVE-2024-27980 fix). The command
        // is passed as one string rather than an args array because the array
        // form under `shell: true` is deprecated for unescaped concatenation —
        // and it is safe here since both parts are hardcoded constants.
        spawn(`npx -y ${PACKAGE_NAME}@${PACKAGE_VERSION}`, {
          env: {
            ...process.env,
            OPT_TIME_BASE_URL: getBaseUrl(),
            OPT_TIME_API_KEY: plaintext,
          },
          stdio: ["pipe", "pipe", "pipe"],
          shell: true,
        })
      : spawn(process.execPath, ["packages/opt-time-mcp/bin/cli.js"], {
          env: {
            ...process.env,
            OPT_TIME_BASE_URL: getBaseUrl(),
            OPT_TIME_API_KEY: plaintext,
          },
          stdio: ["pipe", "pipe", "pipe"],
        });

    console.log(
      published
        ? `Artefato: ${PACKAGE_NAME}@${PACKAGE_VERSION} baixado do npm\n`
        : "Artefato: build local (packages/opt-time-mcp)\n",
    );

    client = new StdioClient(child);

    const init = await client.send("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "e2e-package", version: "1" },
    });
    check(
      "initialize via stdio",
      (init.result?.serverInfo as { name?: string })?.name === "opt-time",
    );
    client.notify("notifications/initialized");

    const tools = await client.send("tools/list");
    const toolNames = (
      (tools.result?.tools ?? []) as Array<{ name: string }>
    ).map((t) => t.name);
    check(
      "tools/list traz 16 ferramentas",
      toolNames.length === 16,
      String(toolNames.length),
    );

    const whoami = await client.send("tools/call", {
      name: "opt_time_whoami",
      arguments: {},
    });
    const whoamiResult = whoami.result as {
      isError?: boolean;
      structuredContent?: { user?: { email?: string } };
    };
    check(
      "opt_time_whoami atravessa a pilha inteira",
      whoamiResult.isError === false &&
        whoamiResult.structuredContent?.user?.email ===
          `${userId}@e2e.optsolv.invalid`,
      whoamiResult.structuredContent?.user?.email ?? "",
    );

    const projects = await client.send("tools/call", {
      name: "opt_time_list_projects",
      arguments: { search: "E2E Pacote" },
    });
    const projectResult = projects.result as {
      structuredContent?: { total?: number; truncated?: boolean };
    };
    check(
      "opt_time_list_projects retorna o projeto e o total",
      projectResult.structuredContent?.total === 1 &&
        projectResult.structuredContent?.truncated === false,
      `total=${projectResult.structuredContent?.total}`,
    );

    const logged = await client.send("tools/call", {
      name: "opt_time_log_time",
      arguments: {
        projectId: "E2E Pacote NPM",
        durationMinutes: 45,
        description: "lançamento feito pelo pacote npm",
      },
    });
    const logResult = logged.result as {
      isError?: boolean;
      content?: Array<{ text: string }>;
      structuredContent?: { entry?: { id: string; durationMinutes: number } };
    };
    check(
      "opt_time_log_time grava via pacote",
      logResult.isError === false,
      logResult.content?.[0]?.text.split("\n")[0] ?? "",
    );

    const entryId = logResult.structuredContent?.entry?.id;
    const inDatabase = entryId
      ? await db.query.timeEntry.findFirst({
          where: eq(timeEntry.id, entryId),
          columns: { duration: true, description: true, userId: true },
        })
      : null;
    check(
      "lançamento realmente persistido no Postgres",
      inDatabase?.duration === 45 &&
        inDatabase?.userId === userId &&
        inDatabase?.description === "lançamento feito pelo pacote npm",
      `${inDatabase?.duration} min`,
    );

    const summary = await client.send("tools/call", {
      name: "opt_time_get_today_summary",
      arguments: {},
    });
    const summaryResult = summary.result as {
      structuredContent?: { totalMinutes?: number };
    };
    check(
      "resumo do dia reflete o lançamento",
      summaryResult.structuredContent?.totalMinutes === 45,
      `${summaryResult.structuredContent?.totalMinutes} min`,
    );

    const scopeDenied = await client.send("tools/call", {
      name: "opt_time_submit_timesheet",
      arguments: {},
    });
    const scopeResult = scopeDenied.result as {
      isError?: boolean;
      structuredContent?: { error?: { code?: string } };
    };
    check(
      "escopo é aplicado através do pacote",
      scopeResult.isError === true &&
        scopeResult.structuredContent?.error?.code === "INSUFFICIENT_SCOPE",
      scopeResult.structuredContent?.error?.code ?? "",
    );

    const resources = await client.send("resources/list");
    check(
      "resources/list via pacote",
      ((resources.result?.resources ?? []) as unknown[]).length === 4,
    );

    const guide = await client.send("resources/read", {
      uri: "opt-time://guide/usage",
    });
    const guideText = (
      (guide.result?.contents ?? []) as Array<{ text?: string }>
    )[0]?.text;
    check(
      "resources/read entrega o guia",
      (guideText ?? "").includes("durationMinutes"),
    );

    const prompts = await client.send("prompts/list");
    check(
      "prompts/list via pacote",
      ((prompts.result?.prompts ?? []) as unknown[]).length === 3,
    );

    const promptGet = await client.send("prompts/get", {
      name: "summarize_and_log_day",
      arguments: {},
    });
    const promptText = (
      (promptGet.result?.messages ?? []) as Array<{
        content?: { text?: string };
      }>
    )[0]?.content?.text;
    check(
      "prompts/get monta a instrução",
      (promptText ?? "").includes("opt_time_suggest_daily_entries"),
    );

    check(
      "nada de ruído no stdout do protocolo",
      !client.stderr.some((l) => l.includes("[stdout não-JSON]")),
      client.stderr.filter((l) => l.includes("não-JSON")).join(" | "),
    );
    check(
      "banner de inicialização vai para stderr",
      client.stderr.some((l) => l.includes("pronto (stdio)")),
    );
  } finally {
    client?.close();

    // The token row is hard-deleted below with the rest of the user's data, so
    // there is nothing left to soft-revoke.
    await db.delete(timeEntry).where(eq(timeEntry.userId, userId));
    await db.delete(activeTimer).where(eq(activeTimer.userId, userId));
    await db
      .delete(projectMember)
      .where(inArray(projectMember.userId, [userId]));
    await db.delete(apiToken).where(eq(apiToken.userId, userId));
    await db.delete(project).where(eq(project.id, projectId));
    await db.delete(user).where(eq(user.id, userId));

    const leftover = await db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { id: true },
    });
    check("fixtures do pacote removidas", !leftover);
  }

  console.log(
    `\n${failures === 0 ? "✅ Pacote npm validado ponta a ponta." : `❌ ${failures} falha(s).`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  if (isServerUnreachable(error)) {
    console.error(`
❌ ${(error as Error).message}
`);
  } else {
    console.error("Erro fatal:", error);
  }
  process.exit(1);
});
