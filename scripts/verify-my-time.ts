/**
 * Guards the period arithmetic behind Meu Tempo.
 *
 * Everything the page claims — how much of the week was meetings, which ritual
 * costs the most, whether a two-hour block ever existed — comes out of a
 * handful of pure functions. None of it is visible in the type system, and all
 * of it is the kind of arithmetic that silently drifts: an off-by-one in the
 * focus-block scan or a double-counted overlap produces a page that looks
 * perfectly plausible and is wrong.
 *
 * Run with: pnpm verify:my-time
 */

import {
  buildPeriodInsights,
  resolveRhythm,
} from "../src/lib/collaboration/insights";
import {
  buildDeterministicNarrative,
  buildFactSheet,
} from "../src/lib/collaboration/narrative";
import {
  buildCollaborators,
  buildMeetingLedger,
  buildRituals,
  buildTimeShape,
  enumerateDates,
  formatPeriodLabel,
  localMinutesOfDay,
  mergeSlices,
  weekdayOf,
} from "../src/lib/collaboration/period";
import {
  endOfMonth,
  resolvePeriodRange,
  shiftRange,
  startOfWeek,
} from "../src/lib/collaboration/period-presets";
import {
  buildAzureDevOpsStatus,
  buildCalendarStatus,
  buildMailboxStatus,
  buildPortraitStatus,
  issuesOf,
  needsReauth,
} from "../src/lib/collaboration/source-status";
import type {
  CollaborationPeriod,
  MeetingExclusion,
  MeetingParticipant,
  MeetingSignal,
  PeriodDay,
  WorkingHours,
} from "../src/types/collaboration";

const TZ = "America/Sao_Paulo";
const problems: string[] = [];

function check(label: string, condition: boolean, detail?: string): void {
  if (!condition) {
    problems.push(detail ? `${label} — ${detail}` : label);
  }
}

// ─── Fixtures ─────────────────────────────────────────────────────────

function person(
  name: string,
  email: string,
  isExternal = false,
): MeetingParticipant {
  return { name, email, isExternal, isOptional: false };
}

function meeting(
  overrides: Partial<MeetingSignal> & Pick<MeetingSignal, "id" | "startIso">,
): MeetingSignal {
  const minutes = overrides.minutes ?? 60;
  const start = new Date(overrides.startIso).getTime();

  return {
    seriesId: null,
    title: "Reunião",
    subject: "Reunião",
    endIso: new Date(start + minutes * 60_000).toISOString(),
    minutes,
    scheduledMinutes: minutes,
    participants: [],
    participantCount: 0,
    externalCount: 0,
    acceptance: "accepted",
    shape: "small_group",
    isOnline: true,
    isOrganizer: false,
    isRecurring: false,
    isException: false,
    wasRescheduled: false,
    originalStartIso: null,
    wasClipped: false,
    alreadyLogged: false,
    confidence: "high",
    evidence: "",
    ...overrides,
  };
}

function day(date: string, overrides: Partial<PeriodDay> = {}): PeriodDay {
  return {
    date,
    weekday: weekdayOf(date),
    isWorkingDay: true,
    targetMinutes: 480,
    loggedMinutes: 0,
    meetingMinutes: 0,
    meetingCount: 0,
    focusMinutes: 0,
    collaborationMinutes: 0,
    callMinutes: 0,
    hasPortrait: false,
    away: false,
    ...overrides,
  };
}

/** 09:00–18:00 in São Paulo, Monday to Friday. */
const WORKING_HOURS: WorkingHours = {
  daysOfWeek: [1, 2, 3, 4, 5],
  startMinute: 9 * 60,
  endMinute: 18 * 60,
  windowMinutes: 9 * 60,
  timeZone: TZ,
};

/**
 * A realistic Monday: two meetings glued together in the morning, one in the
 * afternoon, one after hours — plus a Saturday nobody should be working.
 *
 * Local times (UTC-3): 09:00, 10:00, 14:00, 19:00 on Monday; 10:00 Saturday.
 */
const MONDAY = "2026-09-14";
const SATURDAY = "2026-09-19";

