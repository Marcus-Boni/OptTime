/**
 * Offline checks for the assistant gateway (agenda, work items, suggestions,
 * apply, idempotency, output schemas).
 *
 * Runs without network, Microsoft or a database: every collaborator the
 * services need is injected with fixtures, so what is verified is the logic
 * that decides what an assistant sees and what gets written.
 *
 *   pnpm verify:assistant-gateway
 */

process.env.DATABASE_URL ??= "postgres://verify:verify@localhost:5432/verify";
process.env.APP_TIMEZONE ??= "America/Sao_Paulo";

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function main(): Promise<void> {
  const { AgentError } = await import("@/lib/mcp/errors");
  const { callTool, describeTools, TOOLS } = await import("@/lib/mcp/tools");
  const { validateAgainstSchema } = await import("@/lib/mcp/json-schema");
  const {
    AGENDA_OUTPUT_SCHEMA,
    APPLY_SUGGESTIONS_OUTPUT_SCHEMA,
    LOG_TIME_OUTPUT_SCHEMA,
    MY_WORK_ITEMS_OUTPUT_SCHEMA,
    SUGGEST_OUTPUT_SCHEMA,
    TODAY_SUMMARY_OUTPUT_SCHEMA,
    WHOAMI_OUTPUT_SCHEMA,
  } = await import("@/lib/mcp/output-schemas");
  const { clearAgendaCache, getMyAgenda } = await import(
    "@/lib/mcp/service/agenda"
  );
  const { mapAgendaEvents, formatAgendaLine } = await import(
    "@/lib/mcp/service/agenda-mapping"
  );
  const { requireAgentMicrosoftToken } = await import(
    "@/lib/mcp/service/microsoft"
  );
  const { listMyWorkItems } = await import("@/lib/mcp/service/work-items");
  const { buildSuggestResult, suggestDailyEntries } = await import(
    "@/lib/mcp/service/suggestions"
  );
  const { applySuggestions, rejectionFingerprint } = await import(
    "@/lib/mcp/service/apply-suggestions"
  );
  const { buildWhoamiData } = await import("@/lib/mcp/service/identity");
  const { ALWAYS_ON_AWAY_WARNING, resolveDayContext } = await import(
    "@/lib/mcp/service/day-context"
  );
  const {
    hashIdempotencyInput,
    parseIdempotencyKey,
    runIdempotent,
    IDEMPOTENCY_TTL_MS,
  } = await import("@/lib/mcp/idempotency");
  const { buildDeterministicDayPlan } = await import(
    "@/lib/time-assistant/reconstruct"
  );
  const { buildCommitSessions } = await import(
    "@/lib/time-assistant/commit-sessions"
  );
  const { formatInstantWithOffset, startOfDayInstant } = await import(
    "@/lib/timezone"
  );
  const { API_TOKEN_PRESETS, API_TOKEN_SCOPES, BASE_TOKEN_SCOPES } =
    await import("@/lib/api-tokens.shared");

  const { getBackgroundMicrosoftToken } = await import(
    "@/lib/collaboration/background-token"
  );
  const {
    pickMicrosoftAccount,
    planDuplicateCleanup,
    rankMicrosoftAccounts,
    STALE_ACCOUNT_DAYS,
  } = await import("@/lib/microsoft-account-selection");
  const {
    MicrosoftRefreshError,
    parseAadstsCode,
    refreshMicrosoftAccessToken,
  } = await import("@/lib/microsoft-oauth");
  const { getMicrosoftConnectionStatus } = await import(
    "@/lib/mcp/service/microsoft"
  );

  type BackgroundAccountRow =
    import("@/lib/collaboration/background-token").BackgroundAccountRow;
  type BackgroundTokenDeps =
    import("@/lib/collaboration/background-token").BackgroundTokenDeps;
  type MicrosoftAccountRow =
    import("@/lib/microsoft-account-selection").MicrosoftAccountRow;
  type Principal = import("@/lib/mcp/auth").AgentPrincipal;
  type OutlookEvent = import("@/lib/microsoft-graph").OutlookEvent;
  type DayPlan = import("@/types/reconstruct").DayPlan;
  type ToolDefinition = import("@/lib/mcp/tools").ToolDefinition;

  let passed = 0;
  async function check(
    name: string,
    run: () => void | Promise<void>,
  ): Promise<void> {
    try {
      await run();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      console.error(`  ✗ ${name}`);
      throw error;
    }
  }

  function principal(scopes: Principal["scopes"]): Principal {
    return {
      userId: "user-1",
      name: "Marcus Teste",
      email: "marcus@optsolv.com.br",
      role: "member",
      scopes,
      tokenId: "tok-1",
      tokenName: "ISPer",
      legacy: false,
    };
  }

  const ISPER_SCOPES = ["time:read", "time:write", "calendar:read"] as const;
  const me = principal([...ISPER_SCOPES]);

  // ─── Fixtures ──────────────────────────────────────────────────────────

  const projects = [
    {
      id: "p-portal",
      name: "Portal do Cliente",
      code: "PORT-01",
      clientName: "Perfil",
      color: "#f97316",
      billable: true,
      azureProjectId: "Portal do Cliente",
      status: "active",
      azureProjectName: "Portal do Cliente",
    },
    {
      id: "p-gestao",
      name: "Gestão de Projetos",
      code: "GP-03",
      clientName: "OptSolv",
      color: "#22c55e",
      billable: false,
      azureProjectId: null,
      status: "active",
      azureProjectName: null,
    },
  ];

  function graphEvent(overrides: Partial<OutlookEvent>): OutlookEvent {
    return {
      id: "evt-default",
      subject: "Reunião",
      // Graph answers in UTC with seven fractional digits and no suffix.
      start: { dateTime: "2026-10-07T17:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-10-07T18:30:00.0000000", timeZone: "UTC" },
      isAllDay: false,
      isCancelled: false,
      categories: [],
      webLink: "https://outlook.office.com/calendar/item/evt",
      isOrganizer: false,
      responseStatus: { response: "accepted" },
      showAs: "busy",
      sensitivity: "normal",
      type: "singleInstance",
      isOnlineMeeting: true,
      onlineMeeting: { joinUrl: "https://teams.microsoft.com/l/meetup-join/x" },
      onlineMeetingProvider: "teamsForBusiness",
      organizer: {
        emailAddress: { name: "Ana", address: "ana@optsolv.com.br" },
      },
      attendees: [
        {
          type: "required",
          status: { response: "accepted" },
          emailAddress: { name: "Marcus", address: "marcus@optsolv.com.br" },
        },
      ],
      iCalUId: "ical-default",
      location: { displayName: "Sala 3" },
      ...overrides,
    };
  }

  const graphEvents: OutlookEvent[] = [
    graphEvent({
      id: "evt-planning",
      iCalUId: "ical-planning",
      subject: "Planning Portal do Cliente",
    }),
    graphEvent({
      id: "evt-cancelled",
      subject: "Reunião cancelada",
      isCancelled: true,
    }),
    graphEvent({
      id: "evt-declined",
      subject: "Reunião recusada",
      responseStatus: { response: "declined" },
    }),
    // All-day event as a floating UTC midnight.
    graphEvent({
      id: "evt-holiday-floating",
      subject: "Feriado",
      isAllDay: true,
      start: { dateTime: "2026-10-08T00:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-10-09T00:00:00.0000000", timeZone: "UTC" },
      isOnlineMeeting: false,
      onlineMeeting: null,
      onlineMeetingProvider: null,
      showAs: "free",
    }),
    // All-day event already anchored at São Paulo midnight.
    graphEvent({
      id: "evt-vacation-anchored",
      subject: "Férias",
      isAllDay: true,
      location: null,
      responseStatus: { response: "none" },
      start: { dateTime: "2026-10-09T03:00:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-10-10T03:00:00.0000000", timeZone: "UTC" },
      isOnlineMeeting: false,
      onlineMeeting: null,
      onlineMeetingProvider: null,
    }),
    graphEvent({
      id: "evt-daily",
      subject: "Daily do time",
      start: { dateTime: "2026-10-07T12:15:00.0000000", timeZone: "UTC" },
      end: { dateTime: "2026-10-07T12:30:00.0000000", timeZone: "UTC" },
      type: "occurrence",
      seriesMasterId: "series-daily",
      iCalUId: "ical-daily",
      body: {
        contentType: "html",
        content: "<p>Pauta&nbsp;do dia</p><br/><script>x()</script>",
      },
    }),
  ];

  // ─── 1. Time zone, all-day, cancelled ──────────────────────────────────

  console.log("\n1. Fuso, dia inteiro e cancelados");

  await check("UTC vira -03:00 e a duração fica certa", () => {
    const events = mapAgendaEvents({
      events: graphEvents,
      timeZone: "America/Sao_Paulo",
      projects,
      entries: [],
      userEmail: "marcus@optsolv.com.br",
      internalDomain: "@optsolv.com.br",
      includeDeclined: false,
      includeDescription: false,
    });

    const planning = events.find((event) => event.id === "evt-planning");
    assert.ok(planning, "planning event is present");
    assert.equal(planning.start, "2026-10-07T14:00:00-03:00");
    assert.equal(planning.end, "2026-10-07T15:30:00-03:00");
    assert.equal(planning.durationMinutes, 90);
    assert.equal(planning.iCalUId, "ical-planning");
    assert.equal(planning.location, "Sala 3");
    assert.equal(planning.isOnline, true);
    assert.equal(planning.responseStatus, "accepted");

    for (const event of events) {
      assert.match(
        event.start,
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}-03:00$/,
        `${event.id} start carries the offset`,
      );
    }
  });

  await check(
    "evento de dia inteiro é mantido, nos dois formatos do Graph",
    () => {
      const events = mapAgendaEvents({
        events: graphEvents,
        timeZone: "America/Sao_Paulo",
        projects,
        entries: [],
        userEmail: null,
        internalDomain: "@optsolv.com.br",
        includeDeclined: false,
        includeDescription: false,
      });

      const floating = events.find(
        (event) => event.id === "evt-holiday-floating",
      );
      const anchored = events.find(
        (event) => event.id === "evt-vacation-anchored",
      );
      assert.ok(floating && anchored, "both all-day events are kept");

      assert.equal(floating.isAllDay, true);
      assert.equal(floating.start, "2026-10-08T00:00:00-03:00");
      assert.equal(floating.end, "2026-10-09T00:00:00-03:00");
      assert.equal(floating.durationMinutes, 1440);

      assert.equal(anchored.start, "2026-10-09T00:00:00-03:00");
      assert.equal(anchored.end, "2026-10-10T00:00:00-03:00");
      assert.equal(
        formatAgendaLine(anchored),
        "Dia inteiro Férias",
        "all-day lines have no clock",
      );
    },
  );

  await check("cancelado sai; recusado só entra com includeDeclined", () => {
    const base = {
      events: graphEvents,
      timeZone: "America/Sao_Paulo",
      projects,
      entries: [],
      userEmail: null,
      internalDomain: "@optsolv.com.br",
      includeDescription: false,
    };
    const without = mapAgendaEvents({ ...base, includeDeclined: false });
    const withDeclined = mapAgendaEvents({ ...base, includeDeclined: true });

    assert.ok(!without.some((event) => event.id === "evt-cancelled"));
    assert.ok(!without.some((event) => event.id === "evt-declined"));
    assert.ok(withDeclined.some((event) => event.id === "evt-declined"));
    assert.ok(!withDeclined.some((event) => event.id === "evt-cancelled"));
  });

  await check("ordena por início e formata a linha em pt-BR", () => {
    const events = mapAgendaEvents({
      events: graphEvents,
      timeZone: "America/Sao_Paulo",
      projects,
      entries: [],
      userEmail: null,
      internalDomain: "@optsolv.com.br",
      includeDeclined: false,
      includeDescription: false,
    });

    const starts = events.map((event) => event.start);
    assert.deepEqual(starts, [...starts].sort());

    const daily = events.find((event) => event.id === "evt-daily");
    assert.ok(daily);
    assert.equal(
      formatAgendaLine(daily),
      "09:15–09:30 Daily do time (Teams, aceita)",
    );
    assert.equal(daily.type, "occurrence");
    assert.equal(daily.seriesMasterId, "series-daily");
  });

  await check(
    "descrição só com includeDescription, em texto puro e cortada",
    () => {
      const base = {
        events: graphEvents,
        timeZone: "America/Sao_Paulo",
        projects,
        entries: [],
        userEmail: null,
        internalDomain: "@optsolv.com.br",
        includeDeclined: false,
      };
      const off = mapAgendaEvents({ ...base, includeDescription: false });
      const on = mapAgendaEvents({ ...base, includeDescription: true });

      assert.equal(
        off.find((event) => event.id === "evt-daily")?.description,
        null,
      );
      const description = on.find(
        (event) => event.id === "evt-daily",
      )?.description;
      assert.ok(description?.includes("Pauta do dia"));
      assert.ok(!description?.includes("<"), "no HTML tags");
      assert.ok(!description?.includes("x()"), "scripts are dropped");

      const long = mapAgendaEvents({
        ...base,
        includeDescription: true,
        events: [
          graphEvent({
            id: "evt-long",
            body: { contentType: "text", content: "a".repeat(900) },
          }),
        ],
      });
      assert.equal(long[0]?.description?.length, 500);
    },
  );

  await check(
    "suggestedProject usa o mesmo casamento do 'Preencher meu dia'",
    () => {
      const events = mapAgendaEvents({
        events: graphEvents,
        timeZone: "America/Sao_Paulo",
        projects,
        entries: [],
        userEmail: null,
        internalDomain: "@optsolv.com.br",
        includeDeclined: false,
        includeDescription: false,
      });

      assert.deepEqual(
        events.find((event) => event.id === "evt-planning")?.suggestedProject,
        { id: "p-portal", code: "PORT-01", name: "Portal do Cliente" },
      );
      assert.equal(
        events.find((event) => event.id === "evt-daily")?.suggestedProject,
        null,
        "a subject that names no project proposes none",
      );
    },
  );

  await check("loggedMinutes soma o que já foi lançado para o evento", () => {
    const events = mapAgendaEvents({
      events: graphEvents,
      timeZone: "America/Sao_Paulo",
      projects,
      entries: [
        { date: "2026-10-07", description: "Daily do time", duration: 15 },
        {
          date: "2026-10-06",
          description: "Planning Portal do Cliente",
          duration: 90,
        },
      ],
      userEmail: "marcus@optsolv.com.br",
      internalDomain: "@optsolv.com.br",
      includeDeclined: false,
      includeDescription: false,
    });

    assert.equal(
      events.find((event) => event.id === "evt-daily")?.loggedMinutes,
      15,
    );
    assert.equal(
      events.find((event) => event.id === "evt-planning")?.loggedMinutes,
      0,
      "an entry on another day does not count",
    );
  });

  await check("attendance: presença medida no Teams, null sem registro", () => {
    // The daily (09:15–09:30 BRT) has a call record of 18 minutes; nothing else does.
    const joinUrl = "https://teams.microsoft.com/l/meetup-join/x";
    const events = mapAgendaEvents({
      events: graphEvents,
      timeZone: "America/Sao_Paulo",
      projects,
      entries: [],
      userEmail: "marcus@optsolv.com.br",
      internalDomain: "@optsolv.com.br",
      includeDeclined: false,
      includeDescription: false,
      calls: [
        {
          id: "call-daily",
          startIso: "2026-10-07T12:16:00Z",
          endIso: "2026-10-07T12:34:00Z",
          minutes: 18,
          otherParticipantName: "Time",
          callerName: "Ana",
          calleeName: null,
          callType: "groupCall",
          mediaTypes: ["audio"],
          joinWebUrl: joinUrl,
        },
      ],
    });

    const daily = events.find((event) => event.id === "evt-daily");
    assert.deepEqual(daily?.attendance, { joined: true, minutes: 18 });
    assert.equal(
      events.find((event) => event.id === "evt-holiday-floating")?.attendance,
      null,
      "an event no record matches has no presence, not 'absent'",
    );

    const withoutRecords = mapAgendaEvents({
      events: graphEvents,
      timeZone: "America/Sao_Paulo",
      projects,
      entries: [],
      userEmail: null,
      internalDomain: "@optsolv.com.br",
      includeDeclined: false,
      includeDescription: false,
      calls: null,
    });
    assert.ok(
      withoutRecords.every((event) => event.attendance === null),
      "unreadable call records leave every attendance null",
    );
  });

  await check("helpers de fuso: offset, meia-noite local e DST", () => {
    assert.equal(
      formatInstantWithOffset("2026-10-07T17:00:00Z", "America/Sao_Paulo"),
      "2026-10-07T14:00:00-03:00",
    );
    assert.equal(
      formatInstantWithOffset("2026-01-15T03:30:00Z", "Asia/Kolkata"),
      "2026-01-15T09:00:00+05:30",
    );
    assert.equal(
      startOfDayInstant("2026-10-07", "America/Sao_Paulo").toISOString(),
      "2026-10-07T03:00:00.000Z",
    );
    assert.equal(
      startOfDayInstant("2026-03-08", "America/New_York").toISOString(),
      "2026-03-08T05:00:00.000Z",
      "midnight before the spring-forward still uses the winter offset",
    );
  });

  // ─── Agenda service: cache, scope of data, privacy ─────────────────────

  console.log("\nServiço da agenda");

  function agendaDeps(counter: { fetches: number; now: number }) {
    return {
      getToken: async () => "graph-token",
      fetchEvents: async () => {
        counter.fetches += 1;
        return graphEvents;
      },
      loadProjects: async () => projects,
      loadEntries: async () => [],
      loadCalls: async () => null,
      now: () => counter.now,
    };
  }

  await check("cache de 60 s por usuário e intervalo", async () => {
    clearAgendaCache();
    const counter = { fetches: 0, now: 1_000_000 };
    const deps = agendaDeps(counter);
    const input = {
      date: "2026-10-07",
      days: 2,
      includeDeclined: false,
      includeDescription: false,
    };

    const first = await getMyAgenda(me, input, deps);
    await getMyAgenda(me, input, deps);
    assert.equal(counter.fetches, 1, "second call is served from cache");
    assert.equal(first.range.start, "2026-10-07T00:00:00-03:00");
    assert.equal(first.range.end, "2026-10-09T00:00:00-03:00");
    assert.equal(first.timezone, "America/Sao_Paulo");

    await getMyAgenda(me, { ...input, days: 3 }, deps);
    assert.equal(counter.fetches, 2, "another range is another key");

    await getMyAgenda({ ...me, userId: "user-2" }, input, deps);
    assert.equal(counter.fetches, 3, "another user is another key");

    counter.now += 61_000;
    await getMyAgenda(me, input, deps);
    assert.equal(counter.fetches, 4, "entries expire after 60 s");
    clearAgendaCache();
  });

  await check(
    "clearAgendaCache(userId) limpa só o cache daquele usuário",
    async () => {
      clearAgendaCache();
      const counter = { fetches: 0, now: 1_000_000 };
      const deps = agendaDeps(counter);
      const input = {
        date: "2026-10-07",
        days: 1,
        includeDeclined: false,
        includeDescription: false,
      };
      const other = { ...me, userId: "user-2" };

      await getMyAgenda(me, input, deps);
      await getMyAgenda(other, input, deps);
      assert.equal(counter.fetches, 2);

      // What log_time, edit, delete, timer stop and apply do after writing.
      clearAgendaCache(me.userId);

      await getMyAgenda(me, input, deps);
      await getMyAgenda(other, input, deps);
      assert.equal(
        counter.fetches,
        3,
        "only the writer's agenda was refetched",
      );
      clearAgendaCache();
    },
  );

  await check(
    "agenda cortada pelo limite de páginas avisa em warnings",
    async () => {
      const run = async (days: number, truncate: boolean) => {
        clearAgendaCache();
        return getMyAgenda(
          me,
          {
            date: "2026-10-07",
            days,
            includeDeclined: false,
            includeDescription: false,
          },
          {
            ...agendaDeps({ fetches: 0, now: 1 }),
            fetchEvents: async (_token, _start, _end, options) => {
              if (truncate) options?.onTruncated?.();
              return graphEvents;
            },
          },
        );
      };

      const complete = await run(1, false);
      assert.deepEqual(complete.warnings, []);

      const cut = await run(1, true);
      assert.equal(cut.warnings.length, 1);
      assert.ok(
        cut.warnings[0]?.includes("300"),
        "3 pages of 100 for a short range",
      );
      assert.ok(cut.events.length > 0, "what was read is still returned");

      const cutWeek = await run(7, true);
      assert.ok(
        cutWeek.warnings[0]?.includes("500"),
        "5 pages of 100 beyond 3 days",
      );
      clearAgendaCache();
    },
  );

  await check(
    "evento de dia inteiro do dia vizinho não escapa para o intervalo",
    async () => {
      // Graph filters in UTC: for 7 Oct in São Paulo (03:00Z to 03:00Z) it still
      // returns this floating all-day event of the 8th, which starts at 00:00Z.
      const neighbour = graphEvent({
        id: "evt-neighbour-allday",
        subject: "Feriado do dia seguinte",
        isAllDay: true,
        start: { dateTime: "2026-10-08T00:00:00.0000000", timeZone: "UTC" },
        end: { dateTime: "2026-10-09T00:00:00.0000000", timeZone: "UTC" },
      });

      const read = async (date: string) => {
        clearAgendaCache();
        const result = await getMyAgenda(
          me,
          { date, days: 1, includeDeclined: false, includeDescription: false },
          {
            ...agendaDeps({ fetches: 0, now: 1 }),
            fetchEvents: async () => [neighbour],
          },
        );
        return result.events.map((event) => event.id);
      };

      assert.deepEqual(
        await read("2026-10-07"),
        [],
        "the 8th stays out of the 7th",
      );
      assert.deepEqual(await read("2026-10-08"), ["evt-neighbour-allday"]);
      assert.deepEqual(await read("2026-10-09"), [], "and out of the 9th");
      clearAgendaCache();
    },
  );

  await check(
    "logs não carregam assunto, participantes nem corpo",
    async () => {
      clearAgendaCache();
      const lines: string[] = [];
      const original = {
        info: console.info,
        error: console.error,
        warn: console.warn,
        log: console.log,
      };
      const capture = (...args: unknown[]) => {
        lines.push(JSON.stringify(args));
      };
      console.info = capture;
      console.error = capture;
      console.warn = capture;
      console.log = capture;

      try {
        await getMyAgenda(
          me,
          {
            date: "2026-10-07",
            days: 1,
            includeDeclined: false,
            includeDescription: true,
          },
          agendaDeps({ fetches: 0, now: 5 }),
        );
      } finally {
        Object.assign(console, original);
      }

      const logged = lines.join("\n");
      assert.ok(lines.length > 0, "the service logs something");
      for (const secret of [
        "Planning Portal do Cliente",
        "Daily do time",
        "ana@optsolv.com.br",
        "Pauta",
      ]) {
        assert.ok(!logged.includes(secret), `log must not contain "${secret}"`);
      }
      clearAgendaCache();
    },
  );

  // ─── 2. outputSchema ───────────────────────────────────────────────────

  console.log("\n2. outputSchema");

  const day = "2026-10-07";
  /** The full day: every evidence layer the engine knows. */
  function planInput(): Parameters<typeof buildDeterministicDayPlan>[0] {
    return {
      date: day,
      targetMinutes: 480,
      existingMinutes: 0,
      existingDescriptions: [],
      existingWorkItemIds: [],
      events: [
        {
          id: "evt-planning",
          subject: "Planning Portal do Cliente",
          startIso: "2026-10-07T17:00:00Z",
          endIso: "2026-10-07T18:30:00Z",
          minutes: 90,
        },
        {
          id: "evt-sync",
          subject: "Alinhamento sem projeto",
          startIso: "2026-10-07T19:00:00Z",
          endIso: "2026-10-07T19:30:00Z",
          minutes: 30,
        },
      ],
      documents: [],
      calls: [
        {
          id: "call-1",
          startIso: "2026-10-07T13:00:00Z",
          endIso: "2026-10-07T13:20:00Z",
          minutes: 20,
          otherParticipantName: "Ana",
          callerName: "Ana",
          calleeName: "Marcus",
          callType: "peerToPeer",
          mediaTypes: ["audio"],
        },
      ],
      commitSessions: buildCommitSessions([
        {
          id: "c1",
          commitId: "abc1234567",
          projectName: "Portal do Cliente",
          repositoryName: "portal",
          message: "Corrigir formulário de registro",
          comment: "Corrigir formulário de registro",
          branch: "develop",
          authorEmail: null,
          timestamp: "2026-10-07T14:00:00Z",
          workItemIds: [],
        },
        {
          id: "c2",
          commitId: "def7654321",
          projectName: "Portal do Cliente",
          repositoryName: "portal",
          message: "Ajustar validação do formulário",
          comment: "Ajustar validação do formulário",
          branch: "develop",
          authorEmail: null,
          timestamp: "2026-10-07T14:40:00Z",
          workItemIds: [],
        },
        {
          id: "c3",
          commitId: "0a1b2c3d4e",
          projectName: "Portal do Cliente",
          repositoryName: "portal",
          message: "Cobrir o formulário com testes",
          comment: "Cobrir o formulário com testes",
          branch: "develop",
          authorEmail: null,
          timestamp: "2026-10-07T15:10:00Z",
          workItemIds: [],
        },
      ]),
      pullRequests: [],
      workItemProposals: [
        {
          fingerprint: "autofill:work_item_active:2026-10-07:p-portal:wi4321",
          signal: "work_item_active",
          date: day,
          projectId: "p-portal",
          projectName: "Portal do Cliente",
          projectColor: "#f97316",
          description: "#4321 — Ajustar tela de login",
          durationMinutes: 60,
          billable: true,
          azureWorkItemId: 4321,
          azureWorkItemTitle: "Ajustar tela de login",
          repositoryName: null,
          commitIds: [],
          confidence: "medium",
          score: 60,
          reasons: ["A task está ativa."],
          evidence: [],
          loggedMinutesOnDate: 0,
          durationBasis: "Padrão de 1h",
        },
      ],
      dismissedFingerprints: [],
      patterns: [
        {
          projectId: "p-portal",
          projectName: "Portal do Cliente",
          projectColor: "#f97316",
          billable: true,
          description: "Desenvolvimento do portal",
          weight: 6,
        },
      ],
      projects,
      defaultBillable: true,
      warnings: ["Documentos do Microsoft 365 indisponíveis no momento."],
      sources: {
        calendar: true,
        calls: true,
        documents: false,
        attendance: false,
        transcripts: false,
        documentsNeedsConsent: false,
        attendanceNeedsConsent: false,
        transcriptsNeedsConsent: false,
        azureDevops: true,
        commits: true,
        patterns: true,
      },
    };
  }

  const plan: DayPlan = buildDeterministicDayPlan(planInput());

  function assertConforms(
    label: string,
    data: unknown,
    schema: ToolDefinition["outputSchema"],
  ): void {
    assert.ok(schema, `${label} declares an outputSchema`);
    const errors = validateAgainstSchema(data, schema);
    assert.deepEqual(errors, [], `${label} data violates its outputSchema`);
  }

  await check("agenda valida contra o outputSchema", async () => {
    clearAgendaCache();
    const result = await getMyAgenda(
      me,
      {
        date: "2026-10-07",
        days: 3,
        includeDeclined: true,
        includeDescription: true,
      },
      agendaDeps({ fetches: 0, now: 1 }),
    );
    assert.ok(result.events.length > 0);
    assertConforms("agenda", result, AGENDA_OUTPUT_SCHEMA);
    clearAgendaCache();
  });

  await check("work items valida contra o outputSchema", async () => {
    const result = await listMyWorkItems(
      me,
      { includeClosed: false, top: 50 },
      {
        loadConnection: async () => ({
          organizationUrl: "https://dev.azure.com/optsolv",
          pat: "pat",
        }),
        fetchAssigned: async () => [
          {
            id: 4321,
            title: "Ajustar tela de login",
            type: "Task",
            state: "Em Desenvolvimento",
            teamProject: "Portal do Cliente",
            areaPath: "Portal do Cliente\\Web",
            iterationPath: "Portal do Cliente\\Sprint 12",
            priority: 2,
            originalEstimateHours: 8,
            remainingWorkHours: 3,
            completedWorkHours: 5,
            changedDate: "2026-10-07T17:12:00.123Z",
            parentId: 4000,
            url: "https://dev.azure.com/optsolv/Portal/_workitems/edit/4321",
          },
          {
            id: 4400,
            title: "Corrigir relatório",
            type: "Bug",
            state: "Aberto",
            teamProject: "Outro time",
            areaPath: null,
            iterationPath: null,
            priority: null,
            originalEstimateHours: null,
            remainingWorkHours: null,
            completedWorkHours: null,
            changedDate: "2026-10-05T10:00:00.000Z",
            parentId: null,
            url: "https://dev.azure.com/optsolv/Outro/_workitems/edit/4400",
          },
        ],
        loadProjects: async () => projects,
        loadLogged: async () =>
          new Map([
            [
              4321,
              {
                minutes: 300,
                lastLoggedAt: new Date("2026-10-06T21:00:00Z"),
              },
            ],
          ]),
      },
    );

    assertConforms("work items", result, MY_WORK_ITEMS_OUTPUT_SCHEMA);
    assert.equal(result.items[0]?.id, 4321, "newest change first");
    assert.equal(result.items[0]?.changedAt, "2026-10-07T14:12:00-03:00");
    assert.equal(result.items[0]?.optTimeProject?.id, "p-portal");
    assert.equal(result.items[0]?.loggedMinutesInOptTime, 300);
    assert.equal(result.items[0]?.lastLoggedAt, "2026-10-06T18:00:00-03:00");
    assert.equal(result.items[1]?.optTimeProject, null);
  });

  await check("sugestões validam contra o outputSchema", () => {
    const result = buildSuggestResult(plan);
    assert.ok(result.suggestions.length >= 4, "fixture exercises many sources");
    assertConforms("suggestions", result, SUGGEST_OUTPUT_SCHEMA);

    const sources = new Set(result.suggestions.map((item) => item.source));
    for (const expected of ["calendar", "teams_call", "commits", "work_item"]) {
      assert.ok(sources.has(expected as never), `source ${expected} present`);
    }
    assert.equal(result.sources.outlook, true);
    assert.equal(result.sources.teamsCalls, true);
    assert.equal(result.sources.azureDevOps, true);
    assert.deepEqual(result.warnings, plan.warnings);
  });

  await check("whoami, resumo do dia e log_time validam", () => {
    assertConforms(
      "whoami",
      buildWhoamiData({
        principal: me,
        timezone: "America/Sao_Paulo",
        summary: {
          date: day,
          totalMinutes: 120,
          dailyCapacityMinutes: 480,
          weeklyCapacityMinutes: 2400,
        },
        microsoft: {
          connected: true,
          needsReconnect: false,
          tokenUsable: true,
        },
        integrations: {
          azureDevOps: { configured: true },
          eveningDigestEnabled: false,
        },
      }),
      WHOAMI_OUTPUT_SCHEMA,
    );

    const entry = {
      id: "e1",
      date: day,
      durationMinutes: 60,
      durationLabel: "1h",
      description: "Planning",
      billable: true,
      azureWorkItemId: null,
      azureWorkItemTitle: null,
      locked: false,
      project: {
        id: "p-portal",
        name: "Portal do Cliente",
        code: "PORT-01",
        color: "#f97316",
      },
    };

    const summary: import("@/lib/mcp/service/day-context").DaySummaryWithContext =
      {
        date: day,
        weekday: "quarta",
        totalMinutes: 60,
        totalLabel: "1h",
        billableMinutes: 60,
        entryCount: 1,
        dailyCapacityMinutes: 480,
        remainingMinutes: 420,
        remainingLabel: "7h",
        isComplete: false,
        byProject: [
          {
            projectId: "p-portal",
            projectName: "Portal do Cliente",
            projectCode: "PORT-01",
            minutes: 60,
            label: "1h",
          },
        ],
        entries: [entry],
        activeTimer: null,
        weekTotalMinutes: 60,
        weekTotalLabel: "1h",
        weeklyCapacityMinutes: 2400,
        isWorkday: true,
        targetMinutes: 480,
        warnings: [],
      };
    assertConforms("summary", summary, TODAY_SUMMARY_OUTPUT_SCHEMA);

    assertConforms(
      "log_time",
      { entry, dayTotalMinutes: 60, dayTotalLabel: "1h" },
      LOG_TIME_OUTPUT_SCHEMA,
    );
    assertConforms(
      "log_time (replay)",
      { entry, dayTotalMinutes: 60, dayTotalLabel: "1h", replayed: true },
      LOG_TIME_OUTPUT_SCHEMA,
    );
  });

  await check("o validador pega o que deve pegar", () => {
    const wrongType = validateAgainstSchema(
      { date: 1 },
      { type: "object", properties: { date: { type: "string" } } },
    );
    assert.equal(wrongType.length, 1);

    const missing = validateAgainstSchema(
      {},
      {
        type: "object",
        required: ["a"],
        properties: { a: { type: "string" } },
      },
    );
    assert.equal(missing.length, 1);

    const badEnum = validateAgainstSchema(
      { s: "x" },
      { type: "object", properties: { s: { type: "string", enum: ["a"] } } },
    );
    assert.equal(badEnum.length, 1);

    const nullable = validateAgainstSchema(
      { s: null },
      { type: "object", properties: { s: { type: ["string", "null"] } } },
    );
    assert.deepEqual(nullable, []);
  });

  await check(
    "tools/list publica outputSchema e annotations das ferramentas novas",
    () => {
      const described = describeTools();
      const byName = new Map(described.map((tool) => [tool.name, tool]));

      for (const name of [
        "opt_time_get_my_agenda",
        "opt_time_list_my_work_items",
        "opt_time_apply_suggestions",
        "opt_time_whoami",
        "opt_time_get_today_summary",
        "opt_time_suggest_daily_entries",
        "opt_time_log_time",
      ]) {
        const tool = byName.get(name);
        assert.ok(tool, `${name} is listed`);
        assert.ok("outputSchema" in tool, `${name} publishes an outputSchema`);
        assert.equal(typeof tool.annotations.readOnlyHint, "boolean");
        assert.equal(typeof tool.annotations.destructiveHint, "boolean");
      }

      assert.deepEqual(byName.get("opt_time_get_my_agenda")?.annotations, {
        title: "Minha agenda do Outlook",
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      });
      assert.deepEqual(byName.get("opt_time_apply_suggestions")?.annotations, {
        title: "Aplicar sugestões do dia",
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    },
  );

  await check("entradas das ferramentas novas servem a qualquer LLM", () => {
    const forbidden = ["$ref", "oneOf", "anyOf", "allOf"];

    function walk(node: unknown, path: string, issues: string[]): void {
      if (Array.isArray(node)) {
        node.forEach((item, index) => {
          walk(item, `${path}[${index}]`, issues);
        });
        return;
      }
      if (node === null || typeof node !== "object") return;

      const record = node as Record<string, unknown>;
      for (const key of forbidden) {
        if (key in record) issues.push(`${path}: usa ${key}`);
      }
      if ("default" in record) issues.push(`${path}: usa default`);

      const properties = record.properties as
        | Record<string, Record<string, unknown>>
        | undefined;
      for (const [name, child] of Object.entries(properties ?? {})) {
        if (
          typeof child.description !== "string" ||
          !child.description.trim()
        ) {
          issues.push(`${path}.${name}: sem description`);
        }
      }
      for (const [key, value] of Object.entries(record)) {
        walk(value, `${path}.${key}`, issues);
      }
    }

    for (const name of [
      "opt_time_get_my_agenda",
      "opt_time_list_my_work_items",
      "opt_time_apply_suggestions",
    ]) {
      const tool = TOOLS.find((item) => item.name === name);
      assert.ok(tool, name);
      const issues: string[] = [];
      walk(tool.inputSchema, name, issues);
      assert.deepEqual(issues, [], `${name} input schema`);
    }
  });

  // ─── 3. Stable suggestion ids ──────────────────────────────────────────

  console.log("\n3. Ids de sugestão estáveis");

  await check("o mesmo dia reconstruído gera os mesmos ids", () => {
    const first = buildSuggestResult(plan).suggestions.map((item) => item.id);

    const rebuilt = buildDeterministicDayPlan(planInput());
    const second = buildSuggestResult(rebuilt).suggestions.map(
      (item) => item.id,
    );

    assert.deepEqual([...first].sort(), [...second].sort());
    assert.equal(new Set(first).size, first.length, "ids are unique in a plan");
    for (const id of first) assert.match(id, /^sg_[0-9a-f]{16}(_\d+)?$/);
  });

  await check(
    "o id depende de dia+origem+referência, não de minutos nem de ordem",
    () => {
      const input = planInput();
      const reordered = buildDeterministicDayPlan({
        ...input,
        events: [...input.events].reverse(),
        // A different gap changes how estimates are fitted, never the identity.
        existingMinutes: 60,
      });
      const original = buildDeterministicDayPlan(input);

      const idsBySource = (candidate: DayPlan) =>
        candidate.items
          .filter((item) => item.source === "calendar")
          .map((item) => item.id)
          .sort();
      assert.deepEqual(idsBySource(reordered), idsBySource(original));

      const otherDay = buildDeterministicDayPlan({
        ...input,
        date: "2026-10-06",
      });
      assert.notDeepEqual(idsBySource(otherDay), idsBySource(original));
    },
  );

  // ─── 4. Idempotency ────────────────────────────────────────────────────

  console.log("\n4. Idempotência");

  function memoryStore() {
    const rows = new Map<
      string,
      { requestHash: string; response: unknown; expiresAt: Date }
    >();
    return {
      rows,
      store: {
        find: async (scope: string, key: string) =>
          rows.get(`${scope}|${key}`) ?? null,
        save: async (
          scope: string,
          key: string,
          record: { requestHash: string; response: unknown; expiresAt: Date },
        ) => {
          rows.set(`${scope}|${key}`, record);
        },
        remove: async (scope: string, key: string) => {
          rows.delete(`${scope}|${key}`);
        },
      },
    };
  }

  await check(
    "mesma chave e mesma entrada devolvem o mesmo resultado",
    async () => {
      const { store } = memoryStore();
      let executions = 0;
      const execute = async () => {
        executions += 1;
        return { createdEntryIds: ["a", "b"] };
      };

      const first = await runIdempotent({
        store,
        scope: "apply_suggestions",
        key: "11111111-aaaa",
        input: { date: day, items: [{ suggestionId: "sg_1" }] },
        execute,
      });
      const second = await runIdempotent({
        store,
        scope: "apply_suggestions",
        key: "11111111-aaaa",
        // Same content, different key order: must hash the same.
        input: { items: [{ suggestionId: "sg_1" }], date: day },
        execute,
      });

      assert.equal(first.replayed, false);
      assert.equal(second.replayed, true);
      assert.deepEqual(second.result, first.result);
      assert.equal(executions, 1, "the work ran exactly once");
    },
  );

  await check(
    "mesma chave com entrada diferente dá IDEMPOTENCY_CONFLICT",
    async () => {
      const { store } = memoryStore();
      await runIdempotent({
        store,
        scope: "apply_suggestions",
        key: "22222222-bbbb",
        input: { minutes: 30 },
        execute: async () => "ok",
      });

      await assert.rejects(
        () =>
          runIdempotent({
            store,
            scope: "apply_suggestions",
            key: "22222222-bbbb",
            input: { minutes: 45 },
            execute: async () => "ok",
          }),
        (error: unknown) =>
          error instanceof AgentError &&
          error.code === "IDEMPOTENCY_CONFLICT" &&
          error.status === 409 &&
          Boolean(error.hint),
      );
    },
  );

  await check(
    "falha não consome a chave; expiração libera a chave",
    async () => {
      const { store, rows } = memoryStore();
      let attempt = 0;

      await assert.rejects(() =>
        runIdempotent({
          store,
          scope: "s",
          key: "33333333-cccc",
          input: {},
          execute: async () => {
            attempt += 1;
            throw new Error("boom");
          },
        }),
      );
      assert.equal(rows.size, 0, "a failed run records nothing");

      const retried = await runIdempotent({
        store,
        scope: "s",
        key: "33333333-cccc",
        input: {},
        execute: async () => {
          attempt += 1;
          return "done";
        },
      });
      assert.equal(retried.replayed, false);
      assert.equal(attempt, 2);

      const later = new Date(Date.now() + IDEMPOTENCY_TTL_MS + 1_000);
      const afterExpiry = await runIdempotent({
        store,
        scope: "s",
        key: "33333333-cccc",
        input: { different: true },
        execute: async () => "fresh",
        now: later,
      });
      assert.equal(afterExpiry.replayed, false, "an expired key is free again");
      assert.equal(afterExpiry.result, "fresh");
    },
  );

  await check("a chave é validada", () => {
    assert.equal(
      parseIdempotencyKey("  3f2b8c1e-5d6a-4b7c-9e0f-1a2b3c4d5e6f "),
      "3f2b8c1e-5d6a-4b7c-9e0f-1a2b3c4d5e6f",
    );
    for (const bad of [undefined, null, "", "short", "has space in it", 42]) {
      assert.throws(
        () => parseIdempotencyKey(bad),
        (error: unknown) =>
          error instanceof AgentError && error.code === "VALIDATION_ERROR",
      );
    }
    assert.notEqual(
      hashIdempotencyInput({ a: 1 }),
      hashIdempotencyInput({ a: 2 }),
    );
  });

  await check("apply_suggestions: uma chave, uma gravação", async () => {
    const { store } = memoryStore();
    const writes: Array<{ items: number; minutes: number }> = [];
    const suggestions = buildSuggestResult(plan).suggestions;
    const calendar = suggestions.find((item) => item.source === "calendar");
    const pattern = suggestions.find((item) => item.source === "work_item");
    assert.ok(calendar?.projectId && pattern);

    const deps = {
      loadPlan: async () => plan,
      resolveProject: async (_p: Principal, reference: string) => {
        const found = projects.find(
          (item) => item.id === reference || item.code === reference,
        );
        if (!found) throw new AgentError("NOT_FOUND", "sem projeto");
        return { id: found.id, name: found.name, billable: found.billable };
      },
      peek: async (
        _principal: Principal,
        key: string,
        input: unknown,
      ): Promise<{
        date: string;
        createdEntryIds: string[];
        dayTotalMinutes: number;
        dailyCapacityMinutes: number;
        remainingMinutes: number;
      } | null> => {
        const row = await store.find("apply_suggestions", key);
        if (!row) return null;
        if (row.requestHash !== hashIdempotencyInput(input)) {
          throw new AgentError(
            "IDEMPOTENCY_CONFLICT",
            "Esta idempotencyKey já foi usada com uma entrada diferente.",
          );
        }
        return row.response as never;
      },
      commit: async (
        _principal: Principal,
        request: {
          key: string;
          input: unknown;
          date: string;
          items: Array<{ minutes: number }>;
          targetMinutes: number;
        },
      ) =>
        runIdempotent({
          store,
          scope: "apply_suggestions",
          key: request.key,
          input: request.input,
          execute: async () => {
            const minutes = request.items.reduce(
              (sum, item) => sum + item.minutes,
              0,
            );
            writes.push({ items: request.items.length, minutes });
            return {
              date: request.date,
              createdEntryIds: request.items.map(
                (_, index) => `entry-${index}`,
              ),
              dayTotalMinutes: minutes,
              dailyCapacityMinutes: request.targetMinutes,
              remainingMinutes: Math.max(0, request.targetMinutes - minutes),
            };
          },
        }),
      afterWrite: () => undefined,
    };

    const request = {
      date: day,
      idempotencyKey: "44444444-dddd-eeee",
      items: [
        { suggestionId: calendar.id },
        { suggestionId: pattern.id, durationMinutes: 45, billable: false },
      ],
      rejectedSuggestionIds: [],
    };

    const first = await applySuggestions(me, request, deps);
    const second = await applySuggestions(me, request, deps);

    assert.equal(first.replayed, false);
    assert.equal(second.replayed, true);
    assert.deepEqual(second.createdEntryIds, first.createdEntryIds);
    assert.equal(writes.length, 1, "entries were written once");
    assertConforms("apply", first, APPLY_SUGGESTIONS_OUTPUT_SCHEMA);
    assertConforms("apply (replay)", second, APPLY_SUGGESTIONS_OUTPUT_SCHEMA);

    await assert.rejects(
      () =>
        applySuggestions(
          me,
          {
            ...request,
            items: [{ suggestionId: calendar.id, durationMinutes: 30 }],
          },
          deps,
        ),
      (error: unknown) =>
        error instanceof AgentError && error.code === "IDEMPOTENCY_CONFLICT",
    );
    assert.equal(writes.length, 1, "a conflicting call writes nothing");
  });

  await check(
    "apply_suggestions: erros nomeiam o item e nada é gravado",
    async () => {
      const suggestions = buildSuggestResult(plan).suggestions;
      const unassigned = suggestions.find((item) => item.projectId === null);
      const calendar = suggestions.find((item) => item.source === "calendar");
      assert.ok(unassigned && calendar);

      let commits = 0;
      const deps = {
        loadPlan: async () => plan,
        resolveProject: async () => {
          throw new AgentError("NOT_FOUND", "Projeto não encontrado.");
        },
        peek: async () => null,
        commit: async () => {
          commits += 1;
          throw new Error("must not be reached");
        },
        afterWrite: () => undefined,
      };

      const base = {
        date: day,
        idempotencyKey: "55555555-ffff",
        rejectedSuggestionIds: [],
      };

      await assert.rejects(
        () =>
          applySuggestions(
            me,
            {
              ...base,
              items: [
                { suggestionId: calendar.id },
                { suggestionId: unassigned.id },
              ],
            },
            deps,
          ),
        (error: unknown) =>
          error instanceof AgentError &&
          error.code === "VALIDATION_ERROR" &&
          error.message.includes("Item 2") &&
          error.message.includes("projectId"),
        "a suggestion without a project must be rejected naming the item",
      );

      await assert.rejects(
        () =>
          applySuggestions(
            me,
            { ...base, items: [{ suggestionId: "sg_doesnotexist0000" }] },
            deps,
          ),
        (error: unknown) =>
          error instanceof AgentError &&
          error.code === "NOT_FOUND" &&
          error.message.includes("Item 1"),
      );

      await assert.rejects(
        () =>
          applySuggestions(
            me,
            {
              ...base,
              items: [{ suggestionId: calendar.id, durationMinutes: 3 }],
            },
            deps,
          ),
        (error: unknown) =>
          error instanceof AgentError && error.message.includes("mínima"),
        "durations below 5 minutes are refused (except calls)",
      );

      await assert.rejects(
        () =>
          applySuggestions(
            me,
            {
              ...base,
              items: [
                { suggestionId: calendar.id },
                { suggestionId: calendar.id },
              ],
            },
            deps,
          ),
        (error: unknown) =>
          error instanceof AgentError && error.code === "VALIDATION_ERROR",
        "the same suggestion twice is a client bug",
      );

      await assert.rejects(
        () => applySuggestions(me, { ...base, items: [] }, deps),
        (error: unknown) =>
          error instanceof AgentError && error.code === "VALIDATION_ERROR",
      );

      assert.equal(commits, 0, "nothing reached the write path");
    },
  );

  await check(
    "apply_suggestions: edições viram feedback 'edited' e recusas viram 'rejected'",
    async () => {
      const suggestions = buildSuggestResult(plan).suggestions;
      const workItem = suggestions.find((item) => item.source === "work_item");
      const unassigned = suggestions.find(
        (item) => item.projectId === null && item.source === "calendar",
      );
      const call = suggestions.find((item) => item.source === "teams_call");
      const commits = suggestions.find((item) => item.source === "commits");
      assert.ok(workItem && unassigned && call && commits);

      type Captured = {
        items: Array<{
          projectId: string;
          minutes: number;
          billable: boolean;
          editedFields?: string[];
          source: string;
          sourceId?: string;
        }>;
        rejected: Array<{ fingerprint: string }>;
      };
      let captured: Captured | null = null;

      await applySuggestions(
        me,
        {
          date: day,
          idempotencyKey: "66666666-gggg",
          items: [
            { suggestionId: workItem.id, durationMinutes: 90 },
            // The unassigned suggestion gets its project by code.
            { suggestionId: unassigned.id, projectId: "GP-03" },
            {
              suggestionId: call.id,
              projectId: "PORT-01",
              durationMinutes: 12,
            },
          ],
          rejectedSuggestionIds: [commits.id, "sg_gone"],
        },
        {
          loadPlan: async () => plan,
          resolveProject: async (_p: Principal, reference: string) => {
            const found = projects.find((item) => item.code === reference);
            if (!found) throw new AgentError("NOT_FOUND", "sem projeto");
            return { id: found.id, name: found.name, billable: found.billable };
          },
          peek: async () => null,
          commit: async (_p: Principal, request: unknown) => {
            captured = request as Captured;
            return {
              result: {
                date: day,
                createdEntryIds: ["x"],
                dayTotalMinutes: 0,
                dailyCapacityMinutes: 480,
                remainingMinutes: 480,
              },
              replayed: false,
            };
          },
          afterWrite: () => undefined,
        },
      );

      assert.ok(captured, "commit received the rows");
      const rows = captured as Captured;
      const [edited, assigned, measured] = rows.items;
      assert.equal(edited?.minutes, 90);
      assert.deepEqual(edited?.editedFields, ["minutes"]);
      assert.equal(assigned?.projectId, "p-gestao");
      assert.equal(
        assigned?.billable,
        false,
        "the chosen project brings its billing default",
      );
      assert.ok(assigned?.editedFields?.includes("projectId"));
      assert.equal(measured?.source, "teams_call");
      assert.equal(
        measured?.sourceId,
        "call-1",
        "calls keep their id for de-duplication",
      );
      assert.equal(
        measured?.minutes,
        12,
        "calls may be shorter than 5 minutes",
      );
      assert.equal(rows.rejected.length, 1, "unknown rejected ids are skipped");
    },
  );

  await check("fingerprints de recusa reaproveitam o formato do radar", () => {
    const item = plan.items.find(
      (candidate) => candidate.source === "work_item",
    );
    assert.ok(item);
    assert.equal(
      rejectionFingerprint(day, item),
      "autofill:work_item_active:2026-10-07:p-portal:wi4321",
    );
    const call = plan.items.find(
      (candidate) => candidate.source === "teams_call",
    );
    assert.ok(call);
    assert.match(
      rejectionFingerprint(day, call),
      /^reconstruct:2026-10-07:none:teams_call$/,
    );
  });

  await check(
    "apply_suggestions: a repetição que perdeu a corrida devolve a resposta guardada",
    async () => {
      const target = buildSuggestResult(plan).suggestions.find(
        (item) => item.source === "calendar" && item.projectId,
      );
      assert.ok(target);
      const targetId = target.id;

      const stored = {
        date: day,
        createdEntryIds: ["entry-a"],
        dayTotalMinutes: 90,
        dailyCapacityMinutes: 480,
        remainingMinutes: 390,
      };
      const request = {
        date: day,
        idempotencyKey: "77777777-race-aaaa",
        items: [{ suggestionId: targetId }],
        rejectedSuggestionIds: [],
      };

      function raceDeps(originalWritesDuringPlan: boolean) {
        const state = {
          ledger: null as typeof stored | null,
          peeks: 0,
          commits: 0,
        };
        return {
          state,
          deps: {
            // B rebuilds the plan after A committed: the suggestion is now an
            // entry, so it is gone from the plan.
            loadPlan: async () => {
              if (originalWritesDuringPlan) state.ledger = stored;
              return {
                ...plan,
                items: plan.items.filter((item) => item.id !== targetId),
              };
            },
            resolveProject: async () => {
              throw new AgentError("NOT_FOUND", "não deve ser chamado");
            },
            peek: async () => {
              state.peeks += 1;
              return state.ledger;
            },
            commit: async () => {
              state.commits += 1;
              throw new Error("a stale request must never reach the write");
            },
            afterWrite: () => undefined,
          },
        };
      }

      const raced = raceDeps(true);
      const result = await applySuggestions(me, request, raced.deps);
      assert.equal(result.replayed, true);
      assert.deepEqual(result.createdEntryIds, stored.createdEntryIds);
      assert.equal(result.dayTotalMinutes, 90);
      assert.equal(
        raced.state.peeks,
        2,
        "the ledger is read again after the failure",
      );
      assert.equal(raced.state.commits, 0);

      // Nothing settled the key: the stale id is still reported, naming the item.
      const stale = raceDeps(false);
      await assert.rejects(
        () => applySuggestions(me, request, stale.deps),
        (error: unknown) =>
          error instanceof AgentError &&
          error.code === "NOT_FOUND" &&
          error.message.includes("Item 1"),
      );
      assert.equal(stale.state.peeks, 2);
    },
  );

  await check(
    "apply_suggestions: erro de projeto diz qual item e guarda código, dica e detalhes",
    async () => {
      const suggestions = buildSuggestResult(plan).suggestions;
      const first = suggestions.find((item) => item.source === "calendar");
      const second = suggestions.find((item) => item.source === "work_item");
      assert.ok(first && second);

      const failures = [
        ["NOT_FOUND", { availableProjects: [{ id: "p-portal" }] }],
        [
          "AMBIGUOUS_PROJECT",
          { candidates: [{ code: "A-1" }, { code: "A-2" }] },
        ],
        ["CONFLICT", { projectId: "p-old" }],
        ["FORBIDDEN", null],
      ] as const;

      for (const [code, details] of failures) {
        const deps = {
          loadPlan: async () => plan,
          resolveProject: async (): Promise<never> => {
            throw new AgentError(code, "Projeto indisponível.", {
              details: details ?? undefined,
              hint: "Use o código exato do projeto.",
            });
          },
          peek: async () => null,
          commit: async (): Promise<never> => {
            throw new Error("nothing may be written");
          },
          afterWrite: () => undefined,
        };

        await assert.rejects(
          () =>
            applySuggestions(
              me,
              {
                date: day,
                idempotencyKey: `88888888-${code}`,
                items: [
                  { suggestionId: first.id },
                  { suggestionId: second.id, projectId: "qualquer" },
                ],
                rejectedSuggestionIds: [],
              },
              deps,
            ),
          (error: unknown) => {
            assert.ok(error instanceof AgentError);
            assert.equal(error.code, code, "the original code is kept");
            assert.ok(error.message.startsWith("Item 2: "), error.message);
            assert.equal(error.hint, "Use o código exato do projeto.");
            const merged = error.details as Record<string, unknown>;
            assert.equal(merged.itemIndex, 1);
            assert.equal(merged.suggestionId, second.id);
            for (const [key, value] of Object.entries(details ?? {})) {
              assert.deepEqual(merged[key], value, `${key} survives`);
            }
            return true;
          },
          code,
        );
      }
    },
  );

  await check(
    "WIQL escapa aspas no nome do projeto do Azure DevOps",
    async () => {
      const { createAzureDevOpsClient } = await import(
        "@/lib/azure-devops/client"
      );
      const client = createAzureDevOpsClient(
        "https://dev.azure.com/org",
        "pat",
      );

      const queries: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          query?: string;
        };
        if (body.query) queries.push(body.query);
        return Response.json({ workItems: [] });
      }) as typeof fetch;

      try {
        const project = "Cliente's Portal";
        await client.getAssignedWorkItems(project, 5);
        await client.searchWorkItems(project, "login", 5);
        await client.searchWorkItems(project, "#123", 5);
        await client.getProjectWorkItems(project, 5);
      } finally {
        globalThis.fetch = realFetch;
      }

      assert.equal(queries.length, 4, "every query reached Azure");
      for (const query of queries) {
        assert.ok(
          query.includes("[System.TeamProject] = 'Cliente''s Portal'"),
          `quote doubled in: ${query.slice(0, 90)}`,
        );
        assert.ok(!query.includes("'Cliente's"), "no unescaped quote left");
      }
    },
  );

  // ─── 5. Scope ──────────────────────────────────────────────────────────

  console.log("\n5. Escopo calendar:read");

  await check(
    "token sem calendar:read recebe INSUFFICIENT_SCOPE com hint",
    async () => {
      await assert.rejects(
        () =>
          callTool(
            principal(["time:read", "time:write"]),
            "opt_time_get_my_agenda",
            {},
          ),
        (error: unknown) =>
          error instanceof AgentError &&
          error.code === "INSUFFICIENT_SCOPE" &&
          error.status === 403 &&
          error.message.includes("leitura da agenda") &&
          String(error.hint).includes("calendar:read"),
      );
    },
  );

  await check(
    "preset do ISPer e escopos que não vazam para credenciais antigas",
    () => {
      assert.deepEqual(
        [...API_TOKEN_PRESETS.assistant.scopes],
        [...ISPER_SCOPES],
      );
      assert.equal(
        API_TOKEN_PRESETS.assistant.label,
        "Assistente pessoal (ISPer)",
      );
      assert.ok(API_TOKEN_SCOPES.includes("calendar:read"));
      assert.ok(
        !BASE_TOKEN_SCOPES.includes("calendar:read"),
        "legacy and Teams principals never get the agenda scope",
      );
      assert.ok(
        !API_TOKEN_PRESETS.full.scopes.includes("calendar:read" as never),
        "existing presets keep their meaning",
      );
    },
  );

  await check("a agenda não aceita userId como entrada", () => {
    for (const name of [
      "opt_time_get_my_agenda",
      "opt_time_list_my_work_items",
      "opt_time_apply_suggestions",
    ]) {
      const tool = TOOLS.find((item) => item.name === name);
      assert.ok(tool);
      assert.ok(
        !("userId" in tool.inputSchema.properties) &&
          !("email" in tool.inputSchema.properties),
        `${name} cannot target another person`,
      );
    }
  });

  // ─── 6. No Microsoft account ───────────────────────────────────────────

  console.log("\nErros de ferramenta");

  const { handleMcpPayload } = await import("@/lib/mcp/rpc");

  interface ToolCallResult {
    isError?: boolean;
    content?: Array<{ text: string }>;
    structuredContent?: unknown;
    _meta?: Record<
      string,
      { code?: string; hint?: string | null; details?: unknown } | undefined
    >;
  }

  async function callThroughRpc(
    caller: Principal,
    name: string,
    args: Record<string, unknown>,
  ): Promise<ToolCallResult> {
    const outcome = await handleMcpPayload(caller, {
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name, arguments: args },
    });
    const body = outcome.body;
    assert.ok(
      body && !Array.isArray(body) && body.result,
      "tools/call answers with a result, not a protocol error",
    );
    return body.result as ToolCallResult;
  }

  await check(
    "erro de ferramenta não manda structuredContent; o código vai em _meta",
    async () => {
      const missingScope = await callThroughRpc(
        principal(["time:read", "time:write"]),
        "opt_time_get_my_agenda",
        {},
      );
      assert.equal(missingScope.isError, true);
      assert.equal(
        missingScope.structuredContent,
        undefined,
        "an error object would be validated against the outputSchema",
      );
      const meta = missingScope._meta?.["opt-time/error"];
      assert.equal(meta?.code, "INSUFFICIENT_SCOPE");
      assert.ok(
        String(meta?.hint).includes("calendar:read"),
        "the hint is machine-readable too",
      );
      assert.ok(
        missingScope.content?.[0]?.text.includes("calendar:read"),
        "the text still carries the hint",
      );

      const invalid = await callThroughRpc(me, "opt_time_get_my_agenda", {
        days: 9,
      });
      assert.equal(invalid.structuredContent, undefined);
      assert.equal(invalid._meta?.["opt-time/error"]?.code, "VALIDATION_ERROR");

      const unknown = await callThroughRpc(me, "opt_time_nao_existe", {});
      assert.equal(unknown.structuredContent, undefined);
      assert.equal(unknown._meta?.["opt-time/error"]?.code, "NOT_FOUND");
      assert.ok(
        Array.isArray(
          (
            unknown._meta?.["opt-time/error"]?.details as {
              availableTools?: unknown;
            }
          )?.availableTools,
        ),
        "details survive in _meta",
      );

      // Why it matters: the old error shape violates every published schema.
      const legacyShape = {
        error: { code: "INSUFFICIENT_SCOPE", message: "x" },
      };
      for (const schema of [
        AGENDA_OUTPUT_SCHEMA,
        MY_WORK_ITEMS_OUTPUT_SCHEMA,
        APPLY_SUGGESTIONS_OUTPUT_SCHEMA,
      ]) {
        assert.ok(validateAgainstSchema(legacyShape, schema).length > 0);
      }
    },
  );

  await check(
    "o Client oficial do SDK mostra o erro em vez de falhar no esquema",
    async () => {
      // The package lives outside the pnpm workspace, so its SDK is only there
      // after `npm install` in packages/opt-time-mcp.
      const sdkDir = join(
        process.cwd(),
        "packages/opt-time-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm",
      );
      if (!existsSync(sdkDir)) {
        console.log(
          "    (SDK não instalado em packages/opt-time-mcp — pulado)",
        );
        return;
      }

      const { Client } = await import(
        pathToFileURL(join(sdkDir, "client/index.js")).href
      );

      /** Feeds the SDK client straight into the JSON-RPC handler. */
      class InProcessTransport {
        onclose?: () => void;
        onerror?: (error: Error) => void;
        onmessage?: (message: unknown) => void;

        async start(): Promise<void> {}

        async send(message: unknown): Promise<void> {
          const { body } = await handleMcpPayload(
            principal(["time:read", "time:write"]),
            message,
          );
          if (body) queueMicrotask(() => this.onmessage?.(body));
        }

        async close(): Promise<void> {
          this.onclose?.();
        }
      }

      const client = new Client({ name: "verify", version: "1" });
      await client.connect(new InProcessTransport());
      // listTools caches the validators the client later applies to each result.
      const listed = await client.listTools();
      assert.ok(
        listed.tools.some(
          (item: { name: string; outputSchema?: unknown }) =>
            item.name === "opt_time_get_my_agenda" && item.outputSchema,
        ),
        "the client sees the outputSchema it will validate against",
      );

      const result = await client.callTool({
        name: "opt_time_get_my_agenda",
        arguments: {},
      });

      assert.equal(result.isError, true);
      assert.ok(
        (result.content as Array<{ text: string }>)[0]?.text.includes(
          "calendar:read",
        ),
        "the user sees the hint instead of a schema error",
      );
      await client.close();
    },
  );

  console.log("\n6. Sem conta Microsoft");

  await check(
    "agenda dá MICROSOFT_NOT_CONNECTED com hint acionável",
    async () => {
      await assert.rejects(
        () =>
          getMyAgenda(
            me,
            {
              date: day,
              days: 1,
              includeDeclined: false,
              includeDescription: false,
            },
            {
              ...agendaDeps({ fetches: 0, now: 1 }),
              getToken: (candidate) =>
                requireAgentMicrosoftToken(candidate, {
                  loadToken: async () => null,
                  loadConnection: async () => ({
                    connected: false,
                    needsReconnect: false,
                  }),
                }),
            },
          ),
        (error: unknown) =>
          error instanceof AgentError &&
          error.code === "MICROSOFT_NOT_CONNECTED" &&
          error.status === 412 &&
          String(error.hint).includes("reconectar"),
      );

      await assert.rejects(
        () =>
          requireAgentMicrosoftToken(me, {
            loadToken: async () => null,
            loadConnection: async () => ({
              connected: true,
              needsReconnect: true,
            }),
          }),
        (error: unknown) =>
          error instanceof AgentError &&
          error.code === "MICROSOFT_NOT_CONNECTED" &&
          error.message.includes("expirou"),
      );
    },
  );

  await check("sugestões seguem sem o Outlook e dizem isso", async () => {
    const withoutCalendar: DayPlan = buildDeterministicDayPlan({
      ...planInput(),
      events: [],
      calls: [],
      patterns: [
        {
          projectId: "p-portal",
          projectName: "Portal do Cliente",
          projectColor: "#f97316",
          billable: true,
          description: "Desenvolvimento do portal",
          weight: 4,
        },
      ],
      warnings: [
        "Reconecte sua conta Microsoft para ver suas reuniões do dia.",
      ],
      sources: {
        ...plan.sources,
        calendar: false,
        calls: false,
        azureDevops: false,
        commits: false,
      },
    });

    let receivedToken: string | null | undefined;
    const result = await suggestDailyEntries(me, day, {
      assertPlannable: async () => undefined,
      getToken: async () => null,
      buildPlan: async (input) => {
        receivedToken = input.microsoftAccessToken;
        return withoutCalendar;
      },
    });

    assert.equal(
      receivedToken,
      null,
      "the plan is built without a Graph token",
    );
    assert.equal(result.sources.outlook, false);
    assert.equal(result.sources.teamsCalls, false);
    assert.ok(result.warnings.some((warning) => warning.includes("Microsoft")));
    assert.ok(result.suggestions.length > 0, "the day is still planned");
    assertConforms(
      "suggestions without outlook",
      result,
      SUGGEST_OUTPUT_SCHEMA,
    );
  });

  await check("sem calendar:read as sugestões não leem o Outlook", async () => {
    let receivedToken: string | null | undefined = "unset";
    let tokenRequested = false;

    const result = await suggestDailyEntries(
      principal(["time:read", "time:write"]),
      day,
      {
        assertPlannable: async () => undefined,
        getToken: async () => {
          tokenRequested = true;
          return "graph-token";
        },
        buildPlan: async (input) => {
          receivedToken = input.microsoftAccessToken;
          return {
            ...plan,
            warnings: [
              "Reconecte sua conta Microsoft para ver suas reuniões do dia.",
            ],
          };
        },
      },
    );

    assert.equal(
      tokenRequested,
      false,
      "the Graph token is never even fetched",
    );
    assert.equal(receivedToken, null, "the plan is built without Graph");
    assert.ok(
      result.warnings[0]?.includes("calendar:read"),
      "the warning names the missing scope",
    );
    assert.ok(
      !result.warnings.some((warning) => warning.startsWith("Reconecte")),
      "a reconnect warning would blame the wrong thing",
    );
  });

  await check("dia travado ou fora da janela vira erro do agente", async () => {
    const { DayPlanRejectedError } = await import(
      "@/lib/time-assistant/day-plan"
    );

    for (const [reason, code] of [
      ["period_locked", "PERIOD_LOCKED"],
      ["future_date", "VALIDATION_ERROR"],
      ["out_of_window", "VALIDATION_ERROR"],
    ] as const) {
      await assert.rejects(
        () =>
          suggestDailyEntries(me, day, {
            assertPlannable: async () => {
              throw new DayPlanRejectedError(reason, "bloqueado");
            },
            getToken: async () => null,
            buildPlan: async () => plan,
          }),
        (error: unknown) => error instanceof AgentError && error.code === code,
      );
    }
  });

  // ─── isWorkday / targetMinutes ─────────────────────────────────────────

  console.log("\nisWorkday e targetMinutes");

  await check("fim de semana, expediente do Outlook e ausência", () => {
    const base = {
      weeklyCapacityHours: 40,
      dailyCapacityMinutes: 480,
    };
    const fourDayWeek = {
      daysOfWeek: [1, 2, 3, 4],
      startMinute: 540,
      endMinute: 1080,
      windowMinutes: 540,
      timeZone: null,
    };
    const okMailbox = (
      overrides: Partial<import("@/types/collaboration").MailboxProfile>,
    ): import("@/types/collaboration").MailboxProfile => ({
      workingHours: null,
      timeZone: null,
      away: null,
      availability: "ok",
      ...overrides,
    });

    // 2026-10-07 is a Wednesday; 2026-10-09 a Friday; 2026-10-10 a Saturday.
    assert.deepEqual(
      resolveDayContext({ ...base, date: "2026-10-07", mailbox: null }),
      { isWorkday: true, targetMinutes: 480, warnings: [] },
      "Graph unreachable falls back to the weekly capacity",
    );
    assert.deepEqual(
      resolveDayContext({ ...base, date: "2026-10-10", mailbox: null }),
      { isWorkday: false, targetMinutes: 0, warnings: [] },
    );
    assert.deepEqual(
      resolveDayContext({
        ...base,
        date: "2026-10-07",
        mailbox: okMailbox({ workingHours: fourDayWeek }),
      }),
      // 40h spread over four days is 600 min, capped by the 9h window.
      { isWorkday: true, targetMinutes: 540, warnings: [] },
      "the target follows the days the person works in Outlook",
    );
    assert.deepEqual(
      resolveDayContext({
        ...base,
        date: "2026-10-09",
        mailbox: okMailbox({ workingHours: fourDayWeek }),
      }),
      { isWorkday: false, targetMinutes: 0, warnings: [] },
      "a day off in the Outlook week is not a workday",
    );
  });

  await check(
    "resposta automática: agendada conta como ausência, sempre ligada não",
    () => {
      const base = { weeklyCapacityHours: 40, dailyCapacityMinutes: 480 };
      const withAway = (
        away: import("@/types/collaboration").AwayPeriod,
      ): import("@/types/collaboration").MailboxProfile => ({
        workingHours: null,
        timeZone: null,
        away,
        availability: "ok",
      });

      // Scheduled and covering the day: absence.
      assert.deepEqual(
        resolveDayContext({
          ...base,
          date: "2026-10-07",
          mailbox: withAway({
            kind: "scheduled",
            startIso: "2026-10-05T03:00:00.000Z",
            endIso: "2026-10-10T03:00:00.000Z",
          }),
        }),
        { isWorkday: false, targetMinutes: 0, warnings: [] },
        "a scheduled out-of-office covering the day is absence",
      );

      // Scheduled but over: a normal day.
      assert.deepEqual(
        resolveDayContext({
          ...base,
          date: "2026-10-07",
          mailbox: withAway({
            kind: "scheduled",
            startIso: "2026-09-20T03:00:00.000Z",
            endIso: "2026-09-27T03:00:00.000Z",
          }),
        }),
        { isWorkday: true, targetMinutes: 480, warnings: [] },
      );

      // Always on — and scheduled with no bounds, which says the same: not
      // absence, or the person would never have a working day.
      for (const away of [
        { kind: "always", startIso: null, endIso: null },
        { kind: "scheduled", startIso: null, endIso: null },
      ] as const) {
        const context = resolveDayContext({
          ...base,
          date: "2026-10-07",
          mailbox: withAway(away),
        });
        assert.equal(
          context.isWorkday,
          true,
          `${away.kind} reply keeps the day`,
        );
        assert.equal(context.targetMinutes, 480);
        assert.deepEqual(context.warnings, [ALWAYS_ON_AWAY_WARNING]);
      }

      // The weekend still wins, and does not nag about the reply.
      assert.deepEqual(
        resolveDayContext({
          ...base,
          date: "2026-10-10",
          mailbox: withAway({ kind: "always", startIso: null, endIso: null }),
        }),
        { isWorkday: false, targetMinutes: 0, warnings: [] },
      );
    },
  );

  // ─── Microsoft account choice and the background token ─────────────────

  const MS_NOW = Date.parse("2026-10-08T12:00:00Z");
  const hoursFromNow = (hours: number): Date =>
    new Date(MS_NOW + hours * 3_600_000);
  const daysAgo = (days: number): Date => new Date(MS_NOW - days * 86_400_000);

  function msRow(
    overrides: Partial<BackgroundAccountRow> & { id: string },
  ): BackgroundAccountRow {
    return {
      accessToken: null,
      accessTokenExpiresAt: null,
      refreshToken: `refresh-${overrides.id}`,
      refreshTokenExpiresAt: null,
      updatedAt: daysAgo(1),
      ...overrides,
    };
  }

  function entraRefusal(code: string | null = "AADSTS70000") {
    return new MicrosoftRefreshError({
      oauthError: "invalid_grant",
      aadstsCode: code,
      status: 400,
    });
  }

  /** The row Postgres happens to list first is dead; the second is the live one. */
  const deadOlderFirst = msRow({
    id: "acc-dead",
    updatedAt: daysAgo(200),
    refreshTokenExpiresAt: hoursFromNow(-24 * 150),
  });
  const alive = msRow({
    id: "acc-alive",
    updatedAt: daysAgo(1),
    refreshTokenExpiresAt: hoursFromNow(24 * 60),
  });

  interface BackgroundHarness {
    deps: BackgroundTokenDeps;
    /** Refresh tokens presented to Microsoft, in order. */
    presented: string[];
    /** Rows a refreshed pair was written into, in order. */
    savedInto: string[];
    saved: Array<{ rowId: string; refreshToken?: string }>;
  }

  /** `refusals` maps a refresh token to the error Microsoft answers it with. */
  function backgroundHarness(
    rows: BackgroundAccountRow[],
    refusals: Record<string, Error> = {},
  ): BackgroundHarness {
    const harness: BackgroundHarness = {
      presented: [],
      savedInto: [],
      saved: [],
      deps: {
        loadAccounts: async () => rows,
        refresh: async (refreshToken) => {
          harness.presented.push(refreshToken);
          const refusal = refusals[refreshToken];
          if (refusal) throw refusal;
          return {
            accessToken: `access-from-${refreshToken}`,
            accessTokenExpiresAt: hoursFromNow(1),
            refreshToken: `rotated-${refreshToken}`,
          };
        },
        saveRefreshed: async (row, refreshed) => {
          harness.savedInto.push(row.id);
          harness.saved.push({
            rowId: row.id,
            refreshToken: refreshed.refreshToken,
          });
        },
        now: () => MS_NOW,
      },
    };
    return harness;
  }

  /** Runs `run` with console.error captured, always restoring it. */
  async function captureConsoleErrors<T>(
    run: () => Promise<T>,
  ): Promise<{ result: T; logged: unknown[][] }> {
    const original = console.error;
    const logged: unknown[][] = [];
    console.error = (...args: unknown[]) => {
      logged.push(args);
    };
    try {
      return { result: await run(), logged };
    } finally {
      console.error = original;
    }
  }

  await check(
    "escolha da conta Microsoft: uma regra só, determinística",
    () => {
      assert.equal(pickMicrosoftAccount([]), null);
      assert.deepEqual(rankMicrosoftAccounts([]), []);

      // A dead row listed first loses to the live one, in either input order.
      assert.equal(
        pickMicrosoftAccount([deadOlderFirst, alive])?.id,
        "acc-alive",
      );
      assert.equal(
        pickMicrosoftAccount([alive, deadOlderFirst])?.id,
        "acc-alive",
      );

      // Having a refresh token beats everything else, even a later expiry.
      const noRefreshToken = msRow({
        id: "acc-none",
        refreshToken: null,
        refreshTokenExpiresAt: hoursFromNow(24 * 300),
        accessTokenExpiresAt: hoursFromNow(1),
        updatedAt: daysAgo(0),
      });
      assert.equal(
        pickMicrosoftAccount([noRefreshToken, deadOlderFirst])?.id,
        "acc-dead",
      );

      // Full ties are broken by id, never by the order the database returned.
      const twinA = msRow({ id: "acc-a", updatedAt: daysAgo(3) });
      const twinB = msRow({ id: "acc-b", updatedAt: daysAgo(3) });
      assert.equal(pickMicrosoftAccount([twinB, twinA])?.id, "acc-a");
      assert.equal(pickMicrosoftAccount([twinA, twinB])?.id, "acc-a");

      // Ranking does not reorder the caller's array.
      const input = [deadOlderFirst, alive];
      rankMicrosoftAccounts(input);
      assert.deepEqual(
        input.map((row) => row.id),
        ["acc-dead", "acc-alive"],
      );
    },
  );

  await check(
    "token em segundo plano: com duas linhas, usa a viva",
    async () => {
      const harness = backgroundHarness([deadOlderFirst, alive], {
        "refresh-acc-dead": entraRefusal(),
      });
      const { result, logged } = await captureConsoleErrors(() =>
        getBackgroundMicrosoftToken("user-1", harness.deps),
      );

      assert.equal(result, "access-from-refresh-acc-alive");
      // The ranking puts the live row first, so the dead one is never even tried.
      assert.deepEqual(harness.presented, ["refresh-acc-alive"]);
      // …and the rotated pair is written into the row it came from, not the dead one.
      assert.deepEqual(harness.savedInto, ["acc-alive"]);
      assert.equal(harness.saved[0]?.refreshToken, "rotated-refresh-acc-alive");
      assert.equal(logged.length, 0, "a success is not logged as a failure");
    },
  );

  await check(
    "token em segundo plano: se a escolhida falha no refresh, tenta a outra",
    async () => {
      // The ranking trusts stored dates, and a stale far-future expiry makes a
      // dead row look best. Microsoft's answer is what settles it.
      const lyingDead = msRow({
        id: "acc-lying",
        updatedAt: daysAgo(200),
        refreshTokenExpiresAt: hoursFromNow(24 * 900),
      });
      assert.equal(
        pickMicrosoftAccount([alive, lyingDead])?.id,
        "acc-lying",
        "fixture: the dead row ranks first",
      );

      const harness = backgroundHarness([alive, lyingDead], {
        "refresh-acc-lying": entraRefusal(),
      });
      const { result, logged } = await captureConsoleErrors(() =>
        getBackgroundMicrosoftToken("user-1", harness.deps),
      );

      assert.equal(result, "access-from-refresh-acc-alive");
      assert.deepEqual(harness.presented, [
        "refresh-acc-lying",
        "refresh-acc-alive",
      ]);
      assert.deepEqual(harness.savedInto, ["acc-alive"]);
      assert.equal(
        logged.length,
        0,
        "recovering on another row is not an error",
      );
    },
  );

  await check(
    "token em segundo plano: access token válido não gasta o refresh",
    async () => {
      const fresh = msRow({
        id: "acc-fresh",
        accessToken: "access-still-good",
        accessTokenExpiresAt: hoursFromNow(1),
      });
      const harness = backgroundHarness([fresh]);
      assert.equal(
        await getBackgroundMicrosoftToken("user-1", harness.deps),
        "access-still-good",
      );
      assert.deepEqual(harness.presented, []);

      // Inside the 5-minute skew it counts as expired.
      const expiring = msRow({
        id: "acc-expiring",
        accessToken: "access-about-to-die",
        accessTokenExpiresAt: new Date(MS_NOW + 2 * 60_000),
      });
      const second = backgroundHarness([expiring]);
      assert.equal(
        await getBackgroundMicrosoftToken("user-1", second.deps),
        "access-from-refresh-acc-expiring",
      );
      assert.deepEqual(second.savedInto, ["acc-expiring"]);
    },
  );

  await check(
    "token em segundo plano: sem linha, ou sem nenhuma que renove, devolve null sem lançar",
    async () => {
      const none = backgroundHarness([]);
      assert.equal(
        await getBackgroundMicrosoftToken("user-1", none.deps),
        null,
      );
      assert.deepEqual(none.presented, []);

      const bothDead = backgroundHarness(
        [deadOlderFirst, alive, msRow({ id: "acc-bare", refreshToken: null })],
        {
          "refresh-acc-dead": entraRefusal("AADSTS70000"),
          "refresh-acc-alive": entraRefusal("AADSTS700082"),
        },
      );
      const { result, logged } = await captureConsoleErrors(() =>
        getBackgroundMicrosoftToken("user-1", bothDead.deps),
      );

      assert.equal(result, null);
      assert.equal(logged.length, 1);

      const text = JSON.stringify(logged[0]);
      // What an operator needs: which rows, and why Microsoft refused each.
      for (const expected of [
        "acc-dead",
        "acc-alive",
        "acc-bare",
        "AADSTS70000",
        "AADSTS700082",
        "no_refresh_token",
      ]) {
        assert.ok(text.includes(expected), `log mentions ${expected}`);
      }
      // What must never reach a log.
      assert.ok(!text.includes("refresh-acc-"), "no refresh token in the log");
      assert.ok(!text.includes("@"), "no e-mail address in the log");

      // A failure reading the accounts is also contained.
      const broken: BackgroundTokenDeps = {
        ...bothDead.deps,
        loadAccounts: async () => {
          throw new Error("connection refused");
        },
      };
      const contained = await captureConsoleErrors(() =>
        getBackgroundMicrosoftToken("user-1", broken),
      );
      assert.equal(contained.result, null);
    },
  );

  await check("erro do Entra vira mensagem com o código AADSTS", async () => {
    assert.equal(parseAadstsCode(null), null);
    assert.equal(parseAadstsCode(undefined), null);
    assert.equal(parseAadstsCode(""), null);
    assert.equal(parseAadstsCode("invalid_grant, sem código"), null);
    assert.equal(
      parseAadstsCode("AADSTS70000: The scope is not valid."),
      "AADSTS70000",
    );
    // Only the first line counts: a code further down is not the reason.
    assert.equal(
      parseAadstsCode("sem código aqui\r\nTrace ID: x\r\nAADSTS99999: eco"),
      null,
    );

    const refusalText =
      "AADSTS70000: The provided grant is not valid.\r\n" +
      "Trace ID: 0a1b2c3d-trace\r\n" +
      "Correlation ID: 4e5f6a7b-correlation\r\n" +
      "Timestamp: 2026-10-08 12:00:00Z";
    const sentRefreshToken = "0.AAAA-secret-refresh-token";

    const originalFetch = globalThis.fetch;
    const originalId = process.env.MICROSOFT_CLIENT_ID;
    const originalSecret = process.env.MICROSOFT_CLIENT_SECRET;
    process.env.MICROSOFT_CLIENT_ID = "client-id-fixture";
    process.env.MICROSOFT_CLIENT_SECRET = "client-secret-fixture";

    try {
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            error: "invalid_grant",
            error_description: refusalText,
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );

      const refusal = await refreshMicrosoftAccessToken(sentRefreshToken).then(
        () => null,
        (error: unknown) => error,
      );
      assert.ok(refusal instanceof MicrosoftRefreshError);
      assert.equal(refusal.aadstsCode, "AADSTS70000");
      assert.equal(refusal.oauthError, "invalid_grant");
      assert.equal(refusal.status, 400);
      assert.match(refusal.message, /AADSTS70000/);
      assert.match(refusal.message, /invalid_grant/);
      assert.doesNotMatch(refusal.message, /Trace ID|Correlation ID|Timestamp/);
      assert.ok(!refusal.message.includes(sentRefreshToken));
      assert.ok(!refusal.message.includes("client-secret-fixture"));

      // A gateway page that is not JSON is still a refusal, not a crash.
      globalThis.fetch = async () =>
        new Response("<html>Bad gateway</html>", { status: 502 });
      const gateway = await refreshMicrosoftAccessToken(sentRefreshToken).then(
        () => null,
        (error: unknown) => error,
      );
      assert.ok(gateway instanceof MicrosoftRefreshError);
      assert.equal(gateway.aadstsCode, null);
      assert.equal(gateway.status, 502);
      assert.doesNotMatch(gateway.message, /Bad gateway/);

      // And a good answer still comes through, rotated token included.
      globalThis.fetch = async () =>
        new Response(
          JSON.stringify({
            access_token: "new-access",
            refresh_token: "new-refresh",
            expires_in: 3600,
            scope: "Calendars.Read offline_access",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      const refreshed = await refreshMicrosoftAccessToken(sentRefreshToken);
      assert.equal(refreshed.accessToken, "new-access");
      assert.equal(refreshed.refreshToken, "new-refresh");
      assert.deepEqual(refreshed.scopes, ["Calendars.Read", "offline_access"]);
    } finally {
      globalThis.fetch = originalFetch;
      if (originalId === undefined) delete process.env.MICROSOFT_CLIENT_ID;
      else process.env.MICROSOFT_CLIENT_ID = originalId;
      if (originalSecret === undefined) {
        delete process.env.MICROSOFT_CLIENT_SECRET;
      } else {
        process.env.MICROSOFT_CLIENT_SECRET = originalSecret;
      }
    }
  });

  await check(
    "whoami: token inutilizável vira tokenUsable false e needsReconnect true",
    async () => {
      const linked = async () => ({ connected: true, needsReconnect: false });

      const unusable = await getMicrosoftConnectionStatus("user-1", {
        loadConnection: linked,
        loadToken: async () => null,
      });
      assert.deepEqual(unusable, {
        connected: true,
        needsReconnect: true,
        tokenUsable: false,
      });

      // A token lookup that throws is the same as no token.
      const throwing = await getMicrosoftConnectionStatus("user-1", {
        loadConnection: linked,
        loadToken: async () => {
          throw new Error("boom");
        },
      });
      assert.equal(throwing.tokenUsable, false);
      assert.equal(throwing.needsReconnect, true);

      const usable = await getMicrosoftConnectionStatus("user-1", {
        loadConnection: linked,
        loadToken: async () => "access",
      });
      assert.deepEqual(usable, {
        connected: true,
        needsReconnect: false,
        tokenUsable: true,
      });

      // The stored expiry still counts: a token in hand does not hide a grant that
      // is known to have lapsed.
      const lapsing = await getMicrosoftConnectionStatus("user-1", {
        loadConnection: async () => ({ connected: true, needsReconnect: true }),
        loadToken: async () => "access",
      });
      assert.equal(lapsing.needsReconnect, true);

      // No Microsoft account: nothing to reconnect and no token to ask for.
      let asked = false;
      const absent = await getMicrosoftConnectionStatus("user-1", {
        loadConnection: async () => ({
          connected: false,
          needsReconnect: false,
        }),
        loadToken: async () => {
          asked = true;
          return "access";
        },
      });
      assert.deepEqual(absent, {
        connected: false,
        needsReconnect: false,
        tokenUsable: false,
      });
      assert.equal(asked, false, "no refresh is attempted without an account");

      // The shape that reaches the assistant validates, and tokenUsable is required.
      const whoami = buildWhoamiData({
        principal: me,
        timezone: "America/Sao_Paulo",
        summary: {
          date: day,
          totalMinutes: 0,
          dailyCapacityMinutes: 480,
          weeklyCapacityMinutes: 2400,
        },
        microsoft: unusable,
        integrations: {
          azureDevOps: { configured: false },
          eveningDigestEnabled: false,
        },
      });
      assertConforms(
        "whoami com token inutilizável",
        whoami,
        WHOAMI_OUTPUT_SCHEMA,
      );
      assert.equal(whoami.microsoft.tokenUsable, false);
      assert.equal(whoami.microsoft.needsReconnect, true);

      const withoutFlag = {
        ...whoami,
        microsoft: { connected: true, needsReconnect: true },
      };
      assert.notEqual(
        validateAgainstSchema(withoutFlag, WHOAMI_OUTPUT_SCHEMA).length,
        0,
        "a whoami without tokenUsable is rejected",
      );
    },
  );

  await check(
    "limpeza de contas duplicadas: só planeja, e só o que é seguro",
    () => {
      const row = (
        overrides: Partial<MicrosoftAccountRow> & {
          id: string;
          userId: string;
        },
      ): MicrosoftAccountRow => ({
        accountId: `sub-${overrides.id}`,
        refreshToken: `refresh-${overrides.id}`,
        refreshTokenExpiresAt: null,
        accessTokenExpiresAt: null,
        updatedAt: daysAgo(1),
        ...overrides,
      });
      const now = new Date(MS_NOW);

      const plans = planDuplicateCleanup(
        [
          // u2: one live row, one abandoned, one dead-but-recent.
          row({
            id: "u2-live",
            userId: "u2",
            refreshTokenExpiresAt: hoursFromNow(500),
          }),
          row({
            id: "u2-old",
            userId: "u2",
            updatedAt: daysAgo(STALE_ACCOUNT_DAYS + 1),
          }),
          row({ id: "u2-recent", userId: "u2", updatedAt: daysAgo(10) }),
          // u1: a single row is never listed.
          row({ id: "u1-only", userId: "u1", updatedAt: daysAgo(400) }),
          // u3: exactly on the boundary is NOT stale (> 90, not >= 90).
          row({
            id: "u3-live",
            userId: "u3",
            refreshTokenExpiresAt: hoursFromNow(500),
          }),
          row({
            id: "u3-edge",
            userId: "u3",
            updatedAt: daysAgo(STALE_ACCOUNT_DAYS),
          }),
        ],
        now,
      );

      assert.deepEqual(
        plans.map((plan) => plan.userId),
        ["u2", "u3"],
        "single-row users are omitted; plans are ordered by user",
      );

      const decisions = (userId: string): Record<string, string> =>
        Object.fromEntries(
          (plans.find((plan) => plan.userId === userId)?.rows ?? []).map(
            (entry) => [entry.row.id, entry.decision],
          ),
        );

      assert.deepEqual(decisions("u2"), {
        "u2-live": "keep-selected",
        "u2-old": "remove-candidate",
        "u2-recent": "keep-recent",
      });
      assert.deepEqual(decisions("u3"), {
        "u3-live": "keep-selected",
        "u3-edge": "keep-recent",
      });

      // The kept row leads each plan, and it is the one the app itself would use.
      const u2 = plans[0];
      assert.equal(u2?.rows[0]?.row.id, "u2-live");
      assert.equal(
        pickMicrosoftAccount(u2?.rows.map((entry) => entry.row) ?? [])?.id,
        u2?.rows[0]?.row.id,
      );

      // The selected row is never a candidate, however old.
      const allStale = planDuplicateCleanup(
        [
          row({ id: "x-a", userId: "x", updatedAt: daysAgo(500) }),
          row({ id: "x-b", userId: "x", updatedAt: daysAgo(600) }),
        ],
        now,
      );
      const decided = allStale[0]?.rows.map((entry) => entry.decision);
      assert.deepEqual(decided, ["keep-selected", "remove-candidate"]);
    },
  );

  console.log(`\nassistant gateway OK — ${passed} checks passed`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
