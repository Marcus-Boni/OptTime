/**
 * Teams Call Records integration via Microsoft Graph Call Records API.
 *
 * Endpoint: GET /communications/callRecords
 * Scope required: CallRecords.Read.All (Application permission with Admin Consent).
 *
 * The list endpoint does not include sessions, so this module first lists
 * records by startDateTime + participant id, then reads each record's sessions
 * and only counts the session intervals that contain the current user.
 */

import { normalizeTimeZone, shiftDay } from "@/lib/timezone";
import type { TeamCallSignal } from "@/types/collaboration";

const GRAPH_ORIGIN = "https://graph.microsoft.com";
const GRAPH_BASE = `${GRAPH_ORIGIN}/v1.0`;
const LOGIN_ORIGIN = "https://login.microsoftonline.com";
const CALL_RECORDS_TIMEOUT_MS = 10_000;
const CALL_RECORDS_TOTAL_TIMEOUT_MS = 15_000;
const MAX_LIST_PAGES = 4;
const MAX_SESSION_PAGES_PER_RECORD = 2;
const MAX_RECORDS = 80;
const MAX_GRAPH_REQUESTS = 30;
const MAX_SESSION_CONCURRENCY = 4;
const CARRYOVER_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const CALL_RECORDS_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type CallRecordsHealth =
  | "ok"
  | "partial"
  | "identity_unavailable"
  | "needs_admin_consent"
  | "not_configured"
  | "unavailable";

export interface CallInterval {
  startIso: string;
  endIso: string;
}

export type TeamCallRecordSignal = TeamCallSignal & {
  intervals?: CallInterval[];
  joinWebUrl?: string | null;
};

export interface FetchCallRecordsResult {
  calls: TeamCallRecordSignal[];
  status: CallRecordsHealth;
  error?: string;
}

export interface FetchCallRecordsInput {
  userAadObjectId: string | null;
  from: string;
  to: string;
  timezone?: string | null;
  timeZone?: string | null;
}

interface TokenResponse {
  access_token?: string;
}

interface GraphIdentitySet {
  user?: {
    id?: string;
    displayName?: string;
    userPrincipalName?: string;
  } | null;
}

interface GraphIdentity {
  id?: string;
  displayName?: string | null;
}

interface GraphEndpoint {
  associatedIdentity?: GraphIdentity | null;
  identity?: GraphIdentitySet | null;
}

interface GraphSession {
  caller?: GraphEndpoint | null;
  callee?: GraphEndpoint | null;
  modalities?: string[];
  startDateTime?: string;
  endDateTime?: string;
}

interface GraphCallRecord {
  id: string;
  type?: string;
  startDateTime?: string;
  endDateTime?: string;
  modalities?: string[];
  joinWebUrl?: string | null;
}

interface GraphCollectionResponse<T> {
  value?: T[];
  "@odata.nextLink"?: string;
  "sessions@odata.nextLink"?: string;
}

interface RequestBudget {
  remaining: number;
  exhausted: boolean;
  deadlineAt: number;
}

interface WindowBounds {
  start: Date;
  end: Date;
  listStart: Date;
  listEnd: Date;
  startIso: string;
  endIso: string;
  listStartIso: string;
  listEndIso: string;
  beforeRetention: boolean;
  entirelyBeforeRetention: boolean;
  entirelyFuture: boolean;
}

interface SessionRead {
  sessions: GraphSession[];
  partial: boolean;
  forbidden: boolean;
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function jsonHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "odata.maxpagesize=60, include-unknown-enum-members",
  };
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  budget: RequestBudget,
): Promise<{ response: Response; data: T | null }> {
  const timeLeft = budget.deadlineAt - Date.now();
  if (budget.remaining <= 0 || timeLeft <= 0) {
    budget.exhausted = true;
    throw new Error("request_budget_exhausted");
  }

  budget.remaining -= 1;

  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(CALL_RECORDS_TIMEOUT_MS, timeLeft),
  );

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      cache: "no-store",
    });
    const data = response.ok ? ((await response.json()) as T) : null;

    return { response, data };
  } finally {
    clearTimeout(timer);
  }
}

function safeGraphUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    if (url.origin !== GRAPH_ORIGIN) return null;
    if (!url.pathname.startsWith("/v1.0/communications/callRecords")) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function parseDateTimeParts(dateTime: string): {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
} {
  const [datePart, timePart = "00:00:00"] = dateTime.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour = 0, minute = 0, second = 0] = timePart.split(":").map(Number);

  return { year, month, day, hour, minute, second };
}

function partsInTimeZone(
  instant: Date,
  timeZone: string,
): ReturnType<typeof parseDateTimeParts> {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const value = (type: string): number =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hour: value("hour"),
    minute: value("minute"),
    second: value("second"),
  };
}

