import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  activeTimer,
  apiToken,
  timeEntry,
  timesheet,
  user,
} from "@/lib/db/schema";
import { formatLocalDate, getWeekPeriod } from "@/lib/utils";
import {
  assertServerReachable,
  check,
  cleanup,
  getBaseUrl,
  info,
  isServerUnreachable,
  makeProject,
  makeToken,
  makeUser,
  percentile,
  phase,
  rest,
  revokeRealAccountTokens,
  rpc,
  skip,
  summary,
  timed,
  tool,
  warn,
} from "./harness";

/**
 * Production-readiness suite for the OptSolv MCP server.
 *
 * Needs a running server. With `VERIFY_BASE_URL` unset it probes
 * http://localhost:3100 then :3000 and uses whichever answers as OptSolv.
 *
 *   pnpm dev                 # em outro terminal
 *   pnpm verify:mcp
 *   VERIFY_BASE_URL=https://opt-time.optsolv.com.br pnpm verify:mcp
 *
 * Safe to re-run: every fixture is ephemeral and removed in `finally`.
 */

const REAL_ACCOUNT_EMAIL =
  process.env.VERIFY_ACCOUNT_EMAIL ?? "marcus.boni@optsolv.com.br";

/** MCP requires tool names to match this. */
const MCP_NAME_PATTERN = /^[a-zA-Z0-9_-]{1,128}$/;

const today = formatLocalDate();

