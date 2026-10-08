import { and, eq, isNull } from "drizzle-orm";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { getBackgroundMicrosoftToken } from "@/lib/collaboration/background-token";
import { db } from "@/lib/db";
import { timeEntry, timeSuggestionFeedback } from "@/lib/db/schema";
import { validateAgainstSchema } from "@/lib/mcp/json-schema";
import { fetchOutlookEvents } from "@/lib/microsoft-graph";
import {
  assertDayPlannable,
  buildDayPlanForUser,
} from "@/lib/time-assistant/day-plan";
import {
  shiftDay,
  startOfDayInstant,
  todayInAppTimeZone,
} from "@/lib/timezone";
import {
  check,
  info,
  makeProject,
  makeSessionCookie,
  makeToken,
  makeUser,
  phase,
  rest,
  revokeRealAccountTokens,
  rpc,
  skip,
  tool,
  warn,
  web,
} from "./harness";

/**
 * Phase 11 of the production-readiness suite: the corporate gateway the
 * desktop assistant (ISPer) talks to — agenda, assigned work items, day
 * suggestions and the atomic, idempotent apply.
 *
 * Writes only touch ephemeral fixtures. The real account is read from (its
 * Outlook, its Azure DevOps, its day plan) and verified untouched at the end.
 */

const NEW_TOOLS = [
  "opt_time_get_my_agenda",
  "opt_time_list_my_work_items",
  "opt_time_apply_suggestions",
] as const;

const TOOLS_WITH_OUTPUT_SCHEMA = [
  ...NEW_TOOLS,
  "opt_time_whoami",
  "opt_time_get_today_summary",
  "opt_time_suggest_daily_entries",
  "opt_time_log_time",
] as const;

interface ListedTool {
  name: string;
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
}

interface AgendaEventShape {
  id: string;
  start: string;
  end: string;
  durationMinutes: number;
  isAllDay: boolean;
}

interface SuggestionShape {
  id: string;
  source: string;
  projectId: string | null;
  durationMinutes: number;
  description: string;
}

function agendaEvents(data: Record<string, unknown>): AgendaEventShape[] {
  return (data.events ?? []) as AgendaEventShape[];
}

function suggestions(data: Record<string, unknown>): SuggestionShape[] {
  return (data.suggestions ?? []) as SuggestionShape[];
}

async function countEntries(userId: string, date: string): Promise<number> {
  const rows = await db.query.timeEntry.findMany({
    where: and(
      eq(timeEntry.userId, userId),
      eq(timeEntry.date, date),
      isNull(timeEntry.deletedAt),
    ),
    columns: { id: true },
  });
  return rows.length;
}