function localDateTimeToUtc(dateTime: string, timeZone: string): Date {
  const target = parseDateTimeParts(dateTime);
  let guess = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );

  for (let i = 0; i < 4; i += 1) {
    const actual = partsInTimeZone(new Date(guess), timeZone);
    const targetUtc = Date.UTC(
      target.year,
      target.month - 1,
      target.day,
      target.hour,
      target.minute,
      target.second,
    );
    const actualUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const delta = targetUtc - actualUtc;
    if (delta === 0) break;
    guess += delta;
  }

  return new Date(guess);
}

function buildWindowBounds(
  from: string,
  to: string,
  rawTimeZone: string | null | undefined,
): WindowBounds | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  if (from > to) return null;

  const timeZone = normalizeTimeZone(rawTimeZone);
  const start = localDateTimeToUtc(`${from}T00:00:00`, timeZone);
  const end = localDateTimeToUtc(`${shiftDay(to, 1)}T00:00:00`, timeZone);
  const now = new Date();
  const retentionStart = new Date(now.getTime() - CALL_RECORDS_RETENTION_MS);
  const carryoverStart = new Date(start.getTime() - CARRYOVER_LOOKBACK_MS);
  const listStart = new Date(
    Math.max(carryoverStart.getTime(), retentionStart.getTime()),
  );
  const listEnd = new Date(Math.min(end.getTime(), now.getTime()));
  const entirelyBeforeRetention = end <= retentionStart;
  const entirelyFuture = start >= now;

  return {
    start,
    end,
    listStart,
    listEnd,
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    listStartIso: listStart.toISOString(),
    listEndIso: listEnd.toISOString(),
    beforeRetention: carryoverStart < retentionStart,
    entirelyBeforeRetention,
    entirelyFuture,
  };
}

function tenantTokenUrl(tenantId: string): string | null {
  if (!isUuid(tenantId)) return null;

  const url = new URL(`${LOGIN_ORIGIN}/${tenantId}/oauth2/v2.0/token`);
  return url.toString();
}

function readAppConfig(): {
  tenantId: string;
  clientId: string;
  clientSecret: string;
} | null {
  const tenantId =
    process.env.MICROSOFT_TENANT_ID ?? process.env.AZURE_AD_TENANT_ID;
  const clientId =
    process.env.MICROSOFT_CLIENT_ID ?? process.env.AZURE_AD_CLIENT_ID;
  const clientSecret =
    process.env.MICROSOFT_CLIENT_SECRET ?? process.env.AZURE_AD_CLIENT_SECRET;

  if (!isUuid(tenantId) || !isUuid(clientId) || !clientSecret) {
    return null;
  }

  return { tenantId, clientId, clientSecret };
}

async function getApplicationToken(
  budget: RequestBudget,
): Promise<string | null> {
  const config = readAppConfig();
  const tokenUrl = config ? tenantTokenUrl(config.tenantId) : null;

  if (!config || !tokenUrl) {
    return null;
  }

  try {
    const { response, data } = await fetchJson<TokenResponse>(
      tokenUrl,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          grant_type: "client_credentials",
          scope: "https://graph.microsoft.com/.default",
        }),
      },
      budget,
    );

    if (!response.ok) {
      console.warn(
        "[call-records] client_credentials token request rejected:",
        response.status,
      );
      return null;
    }

    return data?.access_token ?? null;
  } catch (error: unknown) {
    if (
      budget.exhausted ||
      (error instanceof Error && error.name === "AbortError")
    ) {
      throw error;
    }

    console.error("[call-records] failed to get app token:", error);
    return null;
  }
}

function endpointIdentity(endpoint: GraphEndpoint | null | undefined): {
  id: string | null;
  displayName: string | null;
} {
  const associated = endpoint?.associatedIdentity;
  if (associated?.id) {
    return {
      id: associated.id,
      displayName: associated.displayName ?? null,
    };
  }

  const user = endpoint?.identity?.user;
  return {
    id: user?.id ?? null,
    displayName: user?.displayName ?? user?.userPrincipalName ?? null,
  };
}

function clipInterval(
  startIso: string | undefined,
  endIso: string | undefined,
  window: WindowBounds,
): CallInterval | null {
  if (!startIso || !endIso) return null;

  const start = new Date(startIso);
  const end = new Date(endIso);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  if (end <= start) return null;

  const clippedStart = new Date(
    Math.max(start.getTime(), window.start.getTime()),
  );
  const clippedEnd = new Date(Math.min(end.getTime(), window.end.getTime()));
  if (clippedEnd <= clippedStart) return null;

  return {
    startIso: clippedStart.toISOString(),
    endIso: clippedEnd.toISOString(),
  };
}

