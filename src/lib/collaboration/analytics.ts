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
/** A month of rows takes longer to come back than a single day. */
const RANGE_TIMEOUT_MS = 12_000;

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

// ─── Range reads (Meu Tempo) ──────────────────────────────────────────

/**
 * Buckets raw Graph rows into one portrait per local day.
 *
 * A row with no `startDate` is dropped here, unlike the single-day path: with
 * a range there is nowhere to put it, and silently adding it to the first day
 * would invent minutes on a date the person may not have worked.
 */
export function summarizeActivityRowsByDay(
  rows: GraphActivityStatistic[],
  from: string,
  to: string,
): Map<string, ActivitySlice[]> {
  const byDate = new Map<string, GraphActivityStatistic[]>();

  for (const row of rows) {
    const date = row.startDate?.slice(0, 10);
    if (!date || date < from || date > to) continue;

    const bucket = byDate.get(date);
    if (bucket) bucket.push(row);
    else byDate.set(date, [row]);
  }

  const result = new Map<string, ActivitySlice[]>();
  for (const [date, dayRows] of byDate) {
    result.set(date, summarizeActivityRows(dayRows));
  }
  return result;
}

export interface PortraitRange {
  /** One entry per day that actually returned data. */
  byDate: Map<string, DayPortrait>;
  availability: PortraitAvailability;
}

/**
 * Reads the whole period in a single request.
 *
 * `activityStatistics` only accepts a lower bound (`ge`), so asking for the
 * first day of the range already returns everything after it; the upper bound
 * is applied while bucketing. One call for a month beats thirty daily ones and
 * keeps the page inside a normal request budget.
 */
export async function fetchPortraitRange(
  accessToken: string,
  from: string,
  to: string,
): Promise<PortraitRange> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), RANGE_TIMEOUT_MS);

  try {
    const filter = encodeURIComponent(`startDate ge ${from}`);
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

      if (availability === "unavailable") {
        console.error("[collaboration-analytics] range error:", {
          from,
          to,
          status: response.status,
          body: body.slice(0, 500),
        });
      }

      return { byDate: new Map(), availability };
    }

    const data = (await response.json()) as GraphActivityResponse;
    const grouped = summarizeActivityRowsByDay(data.value ?? [], from, to);

    const byDate = new Map<string, DayPortrait>();
    for (const [date, slices] of grouped) {
      byDate.set(date, buildPortrait(date, slices, "ok"));
    }

    return { byDate, availability: "ok" };
  } catch (error: unknown) {
    console.error("[collaboration-analytics] fetchPortraitRange:", {
      from,
      to,
      error,
    });
    return { byDate: new Map(), availability: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * pt-BR label for each activity kind.
 *
 * `focus` carries neither "trabalho" nor "foco", and both omissions are
 * deliberate. Microsoft defines it as "all time blocks of at least two
 * consecutive hours in the calendar without a meeting with other people,
 * within the set work hours" — that is *empty calendar*, not measured work.
 * Calling it "trabalho focado" made a quiet week read as 43 hours of deep
 * work; calling it "tempo livre para focar" still collided with our own
 * "maior bloco de foco", which measures something else entirely.
 *
 * "Espaço livre na agenda" says what it is: room, not effort.
 */
export const ACTIVITY_LABELS: Record<ActivityKind, string> = {
  meeting: "Reuniões",
  call: "Chamadas",
  chat: "Conversas",
  email: "E-mail",
  focus: "Espaço livre na agenda",
};

/**
 * One plain sentence per activity, shown next to the legend.
 *
 * Written from the official Microsoft Graph definitions, because the five
 * names look interchangeable to anyone who has not read them: "reunião",
 * "chamada" and "conversa" are the same thing in everyday Portuguese, and the
 * whole card is useless if the person cannot tell them apart.
 */
export const ACTIVITY_DESCRIPTIONS: Record<ActivityKind, string> = {
  meeting:
    "Reuniões agendadas na agenda — Outlook, Teams ou Skype. Tem hora marcada e convite.",
  call: "Ligações do Teams: alguém te chamou, ou você chamou, sem convite de agenda.",
  chat: "Mensagens trocadas no chat do Teams, uma a uma ou em grupo.",
  email: "Tempo lendo e escrevendo e-mails no Outlook.",
  focus:
    "A soma de TODAS as janelas de 2 horas ou mais sem reunião, no seu horário de trabalho do Outlook. Mede quanto espaço a agenda deixou livre — não quanto você trabalhou. Costuma ser alto: uma semana com poucas reuniões deixa quase todo o expediente livre.",
};

/** Why the free-space figure is shown apart, in the user's words. */
export const FOCUS_DISCLAIMER =
  "Não soma com os números acima: um é tempo ocupado, o outro é o quanto da agenda ficou vago.";

/** Where these numbers come from, shown behind the info button. */
export const PORTRAIT_SOURCE_NOTE =
  "Medições do Microsoft Viva Insights, calculadas pela própria Microsoft durante a madrugada e baseadas no horário de trabalho configurado no seu Outlook. Por isso o dia de hoje costuma aparecer vazio — e por isso os números não batem exatamente com o seu apontamento.";

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