const ANA = person("Ana Lima", "ana@optsolv.com.br");
const BRUNO = person("Bruno Sá", "bruno@optsolv.com.br");
const CLIENTE = person("Carla Nunes", "carla@cliente.com.br", true);

const MEETINGS: MeetingSignal[] = [
  meeting({
    id: "m1",
    startIso: "2026-09-14T12:00:00.000Z",
    seriesId: "daily",
    subject: "Daily do time",
    isRecurring: true,
    isOrganizer: true,
    participants: [ANA, BRUNO],
    participantCount: 2,
  }),
  meeting({
    id: "m2",
    startIso: "2026-09-14T13:00:00.000Z",
    subject: "Alinhamento de escopo",
    shape: "one_on_one",
    participants: [ANA],
    participantCount: 1,
  }),
  meeting({
    id: "m3",
    startIso: "2026-09-14T17:00:00.000Z",
    subject: "Reunião com cliente",
    participants: [CLIENTE],
    participantCount: 1,
    externalCount: 1,
  }),
  meeting({
    id: "m4",
    startIso: "2026-09-14T22:00:00.000Z",
    minutes: 30,
    subject: "Retorno urgente",
    acceptance: "tentative",
  }),
  meeting({
    id: "m5",
    startIso: "2026-09-19T13:00:00.000Z",
    seriesId: "daily",
    subject: "Daily do time",
    isRecurring: true,
    isOrganizer: true,
    wasRescheduled: true,
    originalStartIso: "2026-09-19T12:00:00.000Z",
    participants: [ANA, BRUNO],
    participantCount: 2,
  }),
];

const EXCLUSIONS: MeetingExclusion[] = [
  { id: "x1", subject: "Daily do time", reason: "cancelled", minutes: 30 },
  { id: "x2", subject: "Comitê mensal", reason: "declined", minutes: 60 },
  { id: "x3", subject: "Paralela", reason: "overlapped", minutes: 45 },
  { id: "x4", subject: "Daily do time", reason: "series_master", minutes: 30 },
  { id: "x5", subject: "Pessoal", reason: "private", minutes: 30 },
];

const DAYS: PeriodDay[] = [
  day("2026-09-14", { loggedMinutes: 300, meetingMinutes: 210 }),
  day("2026-09-15"),
  day("2026-09-16"),
  day("2026-09-17"),
  day("2026-09-18"),
  day(SATURDAY, { isWorkingDay: false, targetMinutes: 0, meetingMinutes: 60 }),
  day("2026-09-20", { isWorkingDay: false, targetMinutes: 0 }),
];

// ─── Calendar helpers ─────────────────────────────────────────────────

function verifyCalendarHelpers(): void {
  check(
    "enumerateDates is inclusive on both ends",
    enumerateDates("2026-09-14", "2026-09-20").length === 7,
  );
  check(
    "a single-day range yields one date",
    enumerateDates("2026-09-14", "2026-09-14").join() === "2026-09-14",
  );
  check(
    "enumerateDates never runs past the hard cap",
    enumerateDates("2026-01-01", "2026-12-31").length === 62,
  );

  check("14/09/2026 is a Monday", weekdayOf("2026-09-14") === 1);
  check("19/09/2026 is a Saturday", weekdayOf(SATURDAY) === 6);

  // 12:00Z is 09:00 in São Paulo — the whole "fora do horário" reading depends
  // on this conversion, not on the process timezone.
  check(
    "a UTC instant is read on the person's wall clock",
    localMinutesOfDay("2026-09-14T12:00:00.000Z", TZ) === 9 * 60,
  );
  check(
    "an unparseable instant degrades to midnight instead of NaN",
    localMinutesOfDay("not-a-date", TZ) === 0,
  );
}

// ─── Ledger ───────────────────────────────────────────────────────────