function mergeIntervals(intervals: CallInterval[]): CallInterval[] {
  const sorted = [...intervals].sort((a, b) =>
    a.startIso.localeCompare(b.startIso),
  );
  const merged: CallInterval[] = [];

  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous) {
      merged.push(interval);
      continue;
    }

    if (new Date(interval.startIso) <= new Date(previous.endIso)) {
      if (new Date(interval.endIso) > new Date(previous.endIso)) {
        previous.endIso = interval.endIso;
      }
      continue;
    }

    merged.push(interval);
  }

  return merged;
}

function intervalMinutes(intervals: CallInterval[]): number {
  const totalSeconds = intervals.reduce((sum, interval) => {
    const start = new Date(interval.startIso).getTime();
    const end = new Date(interval.endIso).getTime();
    return sum + Math.floor((end - start) / 1_000);
  }, 0);

  return Math.floor(totalSeconds / 60);
}

function buildCallSignal(
  record: GraphCallRecord,
  sessions: GraphSession[],
  userAadObjectId: string,
  window: WindowBounds,
): TeamCallRecordSignal | null {
  const intervals: CallInterval[] = [];
  let callerName: string | null = null;
  let calleeName: string | null = null;
  let otherParticipantName = "Chamada do Teams";
  const mediaTypes = new Set(record.modalities ?? []);

  for (const session of sessions) {
    const caller = endpointIdentity(session.caller);
    const callee = endpointIdentity(session.callee);
    const userIsCaller = caller.id === userAadObjectId;
    const userIsCallee = callee.id === userAadObjectId;

    if (!userIsCaller && !userIsCallee) continue;

    callerName = caller.displayName ?? callerName;
    calleeName = callee.displayName ?? calleeName;
    const otherName = userIsCaller ? callee.displayName : caller.displayName;
    if (otherName) otherParticipantName = otherName;

    for (const modality of session.modalities ?? []) {
      mediaTypes.add(modality);
    }

    const interval = clipInterval(
      session.startDateTime,
      session.endDateTime,
      window,
    );
    if (interval) intervals.push(interval);
  }

  const mergedIntervals = mergeIntervals(intervals);
  const minutes = intervalMinutes(mergedIntervals);
  if (minutes < 1 || mergedIntervals.length === 0) return null;

  return {
    id: record.id,
    startIso: mergedIntervals[0].startIso,
    endIso: mergedIntervals[mergedIntervals.length - 1].endIso,
    minutes,
    otherParticipantName,
    callerName,
    calleeName,
    callType: record.type === "groupCall" ? "groupCall" : "peerToPeer",
    mediaTypes: [...mediaTypes],
    intervals: mergedIntervals,
    joinWebUrl: record.joinWebUrl ?? null,
  };
}

async function listCallRecords(
  token: string,
  userAadObjectId: string,
  window: WindowBounds,
  budget: RequestBudget,
): Promise<{
  records: GraphCallRecord[];
  partial: boolean;
  forbidden: boolean;
}> {
  const records: GraphCallRecord[] = [];
  let partial = false;
  let nextUrl: string | null = null;

  const listUrl = new URL(`${GRAPH_BASE}/communications/callRecords`);
  listUrl.searchParams.set(
    "$filter",
    `startDateTime ge ${window.listStartIso} and startDateTime lt ${window.listEndIso} and participants_v2/any(p:p/id eq '${userAadObjectId}')`,
  );
  listUrl.searchParams.set(
    "$select",
    "id,type,startDateTime,endDateTime,modalities,joinWebUrl",
  );
  nextUrl = listUrl.toString();

  for (let page = 0; nextUrl && page < MAX_LIST_PAGES; page += 1) {
    const safeUrl = safeGraphUrl(nextUrl);
    if (!safeUrl) {
      partial = true;
      break;
    }

    const { response, data } = await fetchJson<
      GraphCollectionResponse<GraphCallRecord>
    >(safeUrl, { headers: jsonHeaders(token) }, budget);

    if (response.status === 403) {
      return { records: [], partial: false, forbidden: true };
    }

    if (!response.ok) {
      throw new Error(`call_records_list_${response.status}`);
    }

    records.push(...(data?.value ?? []));
    if (records.length >= MAX_RECORDS) {
      partial = true;
      break;
    }

    nextUrl = data?.["@odata.nextLink"] ?? null;
  }

  if (nextUrl) partial = true;

  return { records: records.slice(0, MAX_RECORDS), partial, forbidden: false };
}

