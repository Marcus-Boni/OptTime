import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { allowedEmailDomain } from "@/lib/auth";
import { fetchTeamCallRecords } from "@/lib/collaboration/call-records";
import { db } from "@/lib/db";
import { timeEntry } from "@/lib/db/schema";
import {
  CALENDAR_PAGE_SIZE,
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
  agendaCacheKey,
  clearAgendaCache,
  readAgendaCache,
  writeAgendaCache,
} from "./agenda-cache";
import {
  type AgendaEntryRow,
  type AgendaProjectCandidate,
  type AgendaResult,
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

export { clearAgendaCache };
export type { AgendaResult };

export interface GetMyAgendaInput {
  /** First day, `YYYY-MM-DD` in the app timezone. */
  date: string;
  /** How many days from `date`, 1–7. */
  days: number;
  includeDeclined: boolean;
  includeDescription: boolean;
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

/** Pages read per request; with the page size this is the most events returned. */
function pagesFor(days: number): number {
  return days > 3 ? 5 : 3;
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
  const key = agendaCacheKey(principal.userId, [
    input.date,
    input.days,
    input.includeDeclined,
    input.includeDescription,
  ]);
  const cached = readAgendaCache(key, deps.now());
  if (cached) return cached;

  const timeZone = getAppTimeZone();
  const lastDate = shiftDay(input.date, input.days - 1);
  const rangeStart = startOfDayInstant(input.date, timeZone);
  const rangeEnd = startOfDayInstant(
    shiftDay(input.date, input.days),
    timeZone,
  );

  const accessToken = await deps.getToken(principal);

  const maxPages = pagesFor(input.days);
  const warnings: string[] = [];

  let events: OutlookEvent[];
  try {
    events = await deps.fetchEvents(
      accessToken,
      rangeStart.toISOString(),
      rangeEnd.toISOString(),
      {
        includeExcluded: true,
        maxPages,
        extraSelect: [
          "iCalUId",
          "location",
          ...(input.includeDescription ? ["body"] : []),
        ],
        bodyAsText: input.includeDescription,
        onTruncated: () => {
          warnings.push(
            `A agenda tem mais de ${maxPages * CALENDAR_PAGE_SIZE} eventos neste intervalo; os últimos não foram carregados. Consulte menos dias para ver todos.`,
          );
        },
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
    window: { start: rangeStart, end: rangeEnd },
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
    warnings,
    events: mapped,
  };

  writeAgendaCache(key, value, deps.now());

  return value;
}