function verifyLedger(): void {
  const ledger = buildMeetingLedger(MEETINGS, EXCLUSIONS);

  check(
    "every signal counts as attended",
    ledger.attended.count === 5,
    `contou ${ledger.attended.count}`,
  );
  check(
    "attended minutes sum the normalized durations",
    ledger.attended.minutes === 60 + 60 + 60 + 30 + 60,
    `somou ${ledger.attended.minutes}`,
  );

  check("cancelled comes from the exclusions", ledger.cancelled.count === 1);
  check("declined comes from the exclusions", ledger.declined.count === 1);
  check("overlapped comes from the exclusions", ledger.overlapped.count === 1);

  // A recurrence rule is not an event. Counting it would add a meeting that
  // never occupied a minute of anybody's day.
  check(
    "a series master is never counted",
    ledger.skipped.count === 1 && ledger.skipped.minutes === 30,
    `skipped=${ledger.skipped.count}`,
  );

  check(
    "rescheduled is a subset of attended, not a sibling",
    ledger.rescheduled.count === 1,
  );
  check("tentative is counted apart", ledger.tentative.count === 1);
  check(
    "not responded stays zero when everyone answered",
    ledger.not_responded.count === 0,
  );

  const exclusive =
    ledger.attended.count +
    ledger.cancelled.count +
    ledger.declined.count +
    ledger.overlapped.count +
    ledger.skipped.count;
  check(
    "the exclusive buckets account for every row exactly once",
    exclusive === MEETINGS.length + EXCLUSIONS.length - 1,
    `${exclusive} para ${MEETINGS.length + EXCLUSIONS.length - 1} esperados`,
  );

  const empty = buildMeetingLedger([], []);
  check(
    "an empty period produces zeros, never undefined",
    empty.attended.count === 0 && empty.attended.minutes === 0,
  );
}

// ─── People ───────────────────────────────────────────────────────────

function verifyCollaborators(): void {
  const people = buildCollaborators(MEETINGS);
  const ana = people.find((entry) => entry.email === "ana@optsolv.com.br");
  const bruno = people.find((entry) => entry.email === "bruno@optsolv.com.br");
  const carla = people.find((entry) => entry.email === "carla@cliente.com.br");

  check("every participant becomes a row", people.length === 3);

  // Ana is in m1 (60), m2 (60) and m5 (60): the full duration counts for each
  // participant, so the column never sums to the period total.
  check(
    "minutes are attributed in full to each participant",
    ana?.minutes === 180,
    `Ana com ${ana?.minutes}`,
  );
  check("meeting counts follow the attribution", ana?.meetings === 3);
  check(
    "a one-on-one is tracked apart from group meetings",
    ana?.oneOnOnes === 1,
  );
  check("Bruno only attended the two dailies", bruno?.minutes === 120);

  check(
    "an outside e-mail domain is flagged external",
    carla?.isExternal === true,
  );
  check("colleagues are not flagged external", ana?.isExternal === false);

  check(
    "rows come back heaviest first",
    people[0]?.email === "ana@optsolv.com.br",
  );
  check(
    "the most recent meeting wins lastMeetingIso",
    ana?.lastMeetingIso === "2026-09-19T13:00:00.000Z",
  );

  check(
    "a meeting with nobody in it produces no rows",
    buildCollaborators([
      meeting({ id: "solo", startIso: "2026-09-14T12:00:00.000Z" }),
    ]).length === 0,
  );
}

// ─── Rituals ──────────────────────────────────────────────────────────

function verifyRituals(): void {
  const cancelledSubjects = EXCLUSIONS.filter(
    (exclusion) => exclusion.reason === "cancelled",
  ).map((exclusion) => exclusion.subject);

  const rituals = buildRituals(MEETINGS, cancelledSubjects);

  check("only recurring series become rituals", rituals.length === 1);

  const daily = rituals[0];
  check("occurrences are collapsed into one row", daily?.occurrences === 2);
  check("minutes are summed across occurrences", daily?.minutes === 120);
  check(
    "the average participant count is rounded, not truncated to the first",
    daily?.averageParticipants === 2,
  );
  check("a moved occurrence is reported", daily?.rescheduled === 1);

  // A cancelled occurrence never reaches the signals, so the only way back to
  // its series is the subject it was dropped under.
  check(
    "a cancelled occurrence is matched back to its series by subject",
    daily?.cancelled === 1,
    `cancelled=${daily?.cancelled}`,
  );

  check(
    "a one-off meeting is never promoted to a ritual",
    buildRituals([
      meeting({ id: "once", startIso: "2026-09-14T12:00:00.000Z" }),
    ]).length === 0,
  );
}