async function listSessionsForRecord(
  token: string,
  recordId: string,
  budget: RequestBudget,
): Promise<SessionRead> {
  const sessions: GraphSession[] = [];
  let partial = false;
  let nextUrl: string | null =
    `${GRAPH_BASE}/communications/callRecords/${encodeURIComponent(
      recordId,
    )}/sessions`;

  for (
    let page = 0;
    nextUrl && page < MAX_SESSION_PAGES_PER_RECORD;
    page += 1
  ) {
    const safeUrl = safeGraphUrl(nextUrl);
    if (!safeUrl) {
      partial = true;
      break;
    }

    const { response, data } = await fetchJson<
      GraphCollectionResponse<GraphSession>
    >(safeUrl, { headers: jsonHeaders(token) }, budget);

    if (response.status === 403) {
      return { sessions: [], partial: false, forbidden: true };
    }

    if (!response.ok) {
      partial = true;
      break;
    }

    sessions.push(...(data?.value ?? []));
    nextUrl =
      data?.["@odata.nextLink"] ?? data?.["sessions@odata.nextLink"] ?? null;
  }

  if (nextUrl) partial = true;

  return { sessions, partial, forbidden: false };
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < items.length) {
      const item = items[cursor];
      cursor += 1;
      results.push(await mapper(item));
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );

  return results;
}

/**
 * Fetches Teams calls for a given local date range.
 *
 * Never throws: Microsoft-side failures degrade into status codes.
 */
export async function fetchTeamCallRecords(
  input: FetchCallRecordsInput,
): Promise<FetchCallRecordsResult> {
  const { userAadObjectId, from, to } = input;
  const timezone = input.timezone ?? input.timeZone;

  if (!isUuid(userAadObjectId)) {
    return {
      calls: [],
      status: "identity_unavailable",
      error: "Microsoft user object id is missing or invalid.",
    };
  }

  const window = buildWindowBounds(from, to, timezone);
  if (!window) {
    return {
      calls: [],
      status: "unavailable",
      error: "Invalid date range.",
    };
  }

  if (window.entirelyFuture) {
    return { calls: [], status: "ok" };
  }

  if (window.entirelyBeforeRetention || window.listEnd <= window.listStart) {
    return {
      calls: [],
      status: "partial",
      error:
        "Microsoft Graph call records are only available inside the retention window.",
    };
  }

  const budget: RequestBudget = {
    remaining: MAX_GRAPH_REQUESTS,
    exhausted: false,
    deadlineAt: Date.now() + CALL_RECORDS_TOTAL_TIMEOUT_MS,
  };

  try {
    const appToken = await getApplicationToken(budget);
    if (!appToken) {
      return { calls: [], status: "not_configured" };
    }

    const list = await listCallRecords(
      appToken,
      userAadObjectId,
      window,
      budget,
    );

    if (list.forbidden) {
      return {
        calls: [],
        status: "needs_admin_consent",
        error:
          "A permissao CallRecords.Read.All precisa estar concedida como application permission no Microsoft Entra.",
      };
    }

    let partial = list.partial || window.beforeRetention;
    let forbidden = false;
    const sessionReads = await mapWithConcurrency(
      list.records,
      MAX_SESSION_CONCURRENCY,
      async (
        record,
      ): Promise<{ record: GraphCallRecord; read: SessionRead }> => {
        try {
          return {
            record,
            read: await listSessionsForRecord(appToken, record.id, budget),
          };
        } catch {
          return {
            record,
            read: { sessions: [], partial: true, forbidden: false },
          };
        }
      },
    );

    const calls: TeamCallRecordSignal[] = [];

    for (const { record, read } of sessionReads) {
      partial = partial || read.partial;
      forbidden = forbidden || read.forbidden;

      const signal = buildCallSignal(
        record,
        read.sessions,
        userAadObjectId,
        window,
      );
      if (signal) calls.push(signal);
    }

    if (forbidden) {
      return {
        calls,
        status: calls.length > 0 ? "partial" : "needs_admin_consent",
        error: "Some call record session requests were forbidden.",
      };
    }

    calls.sort((a, b) => a.startIso.localeCompare(b.startIso));

    return {
      calls,
      status: partial || budget.exhausted ? "partial" : "ok",
      error:
        partial || budget.exhausted
          ? "Microsoft Graph returned only part of the call records."
          : undefined,
    };
  } catch (error: unknown) {
    if (error instanceof Error && error.name === "AbortError") {
      return { calls: [], status: "partial", error: "Timeout" };
    }

    if (budget.exhausted) {
      return {
        calls: [],
        status: "partial",
        error: "Microsoft Graph returned only part of the call records.",
      };
    }

    console.error("[call-records] fetch error:", error);
    return { calls: [], status: "unavailable" };
  }
}