async function main(): Promise<void> {
  console.log(`\nOptSolv MCP — verificação de prontidão para produção`);

  // Fail fast and legibly when no server is up: otherwise the first request
  // dies on a raw ECONNREFUSED stack trace that names no cause and no fix.
  await assertServerReachable();

  console.log(`Servidor: ${getBaseUrl()}`);
  console.log(`Data: ${today}`);

  const realAccount = await db.query.user.findFirst({
    where: eq(user.email, REAL_ACCOUNT_EMAIL),
    columns: { id: true, name: true, role: true, isActive: true },
  });

  // Ground truth captured before anything runs, so the closing assertion can
  // prove this suite never wrote to the real account.
  const realEntriesBefore = realAccount
    ? await db.query.timeEntry.findMany({
        where: eq(timeEntry.userId, realAccount.id),
        columns: { id: true },
      })
    : [];
  const realTimesheetsBefore = realAccount
    ? await db.query.timesheet.findMany({
        where: eq(timesheet.userId, realAccount.id),
        columns: { id: true, status: true },
      })
    : [];

  // ═══ 1. Conformidade do protocolo ═══════════════════════════════════
  phase("1. Conformidade do protocolo MCP");

  const probe = await makeUser("proto", { scopes: ["time:read"] });

  const init = await rpc(probe.token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "e2e", version: "1" },
  });
  check("initialize responde 200", init.status === 200, String(init.status));
  check(
    "protocolVersion negociada",
    init.body.result?.protocolVersion === "2025-06-18",
    String(init.body.result?.protocolVersion),
  );
  check(
    "instructions presentes",
    typeof init.body.result?.instructions === "string" &&
      (init.body.result.instructions as string).length > 50,
  );
  check(
    "header MCP-Protocol-Version",
    init.headers.get("mcp-protocol-version") === "2025-06-18",
    init.headers.get("mcp-protocol-version") ?? "ausente",
  );

  const tools = await rpc(probe.token, "tools/list");
  const toolList = (tools.body.result?.tools ?? []) as Array<{
    name: string;
    description: string;
    inputSchema: {
      type: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };
    annotations?: Record<string, unknown>;
  }>;
  check(
    "tools/list traz 16 ferramentas",
    toolList.length === 16,
    String(toolList.length),
  );

  let schemaProblems = 0;
  for (const t of toolList) {
    if (!MCP_NAME_PATTERN.test(t.name)) {
      warn(`nome de ferramenta inválido para MCP: ${t.name}`);
      schemaProblems += 1;
    }
    if (t.inputSchema.type !== "object") {
      warn(`inputSchema de ${t.name} não é object`);
      schemaProblems += 1;
    }
    if (!t.description || t.description.length < 30) {
      warn(`descrição curta demais em ${t.name}`);
      schemaProblems += 1;
    }
    for (const req of t.inputSchema.required ?? []) {
      if (!t.inputSchema.properties || !(req in t.inputSchema.properties)) {
        warn(
          `${t.name}: 'required' cita "${req}" que não existe em properties`,
        );
        schemaProblems += 1;
      }
    }
    for (const [key, value] of Object.entries(t.inputSchema.properties ?? {})) {
      const prop = value as { description?: string };
      if (!prop.description) {
        warn(`${t.name}.${key} sem description`);
        schemaProblems += 1;
      }
    }
  }
  check(
    "todos os inputSchema são válidos e documentados",
    schemaProblems === 0,
    `${schemaProblems} problema(s)`,
  );

  const annotated = toolList.filter(
    (t) => t.annotations && "readOnlyHint" in t.annotations,
  );
  check(
    "todas as ferramentas têm annotations",
    annotated.length === toolList.length,
    `${annotated.length}/${toolList.length}`,
  );

  // JSON-RPC edge cases
  const stringId = await rpc(probe.token, "ping", undefined, "abc-123");
  check(
    "id string preservado",
    stringId.body.id === "abc-123",
    String(stringId.body.id),
  );

  const batch = await fetch(`${getBaseUrl()}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${probe.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      { jsonrpc: "2.0", id: 1, method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: 2, method: "prompts/list" },
    ]),
  });
  const batchBody = (await batch.json()) as unknown[];
  check(
    "batch misto devolve só as 2 respostas",
    Array.isArray(batchBody) && batchBody.length === 2,
    String(batchBody.length),
  );

  const emptyBatch = await fetch(`${getBaseUrl()}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${probe.token}`,
      "Content-Type": "application/json",
    },
    body: "[]",
  });
  const emptyBody = (await emptyBatch.json()) as { error?: { code: number } };
  check(
    "batch vazio vira INVALID_REQUEST",
    emptyBody.error?.code === -32600,
    String(emptyBody.error?.code),
  );

  const malformedRpc = await rpc(probe.token, "");
  check(
    "método vazio é rejeitado",
    !!malformedRpc.body.error,
    String(malformedRpc.body.error?.code),
  );

  const missingParams = await rpc(probe.token, "tools/call", {});
  check(
    "tools/call sem name vira erro de params",
    missingParams.body.error?.code === -32602,
    String(missingParams.body.error?.code),
  );

  const unknownTool = await tool(probe.token, "opt_time_nao_existe");
  check(
    "ferramenta inexistente responde erro",
    unknownTool.status === 200 && !!unknownTool.text,
  );

  // ═══ 2. Isolamento entre usuários ═══════════════════════════════════
  phase("2. Isolamento entre usuários (multi-tenant)");

  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  const shared = await makeProject("shared", [alice.id, bob.id]);
  const aliceOnly = await makeProject("alice-only", [alice.id]);

  const aliceEntry = await tool(alice.token, "opt_time_log_time", {
    projectId: aliceOnly.code,
    durationMinutes: 30,
    description: "trabalho privado da Alice",
  });
  check(
    "Alice registra no projeto dela",
    !aliceEntry.isError,
    aliceEntry.text.slice(0, 60),
  );
  const aliceEntryId = ((aliceEntry.data.entry as { id?: string } | undefined)
    ?.id ?? "") as string;

  const bobList = await tool(bob.token, "opt_time_list_time_entries", {
    from: today,
    to: today,
  });
  const bobEntries = (bobList.data.entries ?? []) as Array<{ id: string }>;
  check(
    "Bob NÃO vê o lançamento da Alice",
    !bobEntries.some((e) => e.id === aliceEntryId),
  );

  const bobUpdate = await tool(bob.token, "opt_time_update_time_entry", {
    entryId: aliceEntryId,
    description: "sequestrado",
  });
  check(
    "Bob NÃO consegue editar lançamento da Alice",
    bobUpdate.isError && bobUpdate.errorCode === "NOT_FOUND",
    bobUpdate.errorCode ?? "",
  );

  const bobDelete = await tool(bob.token, "opt_time_delete_time_entry", {
    entryId: aliceEntryId,
  });
  check(
    "Bob NÃO consegue excluir lançamento da Alice",
    bobDelete.isError && bobDelete.errorCode === "NOT_FOUND",
    bobDelete.errorCode ?? "",
  );

  const stillThere = await db.query.timeEntry.findFirst({
    where: and(eq(timeEntry.id, aliceEntryId), isNull(timeEntry.deletedAt)),
    columns: { id: true, description: true },
  });
  check(
    "lançamento da Alice intacto no banco",
    stillThere?.description === "trabalho privado da Alice",
  );

  const bobProjects = await tool(bob.token, "opt_time_list_projects", {
    search: "E2E",
    status: "all",
  });
  const bobProjectCodes = (
    (bobProjects.data.projects ?? []) as Array<{ code: string }>
  ).map((p) => p.code);
  check(
    "Bob vê o projeto compartilhado",
    bobProjectCodes.includes(shared.code),
  );
  check(
    "Bob NÃO vê o projeto exclusivo da Alice",
    !bobProjectCodes.includes(aliceOnly.code),
    bobProjectCodes.join(","),
  );

  const bobWritesAlice = await tool(bob.token, "opt_time_log_time", {
    projectId: aliceOnly.code,
    durationMinutes: 30,
    description: "invasão",
  });
  check(
    "Bob NÃO consegue lançar no projeto da Alice",
    bobWritesAlice.isError,
    bobWritesAlice.errorCode ?? "",
  );

  const aliceTimer = await tool(alice.token, "opt_time_start_timer", {
    projectId: shared.code,
    description: "timer da Alice",
  });
  check(
    "Alice inicia timer",
    !aliceTimer.isError,
    aliceTimer.text.slice(0, 50),
  );
  const bobTimer = await tool(bob.token, "opt_time_get_active_timer");
  check("Bob NÃO vê o timer da Alice", bobTimer.data.timer === null);
  await tool(alice.token, "opt_time_stop_timer");

  const bobSummary = await tool(bob.token, "opt_time_get_today_summary");
  check(
    "resumo do Bob não conta horas da Alice",
    (bobSummary.data.totalMinutes as number) === 0,
    String(bobSummary.data.totalMinutes),
  );

  // ═══ 3. Concorrência ════════════════════════════════════════════════
  phase("3. Concorrência");

  const racer = await makeUser("racer");
  const raceProject = await makeProject("race", [racer.id]);

  const parallelStarts = await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      tool(racer.token, "opt_time_start_timer", {
        projectId: raceProject.code,
        description: `corrida ${i}`,
      }),
    ),
  );
  const startOk = parallelStarts.filter((r) => !r.isError).length;
  const activeRows = await db.query.activeTimer.findMany({
    where: eq(activeTimer.userId, racer.id),
    columns: { id: true },
  });
  const activeCount = activeRows.length;
  check(
    "8 starts paralelos deixam no máximo 1 timer ativo",
    activeCount <= 1,
    `${startOk} aceitos, ${activeCount} ativo(s)`,
  );
  check(
    "nenhum start paralelo derrubou o servidor",
    parallelStarts.every((r) => r.status === 200),
  );
  info(`starts aceitos: ${startOk}/8 (os demais falharam de forma controlada)`);

  const shortStop = await tool(racer.token, "opt_time_stop_timer");
  check(
    "parar timer com poucos segundos não cria lançamento",
    !shortStop.isError && shortStop.data.saved === false,
    shortStop.text.split("\n")[0] ?? "",
  );

  const junkBefore = await db.query.timeEntry.findMany({
    where: and(eq(timeEntry.userId, racer.id), isNull(timeEntry.deletedAt)),
    columns: { id: true, duration: true },
  });
  const oneMinuteJunk = junkBefore.filter((e) => e.duration === 1).length;
  check(
    "starts em corrida NÃO geram lançamentos fantasma de 1 minuto",
    oneMinuteJunk === 0,
    `${oneMinuteJunk} lançamento(s) de 1min encontrados`,
  );

  const first = await tool(racer.token, "opt_time_start_timer", {
    projectId: raceProject.code,
    description: "primeiro",
  });
  check("timer inicia sem timer anterior", !first.isError);
  const second = await tool(racer.token, "opt_time_start_timer", {
    projectId: raceProject.code,
    description: "corrigindo o projeto",
  });
  check(
    "trocar de timer em segundos descarta o anterior em vez de inventar 1min",
    !second.isError &&
      (second.data.discarded as unknown) !== null &&
      (second.data.replaced as unknown) === null,
    second.text.split("\n").pop() ?? "",
  );
  await tool(racer.token, "opt_time_stop_timer");

  const parallelStops = await Promise.all(
    Array.from({ length: 5 }, () => tool(racer.token, "opt_time_stop_timer")),
  );
  check(
    "stops paralelos sem timer falham de forma limpa",
    parallelStops.every((r) => r.isError && r.errorCode === "NOT_FOUND"),
  );

  const parallelLogs = await Promise.all(
    Array.from({ length: 12 }, (_, i) =>
      tool(racer.token, "opt_time_log_time", {
        projectId: raceProject.id,
        durationMinutes: 5,
        description: `paralelo ${i}`,
      }),
    ),
  );
  const logged = parallelLogs.filter((r) => !r.isError).length;
  const dbCount = await db.query.timeEntry.findMany({
    where: and(eq(timeEntry.userId, racer.id), isNull(timeEntry.deletedAt)),
    columns: { id: true },
  });
  check(
    "12 lançamentos paralelos gravam todos",
    logged === 12 && dbCount.length >= 12,
    `${logged} aceitos, ${dbCount.length} no banco`,
  );

  const racerSummary = await tool(racer.token, "opt_time_get_today_summary");
  const expectedMin = 12 * 5;
  check(
    "total do dia bate com os lançamentos paralelos",
    (racerSummary.data.totalMinutes as number) >= expectedMin,
    `${racerSummary.data.totalMinutes} min (esperado ≥ ${expectedMin})`,
  );

  // ═══ 4. Rate limiting ═══════════════════════════════════════════════
  phase("4. Rate limiting");

  const flooder = await makeUser("flood", { scopes: ["time:read"] });
  const burst = await Promise.all(
    Array.from({ length: 260 }, () => rpc(flooder.token, "ping")),
  );
  const limited = burst.filter((r) => r.status === 429).length;
  const okCount = burst.filter((r) => r.status === 200).length;
  check(
    "rate limit dispara acima de 240 req/min",
    limited > 0,
    `${okCount} ok, ${limited} bloqueadas`,
  );
  check(
    "limite não estrangula abaixo do teto",
    okCount >= 200,
    `${okCount} passaram`,
  );

  const rlHeaders = burst.find((r) => r.status === 200)?.headers;
  check(
    "headers de rate limit presentes",
    rlHeaders?.get("x-ratelimit-limit") === "240",
    rlHeaders?.get("x-ratelimit-limit") ?? "ausente",
  );

  const otherUser = await rpc(alice.token, "ping");
  check(
    "rate limit de um token NÃO afeta outro usuário",
    otherUser.status === 200,
    String(otherUser.status),
  );

  // ═══ 5. Robustez de entrada ═════════════════════════════════════════
  phase("5. Robustez de entrada");

  const hostile: Array<[string, Record<string, unknown>]> = [
    [
      "SQL injection no projeto",
      {
        projectId: "'; DROP TABLE time_entry; --",
        durationMinutes: 30,
        description: "x",
      },
    ],
    [
      "duração zero",
      { projectId: raceProject.code, durationMinutes: 0, description: "x" },
    ],
    [
      "duração negativa",
      { projectId: raceProject.code, durationMinutes: -60, description: "x" },
    ],
    [
      "duração absurda",
      {
        projectId: raceProject.code,
        durationMinutes: 999999,
        description: "x",
      },
    ],
    [
      "duração NaN",
      { projectId: raceProject.code, durationMinutes: "abc", description: "x" },
    ],
    [
      "data inexistente",
      {
        projectId: raceProject.code,
        durationMinutes: 30,
        description: "x",
        date: "2026-02-30",
      },
    ],
    [
      "data mal formada",
      {
        projectId: raceProject.code,
        durationMinutes: 30,
        description: "x",
        date: "31/12/2026",
      },
    ],
    [
      "data futura",
      {
        projectId: raceProject.code,
        durationMinutes: 30,
        description: "x",
        date: "2030-01-01",
      },
    ],
    [
      "data antiga demais",
      {
        projectId: raceProject.code,
        durationMinutes: 30,
        description: "x",
        date: "2020-01-01",
      },
    ],
    [
      "descrição vazia",
      { projectId: raceProject.code, durationMinutes: 30, description: "   " },
    ],
    ["projeto vazio", { projectId: "", durationMinutes: 30, description: "x" }],
    [
      "tipos trocados",
      { projectId: 42, durationMinutes: "x", description: [] },
    ],
  ];

  let hostileHandled = 0;
  for (const [label, args] of hostile) {
    const r = await tool(racer.token, "opt_time_log_time", args);
    const handled = r.status === 200 && r.isError && !!r.errorCode;
    if (handled) hostileHandled += 1;
    else
      warn(
        `entrada hostil mal tratada: ${label}`,
        `status=${r.status} isError=${r.isError} code=${r.errorCode}`,
      );
  }
  check(
    "toda entrada hostil rejeitada de forma controlada",
    hostileHandled === hostile.length,
    `${hostileHandled}/${hostile.length}`,
  );

  const tableStillThere = await db.query.timeEntry.findMany({
    columns: { id: true },
    limit: 1,
  });
  check(
    "tabela time_entry intacta após tentativa de SQL injection",
    tableStillThere.length === 1,
  );

  // Markup in a description is stored verbatim on purpose: descriptions are free
  // text ("durou < 2h" is legitimate) and every render path escapes them. What
  // matters is that it round-trips unmodified and never reaches an HTML sink.
  const markup = "<script>alert(1)</script> & <b>bold</b>";
  const markupEntry = await tool(racer.token, "opt_time_log_time", {
    projectId: raceProject.code,
    durationMinutes: 10,
    description: markup,
  });
  check("markup na descrição é aceito como texto", !markupEntry.isError);
  const storedMarkup = await db.query.timeEntry.findFirst({
    where: eq(
      timeEntry.id,
      (markupEntry.data.entry as { id?: string })?.id ?? "",
    ),
    columns: { description: true },
  });
  check(
    "markup gravado verbatim, sem escape duplo nem sanitização silenciosa",
    storedMarkup?.description === markup,
    storedMarkup?.description ?? "",
  );

  // Descrição longa e unicode
  const longDesc = "á".repeat(5000);
  const longResult = await tool(racer.token, "opt_time_log_time", {
    projectId: raceProject.code,
    durationMinutes: 10,
    description: longDesc,
  });
  if (!longResult.isError) {
    const stored = (longResult.data.entry as { description: string })
      .description;
    check(
      "descrição gigante é truncada em 500 chars",
      stored.length <= 500,
      `${stored.length} chars`,
    );
  } else {
    check(
      "descrição gigante rejeitada de forma limpa",
      !!longResult.errorCode,
      longResult.errorCode ?? "",
    );
  }

  const emoji = await tool(racer.token, "opt_time_log_time", {
    projectId: raceProject.code,
    durationMinutes: 10,
    description: "Deploy 🚀 concluído — acentuação çãõ ok",
  });
  check(
    "unicode/emoji preservado",
    !emoji.isError &&
      (
        (emoji.data.entry as { description: string })?.description ?? ""
      ).includes("🚀"),
  );

  const bigBody = await fetch(`${getBaseUrl()}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${racer.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: {
        name: "opt_time_log_time",
        arguments: {
          projectId: "x".repeat(100000),
          durationMinutes: 5,
          description: "y",
        },
      },
    }),
  });
  check(
    "payload de 100KB não derruba o servidor",
    bigBody.status < 500,
    String(bigBody.status),
  );

  // ═══ 6. Regras de negócio ═══════════════════════════════════════════
  phase("6. Regras de negócio e bloqueio de período");

  const closer = await makeUser("closer");
  const closerProject = await makeProject("closer", [closer.id]);

  for (let i = 0; i < 5; i += 1) {
    await tool(closer.token, "opt_time_log_time", {
      projectId: closerProject.code,
      durationMinutes: 480,
      description: `dia produtivo ${i}`,
      date: formatLocalDate(new Date(Date.now() - i * 86_400_000)),
    });
  }

  const statusBefore = await tool(
    closer.token,
    "opt_time_get_timesheet_status",
  );
  check(
    "timesheet começa aberto",
    statusBefore.data.status === "open",
    String(statusBefore.data.status),
  );

  const submitNaive = await tool(closer.token, "opt_time_submit_timesheet");
  const submittedDirectly = !submitNaive.isError;
  if (!submittedDirectly) {
    check(
      "submit sem force é bloqueado quando há dias incompletos",
      submitNaive.errorCode === "CONFLICT",
      submitNaive.errorCode ?? "",
    );
    const submitForced = await tool(closer.token, "opt_time_submit_timesheet", {
      force: true,
    });
    check(
      "submit com force=true funciona",
      !submitForced.isError,
      submitForced.text.slice(0, 60),
    );
  } else {
    check(
      "submit direto funciona quando a semana está completa",
      true,
      "semana já estava completa",
    );
  }

  const statusAfter = await tool(closer.token, "opt_time_get_timesheet_status");
  check(
    "timesheet fica submetido",
    statusAfter.data.status === "submitted",
    String(statusAfter.data.status),
  );

  const writeLocked = await tool(closer.token, "opt_time_log_time", {
    projectId: closerProject.code,
    durationMinutes: 60,
    description: "tentando furar o bloqueio",
  });
  check(
    "semana submetida bloqueia novo lançamento",
    writeLocked.isError && writeLocked.errorCode === "PERIOD_LOCKED",
    writeLocked.errorCode ?? "",
  );

  const lockedEntries = await tool(closer.token, "opt_time_list_time_entries", {
    from: formatLocalDate(new Date(Date.now() - 4 * 86_400_000)),
    to: today,
  });
  const firstLocked = (
    (lockedEntries.data.entries ?? []) as Array<{ id: string; locked: boolean }>
  )[0];
  check(
    "listagem marca lançamentos como bloqueados",
    firstLocked?.locked === true,
    String(firstLocked?.locked),
  );

  const editLocked = await tool(closer.token, "opt_time_update_time_entry", {
    entryId: firstLocked?.id ?? "x",
    durationMinutes: 1,
  });
  check(
    "semana submetida bloqueia edição",
    editLocked.isError && editLocked.errorCode === "PERIOD_LOCKED",
    editLocked.errorCode ?? "",
  );

  const deleteLocked = await tool(closer.token, "opt_time_delete_time_entry", {
    entryId: firstLocked?.id ?? "x",
  });
  check(
    "semana submetida bloqueia exclusão",
    deleteLocked.isError && deleteLocked.errorCode === "PERIOD_LOCKED",
    deleteLocked.errorCode ?? "",
  );

  const timerLocked = await tool(closer.token, "opt_time_start_timer", {
    projectId: closerProject.code,
    description: "x",
  });
  check(
    "semana submetida bloqueia o timer",
    timerLocked.isError && timerLocked.errorCode === "PERIOD_LOCKED",
    timerLocked.errorCode ?? "",
  );

  const resubmit = await tool(closer.token, "opt_time_submit_timesheet", {
    force: true,
  });
  check(
    "resubmeter semana já submetida é bloqueado",
    resubmit.isError && resubmit.errorCode === "CONFLICT",
    resubmit.errorCode ?? "",
  );

  const dbTimesheet = await db.query.timesheet.findFirst({
    where: and(
      eq(timesheet.userId, closer.id),
      eq(timesheet.period, getWeekPeriod(new Date())),
    ),
    columns: { status: true, totalMinutes: true, submittedAt: true },
  });
  check(
    "timesheet gravado com submittedAt e total",
    !!dbTimesheet?.submittedAt && (dbTimesheet?.totalMinutes ?? 0) > 0,
    `${dbTimesheet?.totalMinutes} min`,
  );

  // ═══ 7. Escopos ═════════════════════════════════════════════════════
  phase("7. Escopos de token");

  const readToken = await makeToken(alice.id, "read-only", ["time:read"]);
  const writeToken = await makeToken(alice.id, "no-submit", [
    "time:read",
    "time:write",
  ]);

  const readWrite = await tool(readToken.token, "opt_time_log_time", {
    projectId: shared.code,
    durationMinutes: 10,
    description: "x",
  });
  check(
    "token read-only não escreve",
    readWrite.errorCode === "INSUFFICIENT_SCOPE",
    readWrite.errorCode ?? "",
  );

  const readTimer = await tool(readToken.token, "opt_time_start_timer", {
    projectId: shared.code,
    description: "x",
  });
  check(
    "token read-only não inicia timer",
    readTimer.errorCode === "INSUFFICIENT_SCOPE",
    readTimer.errorCode ?? "",
  );

  const writeSubmit = await tool(writeToken.token, "opt_time_submit_timesheet");
  check(
    "token sem timesheets:submit não submete",
    writeSubmit.errorCode === "INSUFFICIENT_SCOPE",
    writeSubmit.errorCode ?? "",
  );

  const writeLog = await tool(writeToken.token, "opt_time_log_time", {
    projectId: shared.code,
    durationMinutes: 10,
    description: "escopo ok",
  });
  check(
    "token write registra normalmente",
    !writeLog.isError,
    writeLog.text.slice(0, 50),
  );

  const readResource = await rpc(readToken.token, "resources/read", {
    uri: "opt-time://user/today",
  });
  check("token read-only lê recursos", !readResource.body.error);

  const expiredToken = await makeToken(
    alice.id,
    "expired",
    ["time:read"],
    null,
  );
  await db
    .update(apiToken)
    .set({ expiresAt: new Date(Date.now() - 86_400_000) })
    .where(eq(apiToken.id, expiredToken.tokenId));
  const expiredCall = await rest(expiredToken.token, "");
  check(
    "token expirado é rejeitado com 401",
    expiredCall.status === 401,
    String(expiredCall.status),
  );

  // ═══ 8. Desempenho com volume real ══════════════════════════════════
  phase("8. Desempenho com volume real de dados");

  if (!realAccount) {
    skip("desempenho na conta real", `${REAL_ACCOUNT_EMAIL} não encontrada`);
  } else {
    const realToken = await makeToken(realAccount.id, "perf", ["time:read"]);
    const samples: Record<string, number[]> = {};

    const record = async (label: string, fn: () => Promise<unknown>) => {
      samples[label] ??= [];
      for (let i = 0; i < 5; i += 1) {
        const { ms } = await timed(fn);
        samples[label].push(ms);
      }
    };

    await record("whoami", () => tool(realToken.token, "opt_time_whoami"));
    await record("list_projects", () =>
      tool(realToken.token, "opt_time_list_projects", { limit: 200 }),
    );
    await record("today_summary", () =>
      tool(realToken.token, "opt_time_get_today_summary"),
    );
    await record("timesheet_status", () =>
      tool(realToken.token, "opt_time_get_timesheet_status"),
    );
    await record("list_entries_30d", () =>
      tool(realToken.token, "opt_time_list_time_entries", {
        from: formatLocalDate(new Date(Date.now() - 30 * 86_400_000)),
        to: today,
        limit: 200,
      }),
    );
    await record("resource_today", () =>
      rpc(realToken.token, "resources/read", { uri: "opt-time://user/today" }),
    );

    for (const [label, values] of Object.entries(samples)) {
      const p50 = percentile(values, 50);
      const p95 = percentile(values, 95);
      const ok = p95 < 3000;
      check(`${label} p95 < 3s`, ok, `p50=${p50}ms p95=${p95}ms`);
      if (p95 >= 1000 && p95 < 3000)
        warn(`${label} está lento`, `p95=${p95}ms`);
    }
  }

  // ═══ 9. Conta real (somente leitura) ════════════════════════════════
  phase("9. Conta real — somente leitura");

  if (!realAccount) {
    skip("verificação da conta real", `${REAL_ACCOUNT_EMAIL} não encontrada`);
  } else {
    const realToken = await makeToken(realAccount.id, "readonly", [
      "time:read",
    ]);

    const who = await tool(realToken.token, "opt_time_whoami");
    check(
      "whoami identifica a conta real",
      who.data.email === REAL_ACCOUNT_EMAIL,
      String(who.data.email),
    );
    check(
      "papel correto",
      who.data.role === realAccount.role,
      String(who.data.role),
    );
    info(who.text.split("\n")[0] ?? "");

    const projects = await tool(realToken.token, "opt_time_list_projects", {
      limit: 200,
    });
    const projectCount = ((projects.data.projects ?? []) as unknown[]).length;
    check(
      "lista projetos da conta real",
      projectCount > 0,
      `${projectCount} projeto(s)`,
    );

    const defaultProjects = await tool(
      realToken.token,
      "opt_time_list_projects",
    );
    const defaultCount = ((defaultProjects.data.projects ?? []) as unknown[])
      .length;
    const total = defaultProjects.data.total as number | undefined;
    if (defaultCount < projectCount) {
      check(
        "listagem truncada avisa o total",
        typeof total === "number" && total > defaultCount,
        total === undefined
          ? "campo 'total' ausente no payload"
          : `${defaultCount} de ${total}`,
      );
    }

    const summaryReal = await tool(
      realToken.token,
      "opt_time_get_today_summary",
    );
    check(
      "resumo do dia da conta real",
      !summaryReal.isError,
      summaryReal.text.split("\n")[0],
    );

    const tsReal = await tool(realToken.token, "opt_time_get_timesheet_status");
    check(
      "timesheet da conta real",
      !tsReal.isError,
      tsReal.text.split("\n")[0],
    );

    const entriesReal = await tool(
      realToken.token,
      "opt_time_list_time_entries",
      {
        from: formatLocalDate(new Date(Date.now() - 7 * 86_400_000)),
        to: today,
        limit: 50,
      },
    );
    check(
      "lançamentos recentes da conta real",
      !entriesReal.isError,
      `${entriesReal.data.count} na última semana`,
    );

    const writeAttempt = await tool(realToken.token, "opt_time_log_time", {
      projectId: "qualquer",
      durationMinutes: 1,
      description: "não deve gravar",
    });
    check(
      "token read-only da conta real não grava nada",
      writeAttempt.errorCode === "INSUFFICIENT_SCOPE",
      writeAttempt.errorCode ?? "",
    );

    const realEntriesAfter = await db.query.timeEntry.findMany({
      where: eq(timeEntry.userId, realAccount.id),
      columns: { id: true },
    });
    const realTimesheetsAfter = await db.query.timesheet.findMany({
      where: eq(timesheet.userId, realAccount.id),
      columns: { id: true, status: true },
    });
    check(
      "nenhum lançamento criado ou removido na conta real",
      realEntriesAfter.length === realEntriesBefore.length,
      `${realEntriesBefore.length} antes, ${realEntriesAfter.length} depois`,
    );
    check(
      "nenhum timesheet da conta real alterado",
      realTimesheetsAfter.length === realTimesheetsBefore.length &&
        realTimesheetsAfter.every(
          (t) =>
            realTimesheetsBefore.find((b) => b.id === t.id)?.status ===
            t.status,
        ),
      `${realTimesheetsBefore.length} timesheet(s) conferidos`,
    );

    const revoked = await revokeRealAccountTokens(realAccount.id);
    check(
      "tokens de teste da conta real removidos",
      revoked > 0,
      `${revoked} token(s)`,
    );
  }

  // ═══ 10. Resiliência de sessão ══════════════════════════════════════
  phase("10. Resiliência e observabilidade");

  const noAuth = await fetch(`${getBaseUrl()}/api/mcp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check("sem token responde 401", noAuth.status === 401, String(noAuth.status));
  check("401 traz WWW-Authenticate", !!noAuth.headers.get("www-authenticate"));

  const wrongScheme = await fetch(`${getBaseUrl()}/api/mcp`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from("a:b").toString("base64")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
  check(
    "esquema Basic é rejeitado",
    wrongScheme.status === 401,
    String(wrongScheme.status),
  );

  const noStore = await rest(alice.token, "");
  check(
    "respostas marcadas no-store",
    noStore.headers.get("cache-control")?.includes("no-store") === true,
    noStore.headers.get("cache-control") ?? "",
  );
  check("respostas trazem X-Request-Id", !!noStore.headers.get("x-request-id"));

  const errorBody = await tool(alice.token, "opt_time_log_time", {
    projectId: "inexistente-zzz",
    durationMinutes: 30,
    description: "x",
  });
  const serialized = JSON.stringify(errorBody.data);
  check(
    "erros não vazam SQL nem stack trace",
    !/SELECT |INSERT |at .*\.ts:\d+|node_modules/.test(serialized),
  );
  check("erros não vazam o token", !serialized.includes(alice.token));

  const manifest = await fetch(`${getBaseUrl()}/api/mcp/manifest`);
  const manifestBody = (await manifest.json()) as {
    counts?: { tools: number };
  };
  check(
    "manifesto público acessível sem auth",
    manifest.status === 200 && manifestBody.counts?.tools === 16,
  );
  const manifestText = JSON.stringify(manifestBody);
  check(
    "manifesto não vaza dados de usuário",
    !manifestText.includes("@optsolv.com.br"),
  );
}

async function run(): Promise<void> {
  let exitCode = 1;
  try {
    await main();
    exitCode = summary();
  } catch (error: unknown) {
    // A missing server is a setup mistake, not a crash — say so plainly
    // instead of dumping a stack trace the reader has to decode.
    if (isServerUnreachable(error)) {
      console.error(`\n❌ ${(error as Error).message}\n`);
    } else {
      console.error("\n💥 Erro fatal na suíte:", error);
    }
    exitCode = 1;
  } finally {
    phase("Limpeza");
    const result = await cleanup();
    check("todas as fixtures efêmeras removidas", result.ok, result.detail);
    if (!result.ok) exitCode = 1;
  }
  process.exit(exitCode);
}

void run();