// ─── Shape ────────────────────────────────────────────────────────────

function verifyShape(): void {
  const shape = buildTimeShape({
    meetings: MEETINGS,
    days: DAYS,
    workingHours: WORKING_HOURS,
    timeZone: TZ,
  });

  // m1 ends at 10:00 and m2 starts at 10:00 — zero gap.
  check(
    "two meetings glued together count as back-to-back",
    shape.backToBackCount === 1,
    `contou ${shape.backToBackCount}`,
  );

  // Monday: window 09:00–18:00, busy 09–11 and 14–15. The 11:00–14:00 gap is
  // 180 minutes; so is 15:00–18:00. Tuesday through Friday are entirely free,
  // which is a 540-minute block.
  check(
    "a completely free working day is the longest block",
    shape.longestFocusBlockMinutes === 540,
    `achou ${shape.longestFocusBlockMinutes}`,
  );
  check(
    "the longest block reports which day it happened on",
    shape.longestFocusBlockDate === "2026-09-15",
    `achou ${shape.longestFocusBlockDate}`,
  );

  // The 19:00 meeting is entirely past the 18:00 window.
  check(
    "meeting minutes past the working window are counted as after hours",
    shape.afterHoursMinutes === 30,
    `achou ${shape.afterHoursMinutes}`,
  );
  check(
    "a meeting on a non-working day is weekend time, not after hours",
    shape.weekendMinutes === 60,
    `achou ${shape.weekendMinutes}`,
  );

  // Inside the window: 60 + 60 + 60 = 180 over 5 working days of 540 minutes.
  // Numerator: only the 180 minutes that fell inside the window (the 19:00
  // meeting and the Saturday one are excluded). Denominator: the contracted
  // week, 5 × 8h.
  check(
    "the load percentage only counts minutes inside the window",
    shape.meetingLoadPercent === Math.round((180 / (5 * 480)) * 100),
    `achou ${shape.meetingLoadPercent}`,
  );

  // Both denominators are published, and they are NOT the same number. The
  // Outlook window spans lunch (9h here), while the working day is 8h — the
  // load percentage must use the contracted day, or every agenda reads a
  // ninth emptier than it felt.
  check(
    "the Outlook window is reported as a wall clock",
    shape.windowStartMinute === 9 * 60 && shape.windowEndMinute === 18 * 60,
    `${shape.windowStartMinute}–${shape.windowEndMinute}`,
  );
  check(
    "window capacity is the span times the working days",
    shape.windowCapacityMinutes === 5 * 540,
    `achou ${shape.windowCapacityMinutes}`,
  );
  check(
    "contracted minutes come from each day's own target",
    shape.contractedMinutes === 5 * 480,
    `achou ${shape.contractedMinutes}`,
  );
  check(
    "the two denominators are different, and the wider one is the window",
    shape.windowCapacityMinutes > shape.contractedMinutes,
  );
  check(
    "the load percentage divides by the contracted day, not by the window",
    shape.meetingLoadPercent ===
      Math.round((180 / shape.contractedMinutes) * 100),
    `achou ${shape.meetingLoadPercent}`,
  );

  // The numerator is published too. The headline "tempo em reuniões" counts
  // every meeting (330min here, the 19:00 one and the Saturday one included),
  // while the percentage counts only what landed inside the window (180min).
  // Showing one without the other made the two look contradictory.
  check(
    "the in-window minutes are published as the percentage's numerator",
    shape.meetingMinutesInWindow === 180,
    `achou ${shape.meetingMinutesInWindow}`,
  );
  check(
    "in-window minutes never exceed the total meeting minutes",
    shape.meetingMinutesInWindow <=
      MEETINGS.reduce((sum, item) => sum + item.minutes, 0),
  );

  check(
    "the organizer share is a percentage of meetings, not of minutes",
    shape.organizerPercent === 40,
    `achou ${shape.organizerPercent}`,
  );
  check(
    "external minutes count the whole meeting, once",
    shape.externalMinutes === 60,
    `achou ${shape.externalMinutes}`,
  );
  check(
    "the heaviest weekday is the one with most meeting minutes",
    shape.heaviestWeekday === 1,
    `achou ${shape.heaviestWeekday}`,
  );

  // Without the mailbox the window falls back to 09:00–18:00, so the readings
  // above must not change.
  const fallback = buildTimeShape({
    meetings: MEETINGS,
    days: DAYS,
    workingHours: null,
    timeZone: TZ,
  });
  check(
    "the default window matches the documented 9h–18h fallback",
    fallback.meetingLoadPercent === shape.meetingLoadPercent,
  );

  const quiet = buildTimeShape({
    meetings: [],
    days: DAYS,
    workingHours: WORKING_HOURS,
    timeZone: TZ,
  });
  check(
    "a period with no meetings has no heaviest weekday",
    quiet.heaviestWeekday === null && quiet.organizerPercent === 0,
  );

  // 2026-09-15T01:00Z is 22:00 on the 14th in São Paulo. Bucketing by the UTC
  // prefix of the instant would file it under Tuesday and silently move its
  // after-hours minutes with it.
  const lateNight = buildTimeShape({
    meetings: [
      meeting({
        id: "late",
        startIso: "2026-09-15T01:00:00.000Z",
        minutes: 60,
      }),
    ],
    days: DAYS,
    workingHours: WORKING_HOURS,
    timeZone: TZ,
  });
  check(
    "a late meeting stays on the local day it happened",
    lateNight.heaviestWeekday === 1,
    `caiu no dia ${lateNight.heaviestWeekday}`,
  );
  check(
    "and its minutes are counted as after hours, not lost",
    lateNight.afterHoursMinutes === 60,
    `contou ${lateNight.afterHoursMinutes}`,
  );
}

