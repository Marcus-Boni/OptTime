import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { allowedEmailDomain } from "@/lib/auth";
import { fetchTeamCallRecords } from "@/lib/collaboration/call-records";
import { db } from "@/lib/db";
import { timeEntry } from "@/lib/db/schema";
import {
  fetchMicrosoftObjectId,
  fetchOutlookEvents,
  MicrosoftConnectionError,
  type OutlookEvent,
} from "@/lib/microsoft-graph";
import {
  formatInstantWithOffset,
  getAppTimeZone,
  shiftDay,
  startOfDayInstant,
} from "@/lib/timezone";
import type { TeamCallSignal } from "@/types/collaboration";
import type { AgentPrincipal } from "../auth";
import { AgentError } from "../errors";
import {
  type AgendaEntryRow,
  type AgendaEvent,
  type AgendaProjectCandidate,
  mapAgendaEvents,
} from "./agenda-mapping";
import {
  MICROSOFT_RECONNECT_HINT,
  requireAgentMicrosoftToken,
} from "./microsoft";
import { getVisibleProjects } from "./projects";

/**
 * The user's own Outlook agenda, for assistants.
 *
 * Reads only the calendar of the token's owner — no entry point takes a user id.
 * Graph is queried with the server-held token, so the assistant needs no
 * Microsoft permission of its own.
 */

/** How long a fetched agenda is reused. The assistant polls every few minutes. */
const AGENDA_CACHE_TTL_MS = 60_000;
const AGENDA_CACHE_MAX_ENTRIES = 200;

export interface GetMyAgendaInput {
  /** First day, `YYYY-MM-DD` in the app timezone. */
  date: string;
  /** How many days from `date`, 1–7. */
  days: number;
  includeDeclined: boolean;
  includeDescription: boolean;
}

export interface AgendaResult {
  timezone: string;
  range: { start: string; end: string };
  sources: { outlook: boolean };
  warnings: string[];
  events: AgendaEvent[];
}

/** Collaborators the agenda needs, injectable so the logic runs offline. */
export interface AgendaDeps {
  getToken: (principal: AgentPrincipal) => Promise<string>;
  fetchEvents: (
    accessToken: string,
    startDateTime: string,
    endDateTime: string,
    options: Parameters<typeof fetchOutlookEvents>[3],
  ) => Promise<OutlookEvent[]>;
  loadProjects: (
    principal: AgentPrincipal,
  ) => Promise<AgendaProjectCandidate[]>;
  loadEntries: (
    userId: string,
    from: string,
    to: string,
  ) => Promise<AgendaEntryRow[]>;
  /** Teams call records over the range, or null when they cannot be read. */
  loadCalls: (
    accessToken: string,
    from: string,
    to: string,
    timeZone: string,
  ) => Promise<ReadonlyArray<TeamCallSignal> | null>;
  now: () => number;
}

const defaultDeps: AgendaDeps = {
  getToken: requireAgentMicrosoftToken,
  fetchEvents: fetchOutlookEvents,
  loadProjects: (principal) => getVisibleProjects(principal),
  loadEntries: (userId, from, to) =>
    db
      .select({
        date: timeEntry.date,
        description: timeEntry.description,
        duration: timeEntry.duration,
      })
      .from(timeEntry)
      .where(
        and(
          eq(timeEntry.userId, userId),
          isNull(timeEntry.deletedAt),
          gte(timeEntry.date, from),
          lte(timeEntry.date, to),
        ),
      )
      .orderBy(asc(timeEntry.date)),
  loadCalls: async (accessToken, from, to, timeZone) => {
    const userAadObjectId = await fetchMicrosoftObjectId(accessToken);
    if (!userAadObjectId) return null;

    const records = await fetchTeamCallRecords({
      userAadObjectId,
      from,
      to,
      timeZone,
    });

    return records.status === "ok" ? records.calls : null;
  },
  now: () => Date.now(),
};

interface CachedAgenda {
  expiresAt: number;
  value: AgendaResult;
}

