/**
 * Read-only smoke test for a deployed environment.
 *
 * Unlike `verify:mcp`, this touches no database directly and creates nothing:
 * it drives the public MCP endpoint with a real personal access token and only
 * calls read tools. That makes it the one suite that is safe to point at
 * production.
 *
 *   OPT_TIME_API_KEY=opt_tok_… pnpm verify:mcp:smoke
 *   OPT_TIME_API_KEY=opt_tok_… VERIFY_BASE_URL=http://localhost:3100 pnpm verify:mcp:smoke
 *
 * Exits 1 on any failure, so it can gate a deploy.
 */

const BASE_URL = (
  process.env.VERIFY_BASE_URL ?? "https://opt-time.optsolv.com.br"
).replace(/\/+$/, "");

const TOKEN = process.env.OPT_TIME_API_KEY?.trim();

let failures = 0;

function check(label: string, ok: boolean, detail = ""): boolean {
  console.log(`  ${ok ? "✅" : "❌"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures += 1;
  return ok;
}

function section(title: string): void {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 50 - title.length))}`);
}

interface RpcBody {
  result?: {
    isError?: boolean;
    content?: Array<{ text: string }>;
    structuredContent?: Record<string, unknown>;
    [key: string]: unknown;
  };
  error?: { code: number; message: string };
}

async function rpc(
  method: string,
  params?: Record<string, unknown>,
): Promise<{ status: number; body: RpcBody }> {
  const res = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  let body: RpcBody = {};
  try {
    body = text ? (JSON.parse(text) as RpcBody) : {};
  } catch {
    body = { error: { code: -1, message: text.slice(0, 200) } };
  }
  return { status: res.status, body };
}

async function callTool(
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; text: string; data: Record<string, unknown> }> {
  const { body } = await rpc("tools/call", { name, arguments: args });
  return {
    isError: body.result?.isError === true,
    text: body.result?.content?.[0]?.text ?? "",
    data: (body.result?.structuredContent ?? {}) as Record<string, unknown>,
  };
}

async function main(): Promise<void> {
  console.log("\nOptSolv MCP — smoke test (somente leitura)");
  console.log(`Ambiente: ${BASE_URL}\n`);

  if (!TOKEN) {
    console.error(
      "❌ OPT_TIME_API_KEY não definido.\n\n" +
        "   Gere um token em:\n" +
        `     ${BASE_URL}/dashboard/settings/integrations/mcp\n\n` +
        "   E rode:\n" +
        "     OPT_TIME_API_KEY=opt_tok_… pnpm verify:mcp:smoke\n",
    );
    process.exit(1);
  }

  // ── Infra pública ───────────────────────────────────────────────────
  section("Infraestrutura");

  const manifestRes = await fetch(`${BASE_URL}/api/mcp/manifest`, {
    signal: AbortSignal.timeout(30_000),
  });
  const manifest = (await manifestRes.json()) as {
    name?: string;
    version?: string;
    counts?: { tools: number; resources: number; prompts: number };
    transports?: { http?: { url?: string } };
  };
  check("manifesto público responde", manifestRes.status === 200);
  check(
    "é o servidor opt-time",
    manifest.name === "opt-time",
    manifest.name ?? "",
  );
  check(
    "URL base não aponta para localhost",
    !(manifest.transports?.http?.url ?? "").includes("localhost"),
    manifest.transports?.http?.url ?? "",
  );
  check(
    "catálogo completo",
    manifest.counts?.tools === 16 &&
      manifest.counts?.resources === 4 &&
      manifest.counts?.prompts === 3,
    JSON.stringify(manifest.counts),
  );

  const noAuth = await fetch(`${BASE_URL}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    signal: AbortSignal.timeout(30_000),
  });
  check("sem token responde 401", noAuth.status === 401, String(noAuth.status));
  check("401 traz WWW-Authenticate", !!noAuth.headers.get("www-authenticate"));

  // ── Autenticação ────────────────────────────────────────────────────
  section("Seu token");

  const init = await rpc("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke", version: "1" },
  });
  if (
    !check(
      "initialize aceito",
      init.status === 200 && !init.body.error,
      init.body.error?.message ?? String(init.status),
    )
  ) {
    console.error(
      "\n   O token foi rejeitado. Gere um novo e tente de novo.\n",
    );
    process.exit(1);
  }

  const who = await callTool("opt_time_whoami");
  check("opt_time_whoami responde", !who.isError, who.text.split("\n")[0]);
  const scopes = (who.data.scopes ?? []) as string[];
  check(
    "token identifica um usuário",
    typeof who.data.email === "string",
    String(who.data.email),
  );
  console.log(`     escopos: ${scopes.join(", ") || "(nenhum)"}`);

  // ── Leituras ────────────────────────────────────────────────────────
  section("Leituras");

  const projects = await callTool("opt_time_list_projects", { limit: 5 });
  const total = projects.data.total as number | undefined;
  check("lista projetos", !projects.isError, `${total ?? "?"} acessível(is)`);
  check(
    "payload informa total e truncamento",
    typeof total === "number" && typeof projects.data.truncated === "boolean",
  );

  const summary = await callTool("opt_time_get_today_summary");
  check("resumo do dia", !summary.isError, summary.text.split("\n")[0]);

  const timesheet = await callTool("opt_time_get_timesheet_status");
  check(
    "status do timesheet",
    !timesheet.isError,
    timesheet.text.split("\n")[0],
  );

  const timer = await callTool("opt_time_get_active_timer");
  check("timer ativo consultável", !timer.isError, timer.text.split("\n")[0]);

  const entries = await callTool("opt_time_list_time_entries");
  check(
    "lançamentos de hoje",
    !entries.isError,
    `${entries.data.count ?? 0} entrada(s)`,
  );

  // ── Recursos e prompts ──────────────────────────────────────────────
  section("Recursos e prompts");

  for (const uri of [
    "opt-time://projects/active",
    "opt-time://user/today",
    "opt-time://timesheets/current",
    "opt-time://guide/usage",
  ]) {
    const { body } = await rpc("resources/read", { uri });
    const contents = body.result?.contents as
      | Array<{ text?: string }>
      | undefined;
    check(uri, !!contents?.[0]?.text);
  }

  const prompts = await rpc("prompts/list");
  const promptList = (prompts.body.result?.prompts ?? []) as unknown[];
  check(
    "prompts disponíveis",
    promptList.length === 3,
    String(promptList.length),
  );

  // ── Garantia de que nada foi escrito ────────────────────────────────
  section("Confirmação de segurança");

  const after = await callTool("opt_time_get_today_summary");
  check(
    "nenhum lançamento criado por este smoke test",
    after.data.totalMinutes === summary.data.totalMinutes &&
      after.data.entryCount === summary.data.entryCount,
    `${after.data.totalMinutes} min, ${after.data.entryCount} lançamento(s) — inalterado`,
  );

  const canWrite = scopes.includes("time:write");
  console.log(
    `     este token ${canWrite ? "PODE" : "não pode"} escrever — o smoke test só leu, de qualquer forma`,
  );

  console.log(
    `\n${failures === 0 ? "✅ Ambiente saudável e pronto para uso." : `❌ ${failures} verificação(ões) falharam.`}\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error: unknown) => {
  console.error(
    `\n❌ Falha ao falar com ${BASE_URL}: ${
      error instanceof Error ? error.message : "erro desconhecido"
    }\n`,
  );
  process.exit(1);
});