// ─── Slices ───────────────────────────────────────────────────────────

function verifySlices(): void {
  const merged = mergeSlices([
    [
      { kind: "meeting", minutes: 60 },
      { kind: "focus", minutes: 120 },
    ],
    [
      { kind: "meeting", minutes: 30 },
      { kind: "email", minutes: 15 },
    ],
  ]);

  check("slices of the same kind are summed", merged.length === 3);
  check(
    "the biggest slice comes first",
    merged[0]?.kind === "focus" && merged[0]?.minutes === 120,
  );
  check(
    "meeting minutes accumulate across days",
    merged.find((slice) => slice.kind === "meeting")?.minutes === 90,
  );
}

// ─── Presets ──────────────────────────────────────────────────────────

function verifyPresets(): void {
  check(
    "a week always starts on Monday",
    weekdayOf(startOfWeek("2026-09-16")) === 1,
  );
  check(
    "a Sunday belongs to the week that started six days earlier",
    startOfWeek("2026-09-20") === "2026-09-14",
  );
  check(
    "a Monday is its own start of week",
    startOfWeek("2026-09-14") === "2026-09-14",
  );

  const thisWeek = resolvePeriodRange("this-week", "2026-09-16");
  check(
    "this week spans Monday to Sunday",
    thisWeek.from === "2026-09-14" && thisWeek.to === "2026-09-20",
  );

  const lastWeek = resolvePeriodRange("last-week", "2026-09-16");
  check(
    "last week is the seven days before it",
    lastWeek.from === "2026-09-07" && lastWeek.to === "2026-09-13",
  );

  const thisMonth = resolvePeriodRange("this-month", "2026-09-16");
  check(
    "a month runs to its real last day",
    thisMonth.from === "2026-09-01" && thisMonth.to === "2026-09-30",
  );

  const lastMonth = resolvePeriodRange("last-month", "2026-09-16");
  check(
    "last month is the previous calendar month",
    lastMonth.from === "2026-08-01" && lastMonth.to === "2026-08-31",
  );

  const last30 = resolvePeriodRange("last-30", "2026-09-30");
  check(
    "the 30-day window includes today",
    last30.from === "2026-09-01" && last30.to === "2026-09-30",
  );

  check(
    "February is not assumed to have 30 days",
    endOfMonth("2026-02-10") === "2026-02-28",
  );
  check(
    "a leap February is handled",
    endOfMonth("2028-02-10") === "2028-02-29",
  );

  const shifted = shiftRange(thisWeek, -1);
  check(
    "shifting back one step keeps the window length",
    shifted.from === "2026-09-07" && shifted.to === "2026-09-13",
  );
  check(
    "shifting forward returns to where it started",
    shiftRange(shifted, 1).from === thisWeek.from,
  );
}

