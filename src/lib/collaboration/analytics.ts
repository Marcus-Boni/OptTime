/**
 * Daily activity portrait from Viva Insights.
 *
 * `/me/analytics/activityStatistics` answers "how did this person's day
 * actually go" — minutes in meetings, calls, chat, e-mail and focus — without
 * reading a single message. It is the only source in the product that sees the
 * work of someone who never opens Azure DevOps.
 *
 * Delegated `Analytics.Read`, requested at login (see lib/auth.ts). A tenant
 * without the scope or without a Viva Insights licence yields 403, reported as
 * an availability state rather than thrown: the portrait is always an extra on
 * top of the calendar, never a dependency.
 */

import type {
  ActivityKind,
  ActivitySlice,
  DayPortrait,
  PortraitAvailability,
} from "@/types/collaboration";

const GRAPH_ANALYTICS_URL =
  "https://graph.microsoft.com/beta/me/analytics/activityStatistics";
const CALL_TIMEOUT_MS = 8_000;

/** Graph reports focus separately; the other four are collaboration time. */
const COLLABORATION_KINDS: readonly ActivityKind[] = [
  "meeting",
  "call",
  "chat",
  "email",
];

const ACTIVITY_BY_GRAPH_NAME: Record<string, ActivityKind> = {
  call: "call",
  chat: "chat",
  email: "email",
  focus: "focus",
  meeting: "meeting",
};

/** ISO-8601 durations as Graph returns them: "PT1H30M", "PT45M", "P1DT2H". */
const ISO_DURATION_PATTERN =
  /^P(?:(\d+(?:\.\d+)?)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?)?$/;

interface GraphActivityStatistic {
  activity?: string;
  duration?: string;
  startDate?: string;
  endDate?: string;
}

interface GraphActivityResponse {
  value?: GraphActivityStatistic[];
}

/**
 * Converts an ISO-8601 duration into whole minutes.
 * Returns 0 for anything unparseable — a bad row must never poison the total.
 */
export function parseIsoDurationMinutes(value: string | undefined): number {
  if (!value) return 0;

  const match = value.trim().toUpperCase().match(ISO_DURATION_PATTERN);
  if (!match) return 0;

  const days = Number.parseFloat(match[1] ?? "0") || 0;
  const hours = Number.parseFloat(match[2] ?? "0") || 0;
  const minutes = Number.parseFloat(match[3] ?? "0") || 0;
  const seconds = Number.parseFloat(match[4] ?? "0") || 0;

  return Math.round(days * 1440 + hours * 60 + minutes + seconds / 60);
}

/**
 * Folds raw Graph rows into one slice per activity kind.
 *
 * `date` narrows the rows to a single day. The upper bound cannot be expressed
 * in the request — the service rejects `lt` on `endDate` with
 * `InvalidFilter: Filter 'LessThan' is not allowed` — so the query asks for
 * everything from `date` onward and the day is selected here.
 */
export function summarizeActivityRows(
  rows: GraphActivityStatistic[],
  date?: string,
): ActivitySlice[] {
  const totals = new Map<ActivityKind, number>();

  for (const row of rows) {
    // A row without a startDate is kept: dropping it would empty the portrait
    // if the beta payload ever changes shape.
    if (date && row.startDate && row.startDate.slice(0, 10) !== date) continue;

    const kind = ACTIVITY_BY_GRAPH_NAME[(row.activity ?? "").toLowerCase()];
    if (!kind) continue;

    const minutes = parseIsoDurationMinutes(row.duration);
    if (minutes <= 0) continue;

    totals.set(kind, (totals.get(kind) ?? 0) + minutes);
  }

  return [...totals.entries()]
    .map(([kind, minutes]) => ({ kind, minutes }))
    .sort((a, b) => b.minutes - a.minutes);
}