const agendaCache = new Map<string, CachedAgenda>();

/** Drops cached agendas — for tests, and for callers that just changed an entry. */
export function clearAgendaCache(userId?: string): void {
  if (!userId) {
    agendaCache.clear();
    return;
  }
  for (const key of agendaCache.keys()) {
    if (key.startsWith(`${userId}|`)) agendaCache.delete(key);
  }
}

function cacheKey(userId: string, input: GetMyAgendaInput): string {
  return [
    userId,
    input.date,
    input.days,
    input.includeDeclined ? 1 : 0,
    input.includeDescription ? 1 : 0,
  ].join("|");
}

/**
 * The agenda for `days` days starting at `date`.
 *
 * @throws {AgentError} `MICROSOFT_NOT_CONNECTED` when no Graph token can be had,
 * `UPSTREAM_ERROR` when Graph does not answer.
 */
export async function getMyAgenda(
  principal: AgentPrincipal,
  input: GetMyAgendaInput,
  deps: AgendaDeps = defaultDeps,
): Promise<AgendaResult> {
  const key = cacheKey(principal.userId, input);
  const cached = agendaCache.get(key);
  if (cached && cached.expiresAt > deps.now()) return cached.value;

  const timeZone = getAppTimeZone();
  const lastDate = shiftDay(input.date, input.days - 1);
  const rangeStart = startOfDayInstant(input.date, timeZone);
  const rangeEnd = startOfDayInstant(
    shiftDay(input.date, input.days),
    timeZone,
  );

  const accessToken = await deps.getToken(principal);

  let events: OutlookEvent[];
  try {
    events = await deps.fetchEvents(
      accessToken,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      {
        includeExcluded: true,
        maxPages: input.days > 3 ? 5 : 3,
        extraSelect: [
          "iCalUId",
          "location",
          ...(input.includeDescription ? ["body"] : []),
        ],
        bodyAsText: input.includeDescription,
      },
    );
  } catch (error: unknown) {
    if (error instanceof MicrosoftConnectionError) {
      throw new AgentError(
        "MICROSOFT_NOT_CONNECTED",
        "O Microsoft recusou o acesso à sua agenda.",
        { hint: MICROSOFT_RECONNECT_HINT },
      );
    }

    console.error("[mcp][agenda] graph read failed", {
      userId: principal.userId,
      error: error instanceof Error ? error.message : "unknown",
    });
    throw new AgentError(
      "UPSTREAM_ERROR",
      "Não foi possível ler a agenda do Outlook agora. Tente de novo em instantes.",
    );
  }

  const [projects, entries, calls] = await Promise.all([
    deps.loadProjects(principal),
    deps.loadEntries(principal.userId, input.date, lastDate),
    // Presence is a bonus: a call-records outage must never cost the agenda.
    deps
      .loadCalls(accessToken, input.date, lastDate, timeZone)
      .catch(() => null),
  ]);

  const mapped = mapAgendaEvents({
    events,
    timeZone,
    projects,
    entries,
    userEmail: principal.email,
    internalDomain: allowedEmailDomain,
    includeDeclined: input.includeDeclined,
    includeDescription: input.includeDescription,
    calls,
  });

  // Counts only: subjects, attendees and bodies stay out of the logs.
  console.info("[mcp][agenda]", {
    userId: principal.userId,
    date: input.date,
    days: input.days,
    fetched: events.length,
    returned: mapped.length,
  });

  const value: AgendaResult = {
    timezone: timeZone,
    range: {
      start: formatInstantWithOffset(rangeStart, timeZone),
      end: formatInstantWithOffset(rangeEnd, timeZone),
    },
    sources: { outlook: true },
    warnings: [],
    events: mapped,
  };

  if (agendaCache.size >= AGENDA_CACHE_MAX_ENTRIES) {
    const oldest = agendaCache.keys().next().value;
    if (oldest !== undefined) agendaCache.delete(oldest);
  }
  agendaCache.set(key, { expiresAt: deps.now() + AGENDA_CACHE_TTL_MS, value });

  return value;
}