// ─── Labels ───────────────────────────────────────────────────────────

function verifyLabels(): void {
  check(
    "a range inside one month is written once",
    formatPeriodLabel("2026-09-14", "2026-09-20") === "14 a 20 de setembro",
  );
  check(
    "a full month collapses to the month name",
    formatPeriodLabel("2026-09-01", "2026-09-30") === "setembro de 2026",
  );
  check(
    "a single day carries the year",
    formatPeriodLabel("2026-09-14", "2026-09-14") === "14 de setembro de 2026",
  );
  check(
    "a range across months names both",
    formatPeriodLabel("2026-08-28", "2026-09-03") ===
      "28 de agosto a 3 de setembro",
  );
  check(
    "a range across years falls back to numbers",
    formatPeriodLabel("2025-12-29", "2026-01-04") === "29/12/2025 a 4/1/2026",
  );
}

// ─── Insights and narrative ───────────────────────────────────────────

function buildPeriod(
  overrides: Partial<CollaborationPeriod> = {},
): CollaborationPeriod {
  const ledger = buildMeetingLedger(MEETINGS, EXCLUSIONS);

  return {
    from: MONDAY,
    to: "2026-09-20",
    label: formatPeriodLabel(MONDAY, "2026-09-20"),
    days: DAYS,
    totals: {
      loggedMinutes: 300,
      targetMinutes: 2400,
      meetingMinutes: 270,
      collaborationMinutes: 400,
      focusMinutes: 500,
      loggedMeetingMinutes: 60,
      workingDays: 5,
      awayDays: 0,
    },
    ledger,
    meetings: MEETINGS,
    collaborators: buildCollaborators(MEETINGS),
    rituals: buildRituals(MEETINGS, ["Daily do time"]),
    shape: buildTimeShape({
      meetings: MEETINGS,
      days: DAYS,
      workingHours: WORKING_HOURS,
      timeZone: TZ,
    }),
    allocations: [
      {
        projectId: "p1",
        name: "Portal do Cliente",
        color: "#f97316",
        minutes: 300,
        billableMinutes: 300,
      },
    ],
    slices: [
      { kind: "focus", minutes: 500 },
      { kind: "meeting", minutes: 240 },
    ],
    sources: { calendar: true, portrait: true, mailbox: true },
    statuses: [
      buildCalendarStatus("ok"),
      buildPortraitStatus("ok"),
      buildMailboxStatus("ok"),
    ],
    warnings: [],
    needsReauth: false,
    ...overrides,
  };
}

