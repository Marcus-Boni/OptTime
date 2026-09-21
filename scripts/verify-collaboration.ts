/**
 * Guards the meeting-normalization rules of Registro por Colaboração.
 *
 * The whole feature rests on one pure function deciding what on a calendar is
 * real work. That decision is invisible in the type system and expensive to
 * check by hand — a leader's agenda is a mess of declined invitations, moved
 * occurrences and double bookings, and every mistake either invents hours
 * nobody worked or hides hours somebody did.
 *
 * This script runs that function against a synthetic but realistic day and
 * fails when a rule regresses.
 *
 * Run with: pnpm verify:collaboration
 */

import {
  parseIsoDurationMinutes,
  summarizeActivityRows,
} from "../src/lib/collaboration/analytics";
import {
  isAwayOn,
  parseAwayPeriod,
  parseClockMinutes,
  parseWorkingHours,
  resolveDailyTarget,
  resolveTimeZone,
} from "../src/lib/collaboration/mailbox";
import {
  buildMeetingSignals,
  type RawCalendarEvent,
} from "../src/lib/collaboration/meetings";
import {
  buildMeetingTitle,
  joinNames,
  shortenName,
} from "../src/lib/collaboration/naming";
import type { MeetingParticipant } from "../src/types/collaboration";

const DOMAIN = "@optsolv.com.br";
const ME = "lider@optsolv.com.br";

