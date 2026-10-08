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
): Promise<{
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
  errorCode: string | null;
}> {
  const { body } = await rpc("tools/call", { name, arguments: args });
  // A failed call carries its code in `_meta`, never in `structuredContent`.
  const meta = body.result?._meta as
    | Record<string, { code?: string } | undefined>
    | undefined;
  return {
    isError: body.result?.isError === true,
    text: body.result?.content?.[0]?.text ?? "",
    data: (body.result?.structuredContent ?? {}) as Record<string, unknown>,
    errorCode: meta?.["opt-time/error"]?.code ?? null,
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
    manifest.counts?.tools === 19 &&
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

  // ── Porta do assistente (somente leitura) ───────────────────────────
  section("Porta do assistente");

  check(
    "whoami informa fuso e integrações",
    typeof who.data.timezone === "string" &&
      typeof (who.data.microsoft as { connected?: unknown })?.connected ===
        "boolean" &&
      typeof (who.data.microsoft as { tokenUsable?: unknown })?.tokenUsable ===
        "boolean" &&
      typeof (who.data.azureDevOps as { configured?: unknown })?.configured ===
        "boolean",
    `${who.data.timezone} · Microsoft ${JSON.stringify(who.data.microsoft)} · Azure ${JSON.stringify(who.data.azureDevOps)}`,
  );
  check(
    "resumo do dia informa isWorkday e targetMinutes",
    typeof summary.data.isWorkday === "boolean" &&
      typeof summary.data.targetMinutes === "number",
    `isWorkday=${summary.data.isWorkday} meta=${summary.data.targetMinutes}min`,
  );

  const catalog = await rpc("tools/list");
  const listedTools = (catalog.body.result?.tools ?? []) as Array<{
    name: string;
    outputSchema?: unknown;
  }>;
  const withOutput = [
    "opt_time_get_my_agenda",
    "opt_time_list_my_work_items",
    "opt_time_apply_suggestions",
    "opt_time_suggest_daily_entries",
  ].filter((name) =>
    listedTools.some((item) => item.name === name && item.outputSchema),
  );
  check(
    "ferramentas do assistente publicam outputSchema",
    withOutput.length === 4,
    `${withOutput.length}/4`,
  );

  const suggested = await callTool("opt_time_suggest_daily_entries");
  const suggestionList = (suggested.data.suggestions ?? []) as Array<{
    id?: string;
  }>;
  check(
    "sugestões do dia com ids estáveis",
    !suggested.isError && suggestionList.every((item) => !!item.id),
    suggested.isError
      ? suggested.text.split("\n")[0]
      : `${suggestionList.length} sugestão(ões)`,
  );

  const agenda = await callTool("opt_time_get_my_agenda");
  if (scopes.includes("calendar:read")) {
    const microsoft = who.data.microsoft as
      | { connected?: boolean; tokenUsable?: boolean }
      | undefined;

    if (agenda.errorCode === "MICROSOFT_NOT_CONNECTED") {
      // An account with no Microsoft login is a legitimate "nothing to read".
      // But whoami saying "connected" while the agenda cannot get a token is
      // exactly the failure this smoke test exists to catch: it must not pass.
      check(
        "agenda do Outlook",
        microsoft?.connected !== true,
        microsoft?.connected === true
          ? `whoami diz conectado (tokenUsable=${microsoft.tokenUsable}), mas a agenda não consegue obter o token do Graph`
          : "sem conta Microsoft vinculada — nada a ler",
      );
    } else {
      check("agenda do Outlook", !agenda.isError, agenda.text.split("\n")[0]);
    }
  } else {
    check(
      "agenda exige o escopo calendar:read",
      agenda.errorCode === "INSUFFICIENT_SCOPE" &&
        Object.keys(agenda.data).length === 0,
    );
  }

  const myItems = await callTool("opt_time_list_my_work_items", { top: 5 });
  check(
    "work items atribuídos",
    !myItems.isError || myItems.errorCode === "AZURE_DEVOPS_NOT_CONFIGURED",
    myItems.text.split("\n")[0],
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