function verifyInsights(): void {
  const period = buildPeriod();
  const insights = buildPeriodInsights({ period });

  check("a busy period produces findings", insights.length > 0);
  check(
    "no more than six findings reach the screen",
    insights.length <= 6,
    `gerou ${insights.length}`,
  );

  const ids = insights.map((insight) => insight.id);
  check("findings are unique", new Set(ids).size === ids.length);

  // 270 detected against 60 already logged: a 3h30 gap the person can close.
  check(
    "the unregistered meeting gap is surfaced",
    ids.includes("unlogged-meetings"),
  );
  check(
    "that finding is the first thing shown",
    insights[0]?.id === "unlogged-meetings",
    `primeiro foi ${insights[0]?.id}`,
  );
  // The action is handled in place by the batch dialog, not by navigating
  // away: sending someone to another screen to do what this one already knows
  // how to do is the difference between a report and an assistant.
  check(
    "the first finding resolves itself on this page",
    insights[0]?.quickAction === "log-meetings" &&
      insights[0]?.actionHref === null,
  );

  const tones = insights.map((insight) => insight.tone);
  const firstNeutral = tones.indexOf("neutral");
  const lastAttention = tones.lastIndexOf("attention");
  check(
    "attention items always precede neutral ones",
    firstNeutral === -1 || lastAttention < firstNeutral,
    tones.join(","),
  );

  // Cancelled 30 + declined 60 + overlapped 45 = 135 against 270 attended.
  check("agenda churn is reported", ids.includes("agenda-churn"));

  const delivery = buildPeriodInsights({
    period,
    delivery: { pullRequests: 3, commits: 12, workItems: 2 },
  });
  check(
    "Azure DevOps deliveries add a finding",
    delivery.some((insight) => insight.id === "delivery"),
  );

  const quiet = buildPeriodInsights({
    period: buildPeriod({
      meetings: [],
      ledger: buildMeetingLedger([], []),
      collaborators: [],
      rituals: [],
      totals: {
        loggedMinutes: 0,
        targetMinutes: 2400,
        meetingMinutes: 0,
        collaborationMinutes: 0,
        focusMinutes: 0,
        loggedMeetingMinutes: 0,
        workingDays: 5,
        awayDays: 0,
      },
    }),
  });
  check(
    "an empty period never claims a meeting happened",
    !quiet.some((insight) => insight.id === "meeting-load"),
  );

  // Anti-collection rule: a period below the forecast is never reported as a
  // debt. The shortcut to register lives on the KPI, not in a warning card.
  check(
    "no finding ever tells the person hours are missing",
    !quiet.some(
      (insight) =>
        insight.title.toLowerCase().includes("falta") ||
        insight.description.toLowerCase().includes("falta"),
    ),
  );
  check(
    "a period under the forecast produces no attention card about it",
    !quiet.some(
      (insight) => insight.id === "target" && insight.tone === "attention",
    ),
  );

  // Only an action may carry a button, and only the action tone may be first.
  const withButtons = insights.filter(
    (insight) => insight.quickAction !== null,
  );
  check(
    "only action-tone findings carry a quick action",
    withButtons.every((insight) => insight.tone === "action"),
  );
}

// ─── Rhythm ───────────────────────────────────────────────────────────

function verifyRhythm(): void {
  const base = buildPeriod();

  check(
    "a period with meetings and free space reads as arranged, not as a score",
    ["balanced", "protected", "fragmented", "heavy"].includes(
      resolveRhythm(base).kind,
    ),
  );

  const noCalendar = resolveRhythm(
    buildPeriod({
      sources: { calendar: false, portrait: true, mailbox: true },
    }),
  );
  check(
    "without the calendar the rhythm says so instead of guessing",
    noCalendar.kind === "unknown",
  );

  const noMeetings = resolveRhythm(
    buildPeriod({ meetings: [], ledger: buildMeetingLedger([], []) }),
  );
  check(
    "a period with no meetings is protected, never empty",
    noMeetings.kind === "protected",
  );

  const heavy = resolveRhythm(
    buildPeriod({
      shape: { ...base.shape, meetingLoadPercent: 62 },
    }),
  );
  check("a loaded agenda is called out", heavy.kind === "heavy");

  const fragmented = resolveRhythm(
    buildPeriod({
      shape: {
        ...base.shape,
        meetingLoadPercent: 20,
        backToBackCount: 6,
        longestFocusBlockMinutes: 300,
      },
    }),
  );
  check(
    "stacked meetings make a week fragmented even when it is not full",
    fragmented.kind === "fragmented",
  );

  const protectedWeek = resolveRhythm(
    buildPeriod({
      shape: {
        ...base.shape,
        meetingLoadPercent: 12,
        backToBackCount: 0,
        longestFocusBlockMinutes: 300,
      },
    }),
  );
  check(
    "a long uninterrupted block is named a win",
    protectedWeek.kind === "protected",
  );

  for (const rhythm of [
    resolveRhythm(base),
    noCalendar,
    noMeetings,
    heavy,
    fragmented,
    protectedWeek,
  ]) {
    check(
      "every rhythm carries a label and an explanation",
      rhythm.label.length > 0 && rhythm.description.length > 0,
      rhythm.kind,
    );
    check(
      "no rhythm label mentions hours owed",
      !rhythm.label.toLowerCase().includes("falta"),
      rhythm.label,
    );
  }
}

