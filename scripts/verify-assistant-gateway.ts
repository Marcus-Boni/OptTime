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
  const { resolveDayContext } = await import("@/lib/mcp/service/day-context");
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
        microsoft: { connected: true, needsReconnect: false },
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
    const okMailbox = (
      overrides: Partial<import("@/types/collaboration").MailboxProfile>,
    ): import("@/types/collaboration").MailboxProfile => ({
      workingHours: null,
      timeZone: null,
      away: null,
      availability: "ok",
      ...overrides,
    });

    // 2026-10-07 is a Wednesday; 2026-10-10 a Saturday.
    assert.deepEqual(
      resolveDayContext({ ...base, date: "2026-10-07", mailbox: null }),
      { isWorkday: true, targetMinutes: 480 },
      "Graph unreachable falls back to the weekly capacity",
    );
    assert.deepEqual(
      resolveDayContext({ ...base, date: "2026-10-10", mailbox: null }),
      { isWorkday: false, targetMinutes: 0 },
    );
    assert.deepEqual(
      resolveDayContext({
        ...base,
        date: "2026-10-07",
        mailbox: okMailbox({
          workingHours: {
            daysOfWeek: [1, 2, 3, 4],
            startMinute: 540,
            endMinute: 1080,
            windowMinutes: 540,
            timeZone: null,
          },
        }),
      }),
      // 40h spread over four days is 600 min, capped by the 9h window.
      { isWorkday: true, targetMinutes: 540 },
      "the target follows the days the person works in Outlook",
    );
    assert.deepEqual(
      resolveDayContext({
        ...base,
        date: "2026-10-09", // Friday, off in a four-day week
        mailbox: okMailbox({
          workingHours: {
            daysOfWeek: [1, 2, 3, 4],
            startMinute: 540,
            endMinute: 1080,
            windowMinutes: 540,
            timeZone: null,
          },
        }),
      }),
      { isWorkday: false, targetMinutes: 0 },
    );
    assert.deepEqual(
      resolveDayContext({
        ...base,
        date: "2026-10-07",
        mailbox: okMailbox({
          away: { kind: "always", startIso: null, endIso: null },
        }),
      }),
      { isWorkday: false, targetMinutes: 0 },
      "an out-of-office period is not a working day",
    );
  });

  console.log(`\nassistant gateway OK — ${passed} checks passed`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