export function buildPortrait(
  date: string,
  slices: ActivitySlice[],
  availability: PortraitAvailability,
): DayPortrait {
  const collaborationMinutes = slices
    .filter((slice) => COLLABORATION_KINDS.includes(slice.kind))
    .reduce((sum, slice) => sum + slice.minutes, 0);

  const focusMinutes = slices
    .filter((slice) => slice.kind === "focus")
    .reduce((sum, slice) => sum + slice.minutes, 0);

  return {
    date,
    slices,
    collaborationMinutes,
    focusMinutes,
    totalMinutes: collaborationMinutes + focusMinutes,
    availability,
  };
}

function availabilityFromError(
  status: number,
  body: string,
): PortraitAvailability {
  if (status === 401) return "no_token";

  if (status === 403) {
    const lowered = body.toLowerCase();
    const licenceHint =
      lowered.includes("license") ||
      lowered.includes("licence") ||
      lowered.includes("subscription") ||
      lowered.includes("not provisioned");
    return licenceHint ? "unlicensed" : "missing_scope";
  }

  // Viva answers 404 for a mailbox outside the analytics population.
  if (status === 404) return "unlicensed";
  return "unavailable";
}

/**
 * Fetches the portrait for a single local calendar day.
 *
 * Never throws: any failure comes back as a portrait carrying the reason, so a
 * Viva outage degrades the panel instead of breaking the page.
 */
export async function fetchDayPortrait(
  accessToken: string,
  date: string,
): Promise<DayPortrait> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);

  try {
    // Only `ge` survives here. The documented example pairs it with
    // `endDate lt <nextDay>`, but the service answers 400 with
    // `InvalidFilter: Filter 'LessThan' is not allowed` — so the upper bound is
    // applied in `summarizeActivityRows` instead. The result stays small: a
    // start date can never be in the future, and the panel only reaches 30 days
    // back.
    //
    // Built by hand because `URLSearchParams` encodes spaces as "+", which is
    // form encoding; OData wants "%20".
    const filter = encodeURIComponent(`startDate ge ${date}`);
    const url = `${GRAPH_ANALYTICS_URL}?$filter=${filter}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      const availability = availabilityFromError(response.status, body);

      // "unavailable" is the bucket for everything we did not anticipate, and
      // it reaches the user as a vague sentence. Log the whole thing: without
      // the status and body there is no way to tell a malformed $filter from a
      // tenant that simply has no analytics data yet.
      if (availability === "unavailable") {
        console.error("[collaboration-analytics] graph error:", {
          date,
          status: response.status,
          url,
          body: body.slice(0, 500),
        });
      }

      return buildPortrait(date, [], availability);
    }

    const data = (await response.json()) as GraphActivityResponse;
    const rows = data.value ?? [];
    const slices = summarizeActivityRows(rows, date);

    // Viva computes these overnight, so "today" is legitimately empty for most
    // of the day. That is not a failure — the bar simply does not render.
    if (slices.length === 0) {
      console.info("[collaboration-analytics] no data for day:", {
        date,
        rowsReturned: rows.length,
      });
    }

    return buildPortrait(date, slices, "ok");
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      console.error("[collaboration-analytics] timed out:", {
        date,
        timeoutMs: CALL_TIMEOUT_MS,
      });
      return buildPortrait(date, [], "unavailable");
    }

    console.error("[collaboration-analytics] fetchDayPortrait:", {
      date,
      error,
    });
    return buildPortrait(date, [], "unavailable");
  } finally {
    clearTimeout(timer);
  }
}

/** pt-BR label for each activity kind, used by the portrait bar. */
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  meeting: "Reuniões",
  call: "Chamadas",
  chat: "Conversas",
  email: "E-mail",
  focus: "Trabalho focado",
};

/** User-facing explanation for a portrait that could not be built. */
export const PORTRAIT_UNAVAILABLE_MESSAGES: Record<
  Exclude<PortraitAvailability, "ok">,
  string
> = {
  missing_scope:
    "Saia e entre novamente para liberar a leitura do seu resumo de atividade.",
  unlicensed:
    "Sua conta ainda não tem o Viva Insights habilitado — o resumo do dia fica indisponível.",
  no_token: "Reconecte sua conta Microsoft para ver o resumo do dia.",
  unavailable: "Não foi possível ler seu resumo de atividade agora.",
};