function verifyNarrative(): void {
  const period = buildPeriod();
  const insights = buildPeriodInsights({ period });

  const text = buildDeterministicNarrative({ period, insights });
  check("the local writer always produces text", text.length > 60);
  check("it names the period", text.includes(period.label));
  check("it is prose, not a bullet list", !text.includes("\n- "));

  const empty = buildDeterministicNarrative({
    period: buildPeriod({
      ledger: buildMeetingLedger([], []),
      totals: {
        loggedMinutes: 0,
        targetMinutes: 2400,
        meetingMinutes: 0,
        collaborationMinutes: 0,
        focusMinutes: 0,
        loggedMeetingMinutes: 0,
        workingDays: 5,
        awayDays: 0,
      },
    }),
    insights: [],
  });
  check(
    "an empty period is stated plainly instead of invented",
    empty.includes("Não encontramos"),
  );

  // The model is only ever allowed to rephrase this sheet, so anything absent
  // from it cannot legitimately appear in the summary.
  const sheet = buildFactSheet({ period, insights });
  check("the fact sheet carries the period", sheet.includes(period.label));
  check(
    "the fact sheet carries the registered hours",
    sheet.includes("Horas registradas"),
  );
  check(
    "the fact sheet never leaks a participant e-mail",
    !sheet.includes("@optsolv.com.br") && !sheet.includes("@cliente.com.br"),
  );
  check(
    "delivery counts only appear when they exist",
    !sheet.includes("Azure DevOps") &&
      buildFactSheet({
        period,
        insights,
        delivery: { pullRequests: 1, commits: 2, workItems: 0 },
      }).includes("Azure DevOps"),
  );
}

// ─── Source health ────────────────────────────────────────────────────

function verifySourceStatus(): void {
  const healthy = [
    buildCalendarStatus("ok"),
    buildPortraitStatus("ok"),
    buildMailboxStatus("ok"),
    buildAzureDevOpsStatus("ok"),
  ];
  check("a healthy period reports no issues", issuesOf(healthy).length === 0);
  check("and offers no sign-in prompt", !needsReauth(healthy));

  // A 401/403 on the calendar is a session older than the consent, not an
  // outage. Telling someone to wait when a button would fix it is the worse
  // of the two mistakes.
  const stale = buildCalendarStatus("auth_failed");
  check("an auth failure asks for a new sign-in", stale.action === "reauth");
  check("and is not reported as an outage", stale.health === "needs_reauth");

  const outage = buildCalendarStatus("unavailable");
  check("a real outage offers no button", outage.action === null);

  // An unlicensed account cannot fix anything by signing in again, so it must
  // never be offered that button.
  const unlicensed = buildPortraitStatus("unlicensed");
  check(
    "an unlicensed Viva account is told it is a licence, not a login",
    unlicensed.health === "unlicensed" && unlicensed.action === null,
  );

  const noAzure = buildAzureDevOpsStatus("not_configured");
  check(
    "a missing Azure DevOps points at the integration page",
    noAzure.action === "connect_azure_devops",
  );
  check(
    "and says the rest of the screen still works",
    noAzure.detail.toLowerCase().includes("não depende dele"),
  );

  for (const status of [
    stale,
    outage,
    unlicensed,
    noAzure,
    buildMailboxStatus("missing_scope"),
    buildAzureDevOpsStatus("bad_token"),
  ]) {
    check(
      "every issue carries a label and a sentence the person can read",
      status.label.length > 0 && status.detail.length > 20,
      status.id,
    );
  }

  check(
    "reauth is detected across every Microsoft source",
    needsReauth([buildMailboxStatus("missing_scope")]) &&
      needsReauth([buildPortraitStatus("missing_scope")]) &&
      needsReauth([buildCalendarStatus("no_token")]),
  );
}

// ─── Entry point ──────────────────────────────────────────────────────

function main(): void {
  verifyCalendarHelpers();
  verifyLedger();
  verifyCollaborators();
  verifyRituals();
  verifyShape();
  verifySlices();
  verifyPresets();
  verifyLabels();
  verifyInsights();
  verifyRhythm();
  verifySourceStatus();
  verifyNarrative();

  if (problems.length > 0) {
    console.error("\nMeu Tempo — regras quebradas:");
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  console.log("my-time rules OK");
}

main();