const problems: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (!condition) {
    problems.push(detail ? `${label} — ${detail}` : label);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────

function attendee(name: string, email: string, response = "accepted") {
  return { name, email, type: "required", response };
}

function event(
  overrides: Partial<RawCalendarEvent> & Pick<RawCalendarEvent, "id">,
): RawCalendarEvent {
  return {
    subject: "Reunião",
    startIso: "2026-09-02T13:00:00.000Z",
    endIso: "2026-09-02T14:00:00.000Z",
    isAllDay: false,
    isCancelled: false,
    isOrganizer: false,
    showAs: "busy",
    sensitivity: "normal",
    type: "singleInstance",
    seriesMasterId: null,
    originalStartIso: null,
    isOnlineMeeting: true,
    onlineMeetingProvider: "teamsForBusiness",
    responseStatus: "accepted",
    attendees: [],
    ...overrides,
  };
}

/** One messy day of a lead: 9 calendar rows, only 4 of them real work. */
const MESSY_DAY: RawCalendarEvent[] = [
  event({
    id: "ok-1on1",
    subject: "Sync",
    startIso: "2026-09-02T12:00:00.000Z",
    endIso: "2026-09-02T12:45:00.000Z",
    attendees: [
      attendee("Marcus Boni Galvão", "marcus.boni@optsolv.com.br"),
      attendee("Líder", ME),
    ],
  }),
  event({
    id: "ok-ritual",
    subject: "Comitê Semanal de Produto",
    startIso: "2026-09-02T13:00:00.000Z",
    endIso: "2026-09-02T14:00:00.000Z",
    type: "occurrence",
    seriesMasterId: "series-comite",
    attendees: [
      attendee("Ana Ribeiro", "ana@optsolv.com.br"),
      attendee("Bruno Lima", "bruno@optsolv.com.br"),
      attendee("Carla Souza", "carla@optsolv.com.br"),
    ],
  }),
  event({
    id: "ok-external-exception",
    subject: "Apresentação de proposta",
    startIso: "2026-09-02T16:00:00.000Z",
    endIso: "2026-09-02T17:00:00.000Z",
    type: "exception",
    seriesMasterId: "series-cliente",
    isOrganizer: true,
    responseStatus: "organizer",
    attendees: [
      attendee("Diretor Cliente", "diretor@clientex.com.br"),
      attendee("Ana Ribeiro", "ana@optsolv.com.br"),
    ],
  }),
  event({
    id: "ok-untitled",
    subject: "   ",
    startIso: "2026-09-02T18:00:00.000Z",
    endIso: "2026-09-02T18:30:00.000Z",
    attendees: [attendee("Marcus Boni Galvão", "marcus.boni@optsolv.com.br")],
  }),
  // ── Everything below must be excluded ──
  event({ id: "x-cancelled", subject: "Retro cancelada", isCancelled: true }),
  event({
    id: "x-declined",
    subject: "Reunião que recusei",
    startIso: "2026-09-02T15:00:00.000Z",
    endIso: "2026-09-02T15:30:00.000Z",
    responseStatus: "declined",
  }),
  event({
    id: "x-free",
    subject: "Bloco de foco",
    startIso: "2026-09-02T19:00:00.000Z",
    endIso: "2026-09-02T20:00:00.000Z",
    showAs: "free",
  }),
  event({
    id: "x-series-master",
    subject: "Daily (regra)",
    type: "seriesMaster",
    seriesMasterId: null,
  }),
  // Fully inside ok-ritual: the lead cannot have been in both.
  event({
    id: "x-overlap",
    subject: "Call paralela",
    startIso: "2026-09-02T13:10:00.000Z",
    endIso: "2026-09-02T13:50:00.000Z",
    responseStatus: "notResponded",
    attendees: [attendee("Bruno Lima", "bruno@optsolv.com.br")],
  }),
];

// ─── Meeting normalization ────────────────────────────────────────────

function verifyMeetings(): void {
  const { meetings, exclusions } = buildMeetingSignals({
    events: MESSY_DAY,
    userEmail: ME,
    internalDomain: DOMAIN,
    existingDescriptions: [],
  });

  const ids = new Set(meetings.map((meeting) => meeting.id));
  const excludedBy = new Map(
    exclusions.map((exclusion) => [exclusion.id, exclusion.reason]),
  );

  check(
    "keeps exactly the four real meetings",
    meetings.length === 4,
    `got ${meetings.length}: ${[...ids].join(", ")}`,
  );

  for (const [id, reason] of [
    ["x-cancelled", "cancelled"],
    ["x-declined", "declined"],
    ["x-free", "free_time"],
    ["x-series-master", "series_master"],
    ["x-overlap", "overlapped"],
  ] as const) {
    check(
      `excludes ${id} as "${reason}"`,
      excludedBy.get(id) === reason,
      `got "${excludedBy.get(id) ?? "kept"}"`,
    );
  }

  const oneOnOne = meetings.find((meeting) => meeting.id === "ok-1on1");
  check("1:1 is detected as one_on_one", oneOnOne?.shape === "one_on_one");
  check(
    'a boilerplate subject ("Sync") loses to the participant name',
    oneOnOne?.title === "Reunião com Marcus Boni",
    `got "${oneOnOne?.title}"`,
  );
  check(
    "a meaningful 1:1 subject keeps its name and gains the person",
    buildMeetingTitle({
      subject: "Feedback de carreira",
      participants: [
        {
          name: "Marcus Boni Galvão",
          email: "marcus.boni@optsolv.com.br",
          isExternal: false,
          isOptional: false,
        },
      ],
      participantCount: 1,
      shape: "one_on_one",
      isOrganizer: false,
    }) === "Feedback de carreira — com Marcus Boni",
  );
  check(
    "the signed-in user is not listed as their own participant",
    oneOnOne?.participantCount === 1,
    `got ${oneOnOne?.participantCount}`,
  );
  check(
    "45 minutes survive rounding",
    oneOnOne?.minutes === 45,
    `got ${oneOnOne?.minutes}`,
  );

  const ritual = meetings.find((meeting) => meeting.id === "ok-ritual");
  check("recurring occurrence is a ritual", ritual?.shape === "ritual");
  check("recurring occurrence is flagged", ritual?.isRecurring === true);
  check("plain occurrence is not an exception", ritual?.isException === false);
  check(
    "a named subject wins over the participant list",
    ritual?.title === "Comitê Semanal de Produto",
    `got "${ritual?.title}"`,
  );

  const external = meetings.find(
    (meeting) => meeting.id === "ok-external-exception",
  );
  check("moved occurrence is flagged", external?.isException === true);
  check(
    "external participant is counted",
    external?.externalCount === 1,
    `got ${external?.externalCount}`,
  );
  check("organizer acceptance wins", external?.acceptance === "organizer");

  const untitled = meetings.find((meeting) => meeting.id === "ok-untitled");
  check(
    "an empty subject becomes a name-based title",
    untitled?.title === "Reunião com Marcus Boni",
    `got "${untitled?.title}"`,
  );

  // ── Already-logged guard ──
  const second = buildMeetingSignals({
    events: MESSY_DAY,
    userEmail: ME,
    internalDomain: DOMAIN,
    existingDescriptions: ["Comitê Semanal de Produto"],
  });
  check(
    "a logged meeting is not proposed twice",
    second.meetings.every((meeting) => meeting.id !== "ok-ritual") &&
      second.exclusions.some(
        (exclusion) =>
          exclusion.id === "ok-ritual" && exclusion.reason === "already_logged",
      ),
    "ok-ritual came back after being logged",
  );

  // ── keepLogged: the picker sees the whole day, marked ──
  const kept = buildMeetingSignals({
    events: MESSY_DAY,
    userEmail: ME,
    internalDomain: DOMAIN,
    existingDescriptions: ["Comitê Semanal de Produto"],
    keepLogged: true,
  });
  const keptRitual = kept.meetings.find(
    (meeting) => meeting.id === "ok-ritual",
  );
  check(
    "keepLogged keeps a logged meeting in the list, flagged",
    keptRitual?.alreadyLogged === true,
    keptRitual ? "flag not set" : "meeting was dropped",
  );
  check(
    "keepLogged does not report it as an exclusion",
    !kept.exclusions.some((exclusion) => exclusion.id === "ok-ritual"),
  );
  check(
    "without keepLogged the same meeting is unflagged and absent",
    meetings.every((meeting) => meeting.alreadyLogged === false),
  );

  // ── An already-logged meeting still owns its slot ──
  const overlapsLogged = buildMeetingSignals({
    events: [
      event({
        id: "logged",
        subject: "Comitê Semanal de Produto",
        startIso: "2026-09-02T13:00:00.000Z",
        endIso: "2026-09-02T14:00:00.000Z",
        responseStatus: "organizer",
        isOrganizer: true,
      }),
      event({
        id: "shadow",
        subject: "Call paralela",
        startIso: "2026-09-02T13:00:00.000Z",
        endIso: "2026-09-02T14:00:00.000Z",
        responseStatus: "notResponded",
      }),
    ],
    userEmail: ME,
    internalDomain: DOMAIN,
    existingDescriptions: ["Comitê Semanal de Produto"],
  });
  check(
    "a logged meeting still blocks the hour it occupies",
    overlapsLogged.meetings.length === 0 &&
      overlapsLogged.exclusions.some(
        (exclusion) =>
          exclusion.id === "shadow" && exclusion.reason === "overlapped",
      ),
    `kept ${overlapsLogged.meetings.map((meeting) => meeting.id).join(", ")}`,
  );

  // ── Partial overlap clips instead of dropping ──
  const clipped = buildMeetingSignals({
    events: [
      event({
        id: "strong",
        subject: "Reunião principal",
        startIso: "2026-09-02T13:00:00.000Z",
        endIso: "2026-09-02T14:00:00.000Z",
        responseStatus: "organizer",
        isOrganizer: true,
        attendees: [attendee("Ana Ribeiro", "ana@optsolv.com.br")],
      }),
      event({
        id: "weak",
        subject: "Reunião secundária",
        startIso: "2026-09-02T13:30:00.000Z",
        endIso: "2026-09-02T14:30:00.000Z",
        responseStatus: "notResponded",
      }),
    ],
    userEmail: ME,
    internalDomain: DOMAIN,
    existingDescriptions: [],
  });

  const weak = clipped.meetings.find((meeting) => meeting.id === "weak");
  check(
    "a partly overlapping meeting is clipped to its free half hour",
    weak?.minutes === 30 && weak.wasClipped === true,
    `got ${weak?.minutes} minutes, clipped=${weak?.wasClipped}`,
  );
  check(
    "no double counting across the overlap",
    clipped.meetings.reduce((sum, meeting) => sum + meeting.minutes, 0) === 90,
    "total minutes should be 90",
  );
}

// ─── Naming ───────────────────────────────────────────────────────────

function participant(name: string, email: string): MeetingParticipant {
  return { name, email, isExternal: false, isOptional: false };
}

function verifyNaming(): void {
  check(
    "shortens to first name plus surname",
    shortenName("Marcus Boni Galvão Silva") === "Marcus Boni",
    `got "${shortenName("Marcus Boni Galvão Silva")}"`,
  );
  check(
    "skips prepositions when picking the surname",
    shortenName("Ana de Souza Ribeiro") === "Ana Souza",
    `got "${shortenName("Ana de Souza Ribeiro")}"`,
  );
  check(
    "rebuilds a name from an e-mail handle",
    shortenName("marcus.boni") === "Marcus Boni",
    `got "${shortenName("marcus.boni")}"`,
  );
  check(
    "joins two names with 'e'",
    joinNames(["Ana", "Bruno"]) === "Ana e Bruno",
  );
  check(
    "joins three names the Portuguese way",
    joinNames(["Ana", "Bruno", "Carla"]) === "Ana, Bruno e Carla",
  );

  const many = buildMeetingTitle({
    subject: "reunião",
    participants: [
      participant("Ana Ribeiro", "ana@optsolv.com.br"),
      participant("Bruno Lima", "bruno@optsolv.com.br"),
      participant("Carla Souza", "carla@optsolv.com.br"),
      participant("Diego Alves", "diego@optsolv.com.br"),
    ],
    participantCount: 4,
    shape: "small_group",
    isOrganizer: false,
  });
  check(
    "a crowded title collapses into a count",
    many === "Reunião com Ana Ribeiro e Bruno Lima e +2",
    `got "${many}"`,
  );

  const led = buildMeetingTitle({
    subject: "",
    participants: [participant("Ana Ribeiro", "ana@optsolv.com.br")],
    participantCount: 1,
    shape: "one_on_one",
    isOrganizer: true,
  });
  check(
    "organizing shows up in the title",
    led === "Reunião que conduzi com Ana Ribeiro",
    `got "${led}"`,
  );
}

// ─── Viva Insights parsing ────────────────────────────────────────────

function verifyAnalytics(): void {
  check("parses PT1H30M", parseIsoDurationMinutes("PT1H30M") === 90);
  check("parses PT45M", parseIsoDurationMinutes("PT45M") === 45);
  check("parses P1DT2H", parseIsoDurationMinutes("P1DT2H") === 1560);
  check("parses seconds", parseIsoDurationMinutes("PT90S") === 2);
  check("survives garbage", parseIsoDurationMinutes("nonsense") === 0);
  check("survives undefined", parseIsoDurationMinutes(undefined) === 0);

  const slices = summarizeActivityRows([
    { activity: "Meeting", duration: "PT2H" },
    { activity: "meeting", duration: "PT30M" },
    { activity: "Chat", duration: "PT45M" },
    { activity: "Unknown", duration: "PT10H" },
    { activity: "Focus", duration: "bad" },
  ]);

  check(
    "folds repeated activities into one slice",
    slices.find((slice) => slice.kind === "meeting")?.minutes === 150,
    JSON.stringify(slices),
  );
  check(
    "drops unknown activities and unparseable durations",
    slices.length === 2,
    JSON.stringify(slices),
  );
  check(
    "orders slices by weight",
    slices[0]?.kind === "meeting",
    JSON.stringify(slices),
  );

  // The upper bound cannot be sent to Graph — it rejects `lt` on endDate — so
  // selecting the day happens here. Getting this wrong silently sums a whole
  // week into one day's portrait.
  const multiDay = [
    { activity: "Meeting", duration: "PT1H", startDate: "2026-09-09" },
    { activity: "Meeting", duration: "PT3H", startDate: "2026-09-10" },
    { activity: "Chat", duration: "PT30M", startDate: "2026-09-09" },
  ];

  const oneDay = summarizeActivityRows(multiDay, "2026-09-09");
  check(
    "keeps only the requested day",
    oneDay.find((slice) => slice.kind === "meeting")?.minutes === 60,
    JSON.stringify(oneDay),
  );
  check(
    "sums every activity of that day",
    oneDay.reduce((total, slice) => total + slice.minutes, 0) === 90,
    JSON.stringify(oneDay),
  );
  check(
    "without a date, keeps every row",
    summarizeActivityRows(multiDay).find((slice) => slice.kind === "meeting")
      ?.minutes === 240,
  );
  check(
    "a row without startDate is never dropped",
    summarizeActivityRows(
      [{ activity: "Focus", duration: "PT2H" }],
      "2026-09-09",
    ).length === 1,
  );
}

// ─── Mailbox: working hours, timezone, out of office ──────────────────

function verifyMailbox(): void {
  // Timezones — Graph speaks Windows, Intl speaks IANA.
  check(
    "maps the Brazilian Windows timezone",
    resolveTimeZone("E. South America Standard Time") === "America/Sao_Paulo",
    `got "${resolveTimeZone("E. South America Standard Time")}"`,
  );
  check(
    "passes an IANA name through untouched",
    resolveTimeZone("America/Sao_Paulo") === "America/Sao_Paulo",
  );
  check(
    "returns null for an unknown zone instead of guessing",
    resolveTimeZone("Middle Earth Standard Time") === null,
  );
  check("returns null for empty input", resolveTimeZone("  ") === null);

  // Clock parsing.
  check(
    "parses the Graph clock format",
    parseClockMinutes("09:00:00.0000000") === 540,
  );
  check("parses a half hour", parseClockMinutes("17:30:00.0000000") === 1050);
  check("rejects garbage", parseClockMinutes("nope") === null);
  check("rejects an impossible hour", parseClockMinutes("99:00:00") === null);

  // Working hours.
  const hours = parseWorkingHours({
    daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday"],
    startTime: "09:00:00.0000000",
    endTime: "18:00:00.0000000",
    timeZone: { name: "E. South America Standard Time" },
  });
  check(
    "maps weekday names to ISO numbers",
    JSON.stringify(hours?.daysOfWeek) === "[1,2,3,4,5]",
    JSON.stringify(hours?.daysOfWeek),
  );
  check("computes the working window", hours?.windowMinutes === 540);
  check(
    "resolves the working-hours timezone",
    hours?.timeZone === "America/Sao_Paulo",
  );
  check(
    "rejects an inverted window",
    parseWorkingHours({
      daysOfWeek: ["monday"],
      startTime: "18:00:00",
      endTime: "09:00:00",
    }) === null,
  );

  // ── The target arithmetic — where a mistake hits everybody ──
  const MONDAY = "2026-09-07";
  const FRIDAY = "2026-09-11";
  const SUNDAY = "2026-09-13";

  const noMailbox = resolveDailyTarget(40, null, MONDAY);
  check(
    "without the mailbox, keeps the historical 40h ÷ 5",
    noMailbox.minutes === 480 && noMailbox.basis === "weekly_capacity",
    `got ${noMailbox.minutes} (${noMailbox.basis})`,
  );

  const fiveDay = resolveDailyTarget(40, hours, MONDAY);
  check(
    "a 09:00–18:00 five-day week still targets 8h, not the 9h window",
    fiveDay.minutes === 480 && fiveDay.basis === "working_hours",
    `got ${fiveDay.minutes} — the window must cap, never inflate`,
  );

  const fourDayHours = parseWorkingHours({
    daysOfWeek: ["monday", "tuesday", "wednesday", "thursday"],
    startTime: "09:00:00",
    endTime: "18:00:00",
  });
  const fourDay = resolveDailyTarget(40, fourDayHours, MONDAY);
  check(
    "a four-day week spreads 40h over four days, capped by the window",
    fourDay.minutes === 540 && fourDay.workingDaysPerWeek === 4,
    `got ${fourDay.minutes} over ${fourDay.workingDaysPerWeek} days`,
  );

  const offDay = resolveDailyTarget(40, fourDayHours, FRIDAY);
  check(
    "a non-working weekday targets zero",
    offDay.minutes === 0 &&
      offDay.isWorkingDay === false &&
      offDay.basis === "non_working_day",
    `got ${offDay.minutes}, isWorkingDay=${offDay.isWorkingDay}`,
  );

  check(
    "Sunday is off for a Mon–Fri week",
    resolveDailyTarget(40, hours, SUNDAY).isWorkingDay === false,
  );
  check(
    "a part-time 20h week halves the day",
    resolveDailyTarget(20, hours, MONDAY).minutes === 240,
    `got ${resolveDailyTarget(20, hours, MONDAY).minutes}`,
  );

  // ── Out of office ──
  check(
    "an always-on auto-reply covers any day",
    isAwayOn({ kind: "always", startIso: null, endIso: null }, MONDAY),
  );
  check(
    "a scheduled absence covers a day inside it",
    isAwayOn(
      {
        kind: "scheduled",
        startIso: "2026-09-07T00:00:00.000Z",
        endIso: "2026-09-14T00:00:00.000Z",
      },
      "2026-09-10",
    ),
  );
  check(
    "a scheduled absence does not cover a day after it",
    !isAwayOn(
      {
        kind: "scheduled",
        startIso: "2026-09-07T00:00:00.000Z",
        endIso: "2026-09-09T00:00:00.000Z",
      },
      "2026-09-10",
    ),
  );
  check(
    "a half-day auto-reply still counts as away",
    isAwayOn(
      {
        kind: "scheduled",
        startIso: "2026-09-10T17:00:00.000Z",
        endIso: "2026-09-10T21:00:00.000Z",
      },
      "2026-09-10",
    ),
  );
  check("no auto-reply is never away", !isAwayOn(null, MONDAY));
  check(
    "a disabled auto-reply parses to null",
    parseAwayPeriod({ status: "disabled" }) === null,
  );
}

// ─── Entry point ──────────────────────────────────────────────────────

function main(): void {
  verifyMeetings();
  verifyNaming();
  verifyAnalytics();
  verifyMailbox();

  if (problems.length > 0) {
    console.error("\nRegistro por Colaboração — regras quebradas:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log("collaboration rules OK");
}

main();