export async function runAssistantGatewayPhase(
  realAccount: { id: string; role: string } | undefined,
): Promise<void> {
  phase("11. Porta corporativa do assistente");

  const today = todayInAppTimeZone();
  const gateway = await makeUser("gateway", {
    scopes: ["time:read", "time:write", "calendar:read"],
  });
  const gatewayProject = await makeProject("gateway", [gateway.id]);
  const withoutCalendar = await makeToken(gateway.id, "no-calendar", [
    "time:read",
    "time:write",
  ]);

  // Weekday history is what feeds the "pattern" layer for an account that has
  // no Outlook and no Azure DevOps: two earlier weeks on the same weekday.
  const days = {
    apply: today,
    race: shiftDay(today, -1),
    atomic: shiftDay(today, -2),
    web: shiftDay(today, -3),
    log: shiftDay(today, -4),
  };
  for (const day of Object.values(days)) {
    for (const weeksBack of [7, 14]) {
      await db.insert(timeEntry).values({
        id: crypto.randomUUID(),
        userId: gateway.id,
        projectId: gatewayProject.id,
        description: "Desenvolvimento e testes",
        date: shiftDay(day, -weeksBack),
        duration: 240,
        billable: true,
        azdoSyncStatus: "none",
      });
    }
  }

  // ── 7. tools/list ────────────────────────────────────────────────────
  const listed = await rpc(gateway.token, "tools/list");
  const catalog = (listed.body.result?.tools ?? []) as ListedTool[];
  const byName = new Map(catalog.map((item) => [item.name, item]));

  for (const name of NEW_TOOLS) {
    check(`tools/list inclui ${name}`, byName.has(name));
  }

  const missingOutput = TOOLS_WITH_OUTPUT_SCHEMA.filter(
    (name) => byName.get(name)?.outputSchema?.type !== "object",
  );
  check(
    "ferramentas determinísticas publicam outputSchema",
    missingOutput.length === 0,
    missingOutput.join(", ") ||
      `${TOOLS_WITH_OUTPUT_SCHEMA.length} ferramentas`,
  );

  const agendaAnnotations = byName.get("opt_time_get_my_agenda")?.annotations;
  check(
    "agenda: readOnly + openWorld",
    agendaAnnotations?.readOnlyHint === true &&
      agendaAnnotations?.destructiveHint === false &&
      agendaAnnotations?.openWorldHint === true,
    JSON.stringify(agendaAnnotations),
  );
  const applyAnnotations = byName.get(
    "opt_time_apply_suggestions",
  )?.annotations;
  check(
    "apply: escrita idempotente e não destrutiva",
    applyAnnotations?.readOnlyHint === false &&
      applyAnnotations?.destructiveHint === false &&
      applyAnnotations?.idempotentHint === true &&
      applyAnnotations?.openWorldHint === false,
    JSON.stringify(applyAnnotations),
  );

  /** Validates real structuredContent against the schema a client would read. */
  function conforms(name: string, data: Record<string, unknown>): string[] {
    const schema = byName.get(name)?.outputSchema;
    return schema ? validateAgainstSchema(data, schema) : ["sem outputSchema"];
  }

  // ── Identity and day context for an account with nothing connected ────
  const who = await tool(gateway.token, "opt_time_whoami");
  check(
    "whoami: o que está conectado e o fuso",
    who.data.timezone === "America/Sao_Paulo" &&
      (who.data.microsoft as { connected?: boolean })?.connected === false &&
      (who.data.azureDevOps as { configured?: boolean })?.configured ===
        false &&
      who.data.eveningDigestEnabled === true,
    JSON.stringify({
      timezone: who.data.timezone,
      microsoft: who.data.microsoft,
      azureDevOps: who.data.azureDevOps,
    }),
  );
  check(
    "whoami valida contra o outputSchema",
    conforms("opt_time_whoami", who.data).length === 0,
    conforms("opt_time_whoami", who.data).join("; "),
  );

  const summary = await tool(gateway.token, "opt_time_get_today_summary");
  const isWeekend = [0, 6].includes(
    new Date(`${today}T12:00:00-03:00`).getDay(),
  );
  check(
    "resumo do dia traz isWorkday e targetMinutes",
    summary.data.isWorkday === !isWeekend &&
      summary.data.targetMinutes === (isWeekend ? 0 : 480),
    `isWorkday=${summary.data.isWorkday} target=${summary.data.targetMinutes}`,
  );
  check(
    "resumo do dia valida contra o outputSchema",
    conforms("opt_time_get_today_summary", summary.data).length === 0,
    conforms("opt_time_get_today_summary", summary.data).join("; "),
  );

  // ── Scope and Microsoft ───────────────────────────────────────────────
  const noScope = await tool(withoutCalendar.token, "opt_time_get_my_agenda");
  check(
    "agenda sem calendar:read → INSUFFICIENT_SCOPE",
    noScope.errorCode === "INSUFFICIENT_SCOPE" &&
      noScope.text.includes("calendar:read"),
    noScope.errorCode ?? "",
  );

  const noMicrosoft = await tool(gateway.token, "opt_time_get_my_agenda");
  check(
    "agenda sem conta Microsoft → MICROSOFT_NOT_CONNECTED",
    noMicrosoft.errorCode === "MICROSOFT_NOT_CONNECTED" &&
      noMicrosoft.text.includes("reconectar"),
    noMicrosoft.errorCode ?? "",
  );

  const badDays = await tool(gateway.token, "opt_time_get_my_agenda", {
    days: 9,
  });
  check(
    "days fora de 1–7 é recusado",
    badDays.errorCode === "VALIDATION_ERROR",
    badDays.errorCode ?? "",
  );

  const noAzure = await tool(gateway.token, "opt_time_list_my_work_items");
  check(
    "work items sem Azure DevOps → AZURE_DEVOPS_NOT_CONFIGURED",
    noAzure.errorCode === "AZURE_DEVOPS_NOT_CONFIGURED" &&
      noAzure.text.includes("Integrações"),
    noAzure.errorCode ?? "",
  );

  const restNoScope = await rest(withoutCalendar.token, "/agenda");
  check(
    "REST /agenda sem calendar:read → 403",
    restNoScope.status === 403,
    String(restNoScope.status),
  );
  const restNoAzure = await rest(gateway.token, "/work-items/assigned");
  check(
    "REST /work-items/assigned sem Azure → 412",
    restNoAzure.status === 412,
    String(restNoAzure.status),
  );
  const restBadApply = await rest(gateway.token, "/suggestions/apply", {
    method: "POST",
    body: JSON.stringify({ date: today, items: [{ suggestionId: "x" }] }),
  });
  check(
    "REST /suggestions/apply sem idempotencyKey → 400",
    restBadApply.status === 400,
    String(restBadApply.status),
  );

  // ── Suggestions without Outlook: the day is still planned ─────────────
  const suggest = await tool(gateway.token, "opt_time_suggest_daily_entries", {
    date: days.apply,
  });
  const planned = suggestions(suggest.data);
  const patternItem = planned.find((item) => item.source === "pattern");
  check(
    "sugestões funcionam sem Outlook e dizem isso",
    !suggest.isError &&
      (suggest.data.sources as { outlook?: boolean })?.outlook === false &&
      Boolean(patternItem) &&
      patternItem?.projectId === gatewayProject.id,
    suggest.isError
      ? suggest.text.slice(0, 120)
      : `${planned.length} sugestão(ões)`,
  );
  check(
    "sugestões validam contra o outputSchema",
    conforms("opt_time_suggest_daily_entries", suggest.data).length === 0,
    conforms("opt_time_suggest_daily_entries", suggest.data).join("; "),
  );

  const again = await tool(gateway.token, "opt_time_suggest_daily_entries", {
    date: days.apply,
  });
  check(
    "ids de sugestão estáveis entre duas chamadas",
    JSON.stringify(suggestions(again.data).map((item) => item.id)) ===
      JSON.stringify(planned.map((item) => item.id)),
  );

  const withoutCalendarSuggest = await tool(
    withoutCalendar.token,
    "opt_time_suggest_daily_entries",
    { date: days.apply },
  );
  check(
    "sugestões sem calendar:read avisam que o Outlook ficou de fora",
    !withoutCalendarSuggest.isError &&
      (withoutCalendarSuggest.data.sources as { outlook?: boolean })
        ?.outlook === false &&
      ((withoutCalendarSuggest.data.warnings ?? []) as string[]).some(
        (warning) => warning.includes("calendar:read"),
      ),
    withoutCalendarSuggest.isError
      ? withoutCalendarSuggest.text.slice(0, 120)
      : "",
  );

  const futureSuggest = await tool(
    gateway.token,
    "opt_time_suggest_daily_entries",
    { date: shiftDay(today, 3) },
  );
  check(
    "sugestão para dia futuro é recusada",
    futureSuggest.errorCode === "VALIDATION_ERROR",
    futureSuggest.errorCode ?? "",
  );

  // ── 10. apply: once per key ───────────────────────────────────────────
  if (patternItem) {
    const key = crypto.randomUUID();
    const request = {
      date: days.apply,
      idempotencyKey: key,
      items: [
        {
          suggestionId: patternItem.id,
          durationMinutes: 240,
          description: "Teste e2e do assistente",
        },
      ],
      rejectedSuggestionIds: [] as string[],
    };

    const first = await tool(
      gateway.token,
      "opt_time_apply_suggestions",
      request,
    );
    const second = await tool(
      gateway.token,
      "opt_time_apply_suggestions",
      request,
    );

    const firstIds = (first.data.createdEntryIds ?? []) as string[];
    const secondIds = (second.data.createdEntryIds ?? []) as string[];

    check(
      "apply cria o lançamento e informa o total do dia",
      !first.isError &&
        firstIds.length === 1 &&
        first.data.replayed === false &&
        first.data.dayTotalMinutes === 240 &&
        first.data.dailyCapacityMinutes === 480 &&
        first.data.remainingMinutes === 240,
      first.isError ? first.text.slice(0, 160) : JSON.stringify(first.data),
    );
    check(
      "mesma chave duas vezes cria uma vez só",
      !second.isError &&
        second.data.replayed === true &&
        JSON.stringify(secondIds) === JSON.stringify(firstIds) &&
        (await countEntries(gateway.id, days.apply)) === 1,
      `${await countEntries(gateway.id, days.apply)} lançamento(s) no dia`,
    );
    check(
      "apply valida contra o outputSchema",
      conforms("opt_time_apply_suggestions", first.data).length === 0 &&
        conforms("opt_time_apply_suggestions", second.data).length === 0,
      conforms("opt_time_apply_suggestions", first.data).join("; "),
    );

    const conflict = await tool(gateway.token, "opt_time_apply_suggestions", {
      ...request,
      items: [{ suggestionId: patternItem.id, durationMinutes: 120 }],
    });
    check(
      "mesma chave com entrada diferente → IDEMPOTENCY_CONFLICT",
      conflict.errorCode === "IDEMPOTENCY_CONFLICT",
      conflict.errorCode ?? "",
    );

    const feedback = await db.query.timeSuggestionFeedback.findMany({
      where: and(
        eq(timeSuggestionFeedback.userId, gateway.id),
        eq(timeSuggestionFeedback.date, days.apply),
      ),
    });
    const breakdown = feedback[0]?.sourceBreakdown ?? "";
    check(
      "feedback gravado como 'edited', com a origem agente",
      feedback.length === 1 &&
        feedback[0]?.action === "edited" &&
        (feedback[0]?.editedFields ?? "").includes("minutes") &&
        breakdown.includes('"agent":true'),
      `${feedback.length} linha(s), ação ${feedback[0]?.action}`,
    );

    // Concurrency: two simultaneous calls with the same new key.
    const raceSuggest = await tool(
      gateway.token,
      "opt_time_suggest_daily_entries",
      { date: days.race },
    );
    const raceItem = suggestions(raceSuggest.data).find(
      (item) => item.source === "pattern",
    );
    if (raceItem) {
      const raceRequest = {
        date: days.race,
        idempotencyKey: crypto.randomUUID(),
        items: [{ suggestionId: raceItem.id, durationMinutes: 120 }],
      };
      const [a, b] = await Promise.all([
        tool(gateway.token, "opt_time_apply_suggestions", raceRequest),
        tool(gateway.token, "opt_time_apply_suggestions", raceRequest),
      ]);
      const replays = [a, b].filter((call) => call.data.replayed === true);
      check(
        "duas chamadas simultâneas com a mesma chave gravam uma vez",
        !a.isError &&
          !b.isError &&
          replays.length === 1 &&
          (await countEntries(gateway.id, days.race)) === 1,
        `${await countEntries(gateway.id, days.race)} lançamento(s); replays=${replays.length}`,
      );
    } else {
      warn("sem sugestão de padrão no dia da corrida");
    }

    // Atomicity: an invalid item must leave nothing behind.
    const atomicSuggest = await tool(
      gateway.token,
      "opt_time_suggest_daily_entries",
      { date: days.atomic },
    );
    const atomicItem = suggestions(atomicSuggest.data).find(
      (item) => item.source === "pattern",
    );
    if (atomicItem) {
      const broken = await tool(gateway.token, "opt_time_apply_suggestions", {
        date: days.atomic,
        idempotencyKey: crypto.randomUUID(),
        items: [
          { suggestionId: atomicItem.id },
          { suggestionId: "sg_0000000000000000" },
        ],
      });
      check(
        "item inválido: erro nomeia o item e nada é gravado",
        broken.errorCode === "NOT_FOUND" &&
          broken.text.includes("Item 2") &&
          (await countEntries(gateway.id, days.atomic)) === 0,
        `${broken.errorCode} · ${await countEntries(gateway.id, days.atomic)} lançamento(s)`,
      );

      const tooLong = await tool(gateway.token, "opt_time_apply_suggestions", {
        date: days.atomic,
        idempotencyKey: crypto.randomUUID(),
        items: [{ suggestionId: atomicItem.id, durationMinutes: 3 }],
      });
      check(
        "duração abaixo do mínimo é recusada",
        tooLong.errorCode === "VALIDATION_ERROR" &&
          (await countEntries(gateway.id, days.atomic)) === 0,
        tooLong.errorCode ?? "",
      );

      // The key of a failed attempt stays usable.
      const retryKey = crypto.randomUUID();
      const failed = await tool(gateway.token, "opt_time_apply_suggestions", {
        date: days.atomic,
        idempotencyKey: retryKey,
        items: [{ suggestionId: "sg_1111111111111111" }],
      });
      const retried = await tool(gateway.token, "opt_time_apply_suggestions", {
        date: days.atomic,
        idempotencyKey: retryKey,
        items: [{ suggestionId: atomicItem.id, durationMinutes: 60 }],
      });
      check(
        "chave de uma tentativa que falhou continua utilizável",
        failed.isError && !retried.isError && retried.data.replayed === false,
        retried.isError ? retried.text.slice(0, 120) : "",
      );
    }
  } else {
    skip("apply e idempotência", "nenhuma sugestão de padrão para o dia");
  }

  // ── log_time idempotency (P1) ─────────────────────────────────────────
  const logKey = crypto.randomUUID();
  const logInput = {
    projectId: gatewayProject.code,
    durationMinutes: 30,
    description: "Lançamento idempotente",
    date: days.log,
    idempotencyKey: logKey,
  };
  const logFirst = await tool(gateway.token, "opt_time_log_time", logInput);
  const logSecond = await tool(gateway.token, "opt_time_log_time", logInput);
  check(
    "log_time com a mesma chave cria um lançamento só",
    !logFirst.isError &&
      !logSecond.isError &&
      logSecond.data.replayed === true &&
      (logFirst.data.entry as { id?: string })?.id ===
        (logSecond.data.entry as { id?: string })?.id &&
      (await countEntries(gateway.id, days.log)) === 1,
    `${await countEntries(gateway.id, days.log)} lançamento(s)`,
  );
  check(
    "log_time valida contra o outputSchema",
    conforms("opt_time_log_time", logFirst.data).length === 0,
    conforms("opt_time_log_time", logFirst.data).join("; "),
  );
  const logConflict = await tool(gateway.token, "opt_time_log_time", {
    ...logInput,
    durationMinutes: 45,
  });
  check(
    "log_time: mesma chave com dados diferentes → IDEMPOTENCY_CONFLICT",
    logConflict.errorCode === "IDEMPOTENCY_CONFLICT",
    logConflict.errorCode ?? "",
  );

  const restKey = crypto.randomUUID();
  const restBody = JSON.stringify({
    projectId: gatewayProject.code,
    durationMinutes: 20,
    description: "REST idempotente",
    date: days.log,
    idempotencyKey: restKey,
  });
  const restFirst = await rest(gateway.token, "/time-entries", {
    method: "POST",
    body: restBody,
  });
  const restSecond = await rest(gateway.token, "/time-entries", {
    method: "POST",
    body: restBody,
  });
  check(
    "REST POST /time-entries repetido não duplica",
    restFirst.status === 201 &&
      restSecond.status === 201 &&
      restSecond.body.replayed === true &&
      (await countEntries(gateway.id, days.log)) === 2,
    `${await countEntries(gateway.id, days.log)} lançamento(s) no dia`,
  );

  // ── The web routes still work after the shared-service refactor ───────
  const cookie = await makeSessionCookie(gateway.id);
  const reconstruct = await web(cookie, "/api/time-suggestions/reconstruct", {
    method: "POST",
    body: JSON.stringify({ date: days.web }),
  });
  const webPlan = (reconstruct.body.plan ?? {}) as {
    items?: Array<{
      id: string;
      projectId: string | null;
      description: string;
      minutes: number;
      billable: boolean;
      source: string;
      sourceId?: string;
    }>;
  };
  const webItems = webPlan.items ?? [];
  check(
    "rota web 'Preencher meu dia' responde com ids estáveis",
    reconstruct.status === 200 &&
      webItems.length > 0 &&
      webItems.every((item) => /^sg_[0-9a-f]{16}/.test(item.id)),
    `${reconstruct.status} · ${webItems.length} item(ns)`,
  );

  const mcpForWeb = await tool(
    gateway.token,
    "opt_time_suggest_daily_entries",
    {
      date: days.web,
    },
  );
  check(
    "web e MCP enxergam os mesmos ids para o mesmo dia",
    JSON.stringify(webItems.map((item) => item.id).sort()) ===
      JSON.stringify(
        suggestions(mcpForWeb.data)
          .map((item) => item.id)
          .sort(),
      ),
  );

  const webFuture = await web(cookie, "/api/time-suggestions/reconstruct", {
    method: "POST",
    body: JSON.stringify({ date: shiftDay(today, 2) }),
  });
  check(
    "rota web recusa dia futuro com 400",
    webFuture.status === 400,
    String(webFuture.status),
  );

  const webFirst = webItems.find((item) => item.projectId);
  if (webFirst?.projectId) {
    const applied = await web(
      cookie,
      "/api/time-suggestions/reconstruct/apply",
      {
        method: "POST",
        body: JSON.stringify({
          date: days.web,
          items: [
            {
              projectId: webFirst.projectId,
              description: webFirst.description,
              minutes: webFirst.minutes,
              billable: webFirst.billable,
              source: webFirst.source,
              sourceId: webFirst.sourceId,
            },
          ],
        }),
      },
    );
    check(
      "rota web de aplicar grava pelo mesmo núcleo",
      applied.status === 201 &&
        applied.body.created === 1 &&
        (await countEntries(gateway.id, days.web)) === 1,
      `${applied.status} · ${await countEntries(gateway.id, days.web)} lançamento(s)`,
    );
  }

  // ── Real account: read-only parity with Outlook, Azure and the web ────
  if (!realAccount) {
    skip("agenda, sugestões e work items reais", "conta real ausente");
    return;
  }

  const entriesBefore = (
    await db.query.timeEntry.findMany({
      where: eq(timeEntry.userId, realAccount.id),
      columns: { id: true },
    })
  ).length;

  const real = await makeToken(realAccount.id, "gateway", [
    "time:read",
    "calendar:read",
  ]);

  const realWho = await tool(real.token, "opt_time_whoami");
  info(
    `conta real → Microsoft: ${JSON.stringify(realWho.data.microsoft)} · Azure DevOps: ${JSON.stringify(realWho.data.azureDevOps)}`,
  );

  const graphToken = await getBackgroundMicrosoftToken(realAccount.id);

  if (!graphToken) {
    const unlinked = await tool(real.token, "opt_time_get_my_agenda");
    check(
      "conta real sem token do Graph → MICROSOFT_NOT_CONNECTED",
      unlinked.errorCode === "MICROSOFT_NOT_CONNECTED",
      unlinked.errorCode ?? "",
    );
    skip("agenda real × Outlook", "a conta real não tem token do Graph");
  } else {
    const agenda = await tool(real.token, "opt_time_get_my_agenda", {
      date: today,
    });
    check(
      "agenda real responde",
      !agenda.isError,
      agenda.isError ? agenda.text.slice(0, 160) : agenda.text.split("\n")[0],
    );
    check(
      "agenda real valida contra o outputSchema",
      conforms("opt_time_get_my_agenda", agenda.data).length === 0,
      conforms("opt_time_get_my_agenda", agenda.data).join("; "),
    );

    // Ground truth straight from Graph, with the same window and filters.
    const rangeStart = startOfDayInstant(today, "America/Sao_Paulo");
    const rangeEnd = startOfDayInstant(shiftDay(today, 1), "America/Sao_Paulo");
    const outlook = await fetchOutlookEvents(
      graphToken,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      { includeExcluded: true },
    );
    const expected = outlook
      .filter(
        (event) =>
          !event.isCancelled &&
          event.responseStatus?.response?.toLowerCase() !== "declined",
      )
      .map((event) => event.id)
      .sort();
    const received = agendaEvents(agenda.data)
      .map((event) => event.id)
      .sort();

    check(
      "agenda de hoje bate com os eventos não cancelados do Outlook",
      JSON.stringify(expected) === JSON.stringify(received),
      `Outlook: ${expected.length} · MCP: ${received.length}`,
    );
    check(
      "datas da agenda saem com offset e em ordem",
      agendaEvents(agenda.data).every((event) =>
        /[+-]\d{2}:\d{2}$/.test(event.start),
      ) &&
        agendaEvents(agenda.data).every(
          (event, index, list) =>
            index === 0 || (list[index - 1]?.start ?? "") <= event.start,
        ),
    );
    check(
      "duração = fim − início",
      agendaEvents(agenda.data).every(
        (event) =>
          Math.round(
            (new Date(event.end).getTime() - new Date(event.start).getTime()) /
              60_000,
          ) === event.durationMinutes,
      ),
    );

    const week = await tool(real.token, "opt_time_get_my_agenda", {
      date: today,
      days: 7,
      includeDescription: true,
    });
    check(
      "agenda de 7 dias com descrição responde e valida",
      !week.isError &&
        conforms("opt_time_get_my_agenda", week.data).length === 0,
      `${agendaEvents(week.data).length} evento(s)`,
    );
  }

  // The day plan: MCP versus the engine the web route calls. Without a Graph
  // token both degrade the same way (no calendar, no calls), which is itself
  // part of what is verified.
  let planDay = today;
  let plannable = false;
  for (let back = 0; back < 7 && !plannable; back += 1) {
    planDay = shiftDay(today, -back);
    try {
      await assertDayPlannable(realAccount.id, planDay);
      plannable = true;
    } catch {
      plannable = false;
    }
  }

  if (!plannable) {
    skip("sugestões reais × Preencher meu dia", "nenhum dia livre de bloqueio");
  } else {
    const webPlanReal = await buildDayPlanForUser({
      userId: realAccount.id,
      date: planDay,
      microsoftAccessToken: graphToken,
      polish: false,
    });
    const mcpReal = await tool(real.token, "opt_time_suggest_daily_entries", {
      date: planDay,
    });
    const fromWeb = webPlanReal.items
      .map((item) => `${item.id}|${item.projectId}|${item.minutes}`)
      .sort();
    const fromMcp = suggestions(mcpReal.data)
      .map((item) => `${item.id}|${item.projectId}|${item.durationMinutes}`)
      .sort();

    check(
      `sugestões do MCP = 'Preencher meu dia' da web (${planDay})`,
      !mcpReal.isError && JSON.stringify(fromWeb) === JSON.stringify(fromMcp),
      `web: ${fromWeb.length} · MCP: ${fromMcp.length}`,
    );
    check(
      "sugestões reais validam contra o outputSchema",
      conforms("opt_time_suggest_daily_entries", mcpReal.data).length === 0,
      conforms("opt_time_suggest_daily_entries", mcpReal.data).join("; "),
    );
    info(
      `fontes: ${JSON.stringify((mcpReal.data as { sources?: unknown }).sources)}`,
    );
  }

  // Assigned work items, cross-checked against OptTime's own ledger.
  const azure = await findAzureDevopsConfigByUserId(realAccount.id);
  if (!azure) {
    skip("work items reais", "a conta real não tem Azure DevOps configurado");
  } else {
    const open = await tool(real.token, "opt_time_list_my_work_items", {
      top: 100,
    });
    check(
      "work items atribuídos respondem",
      !open.isError,
      open.isError ? open.text.slice(0, 160) : open.text.split("\n")[0],
    );
    check(
      "work items validam contra o outputSchema",
      conforms("opt_time_list_my_work_items", open.data).length === 0,
      conforms("opt_time_list_my_work_items", open.data).join("; "),
    );

    const items = (open.data.items ?? []) as Array<{
      id: number;
      state: string;
      changedAt: string;
      url: string;
      loggedMinutesInOptTime: number;
    }>;
    check(
      "abertos: sem fechados/cancelados, sem repetidos, mais recente primeiro",
      items.every(
        (item) =>
          !["Closed", "Done", "Completed", "Cancelad", "Removed"].includes(
            item.state,
          ),
      ) &&
        new Set(items.map((item) => item.id)).size === items.length &&
        items.every(
          (item, index) =>
            index === 0 ||
            (items[index - 1]?.changedAt ?? "") >= item.changedAt,
        ),
      `${items.length} item(ns)`,
    );

    const ledger = await db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.userId, realAccount.id),
        isNull(timeEntry.deletedAt),
      ),
      columns: { azureWorkItemId: true, duration: true },
    });
    const mismatches = items.filter((item) => {
      const sum = ledger
        .filter((row) => row.azureWorkItemId === item.id)
        .reduce((total, row) => total + row.duration, 0);
      return sum !== item.loggedMinutesInOptTime;
    });
    check(
      "minutos lançados por work item batem com o banco",
      mismatches.length === 0,
      mismatches.length === 0
        ? `${items.length} item(ns) conferidos`
        : `divergem: ${mismatches.map((item) => item.id).join(", ")}`,
    );

    const withClosed = await tool(real.token, "opt_time_list_my_work_items", {
      includeClosed: true,
      top: 100,
    });
    const closedIds = new Set(
      ((withClosed.data.items ?? []) as Array<{ id: number }>).map(
        (item) => item.id,
      ),
    );
    check(
      "includeClosed devolve os abertos e mais",
      !withClosed.isError &&
        (closedIds.size >= 100 ||
          items.every((item) => closedIds.has(item.id))),
      `${items.length} abertos · ${closedIds.size} com fechados`,
    );
  }

  // The real account is only ever read.
  const entriesAfter = (
    await db.query.timeEntry.findMany({
      where: eq(timeEntry.userId, realAccount.id),
      columns: { id: true },
    })
  ).length;
  check(
    "nenhum lançamento criado na conta real",
    entriesAfter === entriesBefore,
    `${entriesBefore} antes, ${entriesAfter} depois`,
  );
  const revoked = await revokeRealAccountTokens(realAccount.id);
  check("token de teste da conta real removido", revoked > 0, `${revoked}`);
}
