import { completeText } from "@/lib/ai/completion";
import { getAppTimeZone, normalizeTimeZone, shiftDay } from "@/lib/timezone";

const GRAPH_BASE = "https://graph.microsoft.com/v1.0";
const DEFAULT_TIMEOUT_MS = 8_000;
const DEFAULT_DOCUMENT_LIMIT = 25;
const DEFAULT_REPORT_LIMIT = 3;
const DEFAULT_TRANSCRIPT_LIMIT = 60_000;
const MAX_ATTENDANCE_INTERVAL_MS = 12 * 60 * 60 * 1000;

export type MicrosoftMemoryAvailability =
  | "ok"
  | "missing_scope"
  | "not_found"
  | "unavailable";

export interface MicrosoftMemorySourceStatus {
  availability: MicrosoftMemoryAvailability;
  available: boolean;
  message?: string;
}

export interface MicrosoftMemoryDocumentSignal {
  id: string;
  name: string;
  webUrl: string | null;
  lastModifiedDateTime: string;
  lastModifiedByName: string | null;
  lastModifiedByEmail: string | null;
  editedBySignedInUser: boolean | null;
  parentSiteId: string | null;
  driveId: string | null;
  source: "microsoft_search_drive_item";
}

export interface FetchDocumentSignalsOptions {
  limit?: number;
  timeoutMs?: number;
  userObjectId?: string | null;
  timeZone?: string;
  /**
   * Optional Microsoft Search KQL/text narrowing supplied by the caller, such
   * as a project or client name. The date predicate is always added by this
   * module and results are filtered again after parsing.
   */
  queryTerms?: string;
}

export interface FetchDocumentSignalsResult {
  documents: MicrosoftMemoryDocumentSignal[];
  source: MicrosoftMemorySourceStatus;
}

export interface AttendanceInterval {
  joinedAt: string;
  leftAt: string;
  minutes: number;
}

export interface MeetingAttendanceSignal {
  meetingId: string;
  reportId: string;
  meetingStartDateTime: string | null;
  meetingEndDateTime: string | null;
  totalMinutes: number;
  intervals: AttendanceInterval[];
  source: "teams_attendance_report";
}

export interface MeetingTranscriptSummary {
  text: string;
  provider: string | null;
  source: "teams_transcript";
}

export interface FetchMeetingMemoryOptions {
  summarize?: boolean;
  timeoutMs?: number;
  maxReports?: number;
  maxTranscriptChars?: number;
  /** Calendar event occurrence start. Required for recurring meetings. */
  eventStartIso?: string;
}

export interface FetchMeetingMemoryResult {
  meetingId: string | null;
  attendance: MeetingAttendanceSignal | null;
  transcriptSummary: MeetingTranscriptSummary | null;
  sources: {
    onlineMeeting: MicrosoftMemorySourceStatus;
    attendance: MicrosoftMemorySourceStatus;
    transcript: MicrosoftMemorySourceStatus;
  };
}

interface GraphSearchResponse {
  value?: Array<{
    hitsContainers?: Array<{
      hits?: Array<{
        hitId?: string;
        resource?: GraphDriveItem;
      }>;
    }>;
  }>;
}

interface GraphDriveIdentity {
  id?: string;
  displayName?: string;
  email?: string;
  userPrincipalName?: string;
}

interface GraphDriveItem {
  id?: string;
  name?: string;
  webUrl?: string;
  lastModifiedDateTime?: string;
  fileSystemInfo?: {
    lastModifiedDateTime?: string;
  };
  lastModifiedBy?: {
    user?: GraphDriveIdentity;
  };
  parentReference?: {
    siteId?: string;
    driveId?: string;
  };
}

interface GraphOnlineMeeting {
  id?: string;
}

interface GraphCollection<T> {
  value?: T[];
  "@odata.nextLink"?: string;
}

interface GraphAttendanceReport {
  id?: string;
  meetingStartDateTime?: string;
  meetingEndDateTime?: string;
}

interface GraphAttendanceRecord {
  emailAddress?: string;
  identity?: {
    user?: {
      displayName?: string;
      id?: string;
      userPrincipalName?: string;
    };
  };
  attendanceIntervals?: Array<{
    joinDateTime?: string;
    leaveDateTime?: string;
  }>;
  totalAttendanceInSeconds?: number;
}

interface GraphCallTranscript {
  id?: string;
  createdDateTime?: string;
}

function sourceStatus(
  availability: MicrosoftMemoryAvailability,
  message?: string,
): MicrosoftMemorySourceStatus {
  const available = availability === "ok";
  return message
    ? { availability, available, message }
    : { availability, available };
}

async function statusFromResponse(
  response: Response,
): Promise<MicrosoftMemorySourceStatus> {
  if (response.status === 403) {
    const body: unknown = await response.json().catch(() => null);
    if (body && typeof body === "object" && "error" in body) {
      const error = body.error;
      if (error && typeof error === "object" && "innerError" in error) {
        const innerError = error.innerError;
        if (
          innerError &&
          typeof innerError === "object" &&
          "code" in innerError &&
          innerError.code === "GraphAccessToTranscriptsDisabled"
        ) {
          return sourceStatus(
            "unavailable",
            "O tenant desabilitou o acesso a transcrições.",
          );
        }
      }
    }
  }
  if (response.status === 401 || response.status === 403)
    return sourceStatus("missing_scope");
  if (response.status === 404) return sourceStatus("not_found");
  return sourceStatus("unavailable", `Graph returned HTTP ${response.status}`);
}

function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

function isValidIso(value: string | null | undefined): value is string {
  if (!value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function localDateTimeToUtcIso(
  date: string,
  timeZone: string,
  hour: number,
  minute: number,
): string {
  const normalizedTimeZone = normalizeTimeZone(timeZone);
  const [yearText, monthText, dayText] = date.split("-");
  const year = Number.parseInt(yearText ?? "", 10);
  const month = Number.parseInt(monthText ?? "", 10);
  const day = Number.parseInt(dayText ?? "", 10);

  if (!year || !month || !day) {
    throw new Error(`Invalid date: ${date}`);
  }

  let utcMs = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: normalizedTimeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const parts = Object.fromEntries(
      formatter
        .formatToParts(new Date(utcMs))
        .map((part) => [part.type, part.value]),
    );
    const seenAsUtc = Date.UTC(
      Number.parseInt(parts.year ?? "", 10),
      Number.parseInt(parts.month ?? "", 10) - 1,
      Number.parseInt(parts.day ?? "", 10),
      Number.parseInt(parts.hour ?? "", 10),
      Number.parseInt(parts.minute ?? "", 10),
      Number.parseInt(parts.second ?? "", 10),
      0,
    );
    const wantedAsUtc = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    const delta = seenAsUtc - wantedAsUtc;
    if (delta === 0) break;
    utcMs -= delta;
  }

  return new Date(utcMs).toISOString();
}

export function buildMicrosoftMemoryDayWindow(
  date: string,
  timeZone: string = getAppTimeZone(),
): {
  startIso: string;
  endIso: string;
} {
  return {
    startIso: localDateTimeToUtcIso(date, timeZone, 0, 0),
    endIso: localDateTimeToUtcIso(shiftDay(date, 1), timeZone, 0, 0),
  };
}

async function graphFetch(
  accessToken: string,
  url: string,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      signal: controller.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(timer);
  }
}

function graphErrorStatus(error: unknown): MicrosoftMemorySourceStatus {
  if (error instanceof Error && error.name === "AbortError") {
    return sourceStatus("unavailable", "Graph request timed out");
  }

  return sourceStatus("unavailable");
}

export function buildDocumentSearchRequest(
  date: string,
  options: FetchDocumentSignalsOptions = {},
): Record<string, unknown> {
  const { startIso, endIso } = buildMicrosoftMemoryDayWindow(
    date,
    options.timeZone,
  );
  const dateQuery = `LastModifiedTime>=${startIso} LastModifiedTime<${endIso}`;
  const queryString = options.queryTerms
    ? `${options.queryTerms.trim()} ${dateQuery}`
    : dateQuery;

  return {
    requests: [
      {
        entityTypes: ["driveItem"],
        query: {
          queryString,
        },
        sortProperties: [{ name: "LastModifiedTime", isDescending: true }],
        fields: [
          "id",
          "name",
          "webUrl",
          "lastModifiedDateTime",
          "lastModifiedBy",
          "parentReference",
        ],
        from: 0,
        size: Math.max(
          1,
          Math.min(options.limit ?? DEFAULT_DOCUMENT_LIMIT, 50),
        ),
      },
    ],
  };
}

export function mapSearchDocuments(
  response: GraphSearchResponse,
  date: string,
  userEmail: string,
  timeZone: string = getAppTimeZone(),
  userObjectId?: string | null,
): MicrosoftMemoryDocumentSignal[] {
  const { startIso, endIso } = buildMicrosoftMemoryDayWindow(date, timeZone);
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const signedInEmail = normalizeEmail(userEmail);
  const documents = new Map<string, MicrosoftMemoryDocumentSignal>();

  for (const value of response.value ?? []) {
    for (const container of value.hitsContainers ?? []) {
      for (const hit of container.hits ?? []) {
        const item = hit.resource;
        if (!item?.name) continue;

        const lastModifiedDateTime =
          item.lastModifiedDateTime ??
          item.fileSystemInfo?.lastModifiedDateTime;
        if (!isValidIso(lastModifiedDateTime)) continue;

        const modifiedMs = new Date(lastModifiedDateTime).getTime();
        if (modifiedMs < startMs || modifiedMs >= endMs) continue;

        const modifier = item.lastModifiedBy?.user;
        const lastModifiedByEmail = normalizeEmail(
          modifier?.email ?? modifier?.userPrincipalName,
        );
        const editedBySignedInUser = Boolean(
          (signedInEmail &&
            lastModifiedByEmail &&
            signedInEmail === lastModifiedByEmail) ||
            (userObjectId &&
              modifier?.id &&
              userObjectId.toLowerCase() === modifier.id.toLowerCase()),
        );

        if (!editedBySignedInUser) continue;

        const id =
          item.id ??
          hit.hitId ??
          `${item.webUrl ?? item.name}:${lastModifiedDateTime}`;
        if (documents.has(id)) continue;

        documents.set(id, {
          id,
          name: item.name,
          webUrl: item.webUrl ?? null,
          lastModifiedDateTime,
          lastModifiedByName: modifier?.displayName ?? null,
          lastModifiedByEmail,
          editedBySignedInUser,
          parentSiteId: item.parentReference?.siteId ?? null,
          driveId: item.parentReference?.driveId ?? null,
          source: "microsoft_search_drive_item",
        });
      }
    }
  }

  return [...documents.values()].sort((left, right) =>
    left.lastModifiedDateTime.localeCompare(right.lastModifiedDateTime),
  );
}

export async function fetchDocumentSignals(
  accessToken: string,
  date: string,
  userEmail: string,
  options: FetchDocumentSignalsOptions = {},
): Promise<FetchDocumentSignalsResult> {
  try {
    const response = await graphFetch(
      accessToken,
      `${GRAPH_BASE}/search/query`,
      {
        method: "POST",
        body: JSON.stringify(buildDocumentSearchRequest(date, options)),
      },
      options.timeoutMs,
    );

    if (!response.ok) {
      return { documents: [], source: await statusFromResponse(response) };
    }

    const data = (await response.json()) as GraphSearchResponse;
    return {
      documents: mapSearchDocuments(
        data,
        date,
        userEmail,
        options.timeZone,
        options.userObjectId,
      ),
      source: sourceStatus("ok"),
    };
  } catch (error: unknown) {
    return { documents: [], source: graphErrorStatus(error) };
  }
}

function escapeODataString(value: string): string {
  return value.replace(/'/g, "''");
}

async function fetchOnlineMeetingByJoinUrl(
  accessToken: string,
  joinWebUrl: string,
  timeoutMs: number,
): Promise<{ meetingId: string | null; status: MicrosoftMemorySourceStatus }> {
  const url = new URL(`${GRAPH_BASE}/me/onlineMeetings`);
  url.searchParams.set(
    "$filter",
    `JoinWebUrl eq '${escapeODataString(joinWebUrl)}'`,
  );

  try {
    const response = await graphFetch(
      accessToken,
      url.toString(),
      {},
      timeoutMs,
    );
    if (!response.ok) {
      return { meetingId: null, status: await statusFromResponse(response) };
    }

    const data = (await response.json()) as GraphCollection<GraphOnlineMeeting>;
    const meetingId = data.value?.[0]?.id ?? null;
    return {
      meetingId,
      status: meetingId ? sourceStatus("ok") : sourceStatus("not_found"),
    };
  } catch (error: unknown) {
    return { meetingId: null, status: graphErrorStatus(error) };
  }
}

function attendanceRecordMatchesUser(
  record: GraphAttendanceRecord,
  userEmail: string,
): boolean {
  const signedInEmail = normalizeEmail(userEmail);
  if (!signedInEmail) return false;

  return (
    normalizeEmail(record.emailAddress) === signedInEmail ||
    normalizeEmail(record.identity?.user?.userPrincipalName) === signedInEmail
  );
}

export function deriveSelfAttendance(
  records: GraphAttendanceRecord[],
  userEmail: string,
): { intervals: AttendanceInterval[]; totalMinutes: number } {
  const rawIntervals: Array<{ joinedMs: number; leftMs: number }> = [];

  for (const record of records) {
    if (!attendanceRecordMatchesUser(record, userEmail)) continue;

    for (const interval of record.attendanceIntervals ?? []) {
      if (
        !isValidIso(interval.joinDateTime) ||
        !isValidIso(interval.leaveDateTime)
      ) {
        continue;
      }

      const joinedMs = new Date(interval.joinDateTime).getTime();
      const leftMs = new Date(interval.leaveDateTime).getTime();
      const boundedMs = Math.max(
        0,
        Math.min(leftMs - joinedMs, MAX_ATTENDANCE_INTERVAL_MS),
      );

      if (boundedMs <= 0) continue;

      rawIntervals.push({
        joinedMs,
        leftMs: joinedMs + boundedMs,
      });
    }
  }

  rawIntervals.sort((left, right) => left.joinedMs - right.joinedMs);

  const merged: Array<{ joinedMs: number; leftMs: number }> = [];
  for (const interval of rawIntervals) {
    const previous = merged.at(-1);
    if (previous && interval.joinedMs <= previous.leftMs) {
      previous.leftMs = Math.max(previous.leftMs, interval.leftMs);
    } else {
      merged.push({ ...interval });
    }
  }

  const intervals = merged.map((interval) => ({
    joinedAt: new Date(interval.joinedMs).toISOString(),
    leftAt: new Date(interval.leftMs).toISOString(),
    minutes: Math.max(
      1,
      Math.round((interval.leftMs - interval.joinedMs) / 60_000),
    ),
  }));

  return {
    intervals,
    totalMinutes: intervals.reduce((sum, item) => sum + item.minutes, 0),
  };
}

async function listCollection<T>(
  accessToken: string,
  url: string,
  timeoutMs: number,
  maxPages: number,
): Promise<{ value: T[]; status: MicrosoftMemorySourceStatus }> {
  const value: T[] = [];
  let nextUrl: string | null = url;
  let page = 0;

  try {
    while (nextUrl && page < maxPages) {
      const response: Response = await graphFetch(
        accessToken,
        nextUrl,
        {},
        timeoutMs,
      );
      if (!response.ok)
        return { value: [], status: await statusFromResponse(response) };

      const data = (await response.json()) as GraphCollection<T>;
      value.push(...(data.value ?? []));
      nextUrl = safeGraphNextLink(data["@odata.nextLink"]);
      page += 1;
    }

    return { value, status: sourceStatus("ok") };
  } catch (error: unknown) {
    return { value: [], status: graphErrorStatus(error) };
  }
}

function safeGraphNextLink(nextLink: string | undefined): string | null {
  if (!nextLink) return null;

  try {
    const url = new URL(nextLink);
    return url.protocol === "https:" && url.hostname === "graph.microsoft.com"
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function pickAttendanceReport(
  reports: GraphAttendanceReport[],
  eventStartIso: string | undefined,
): GraphAttendanceReport | null {
  const candidates = reports.filter((report) => report.id);

  if (eventStartIso && isValidIso(eventStartIso)) {
    const eventStartMs = new Date(eventStartIso).getTime();
    const matching = candidates
      .map((report) => ({
        report,
        distanceMs: isValidIso(report.meetingStartDateTime)
          ? Math.abs(
              new Date(report.meetingStartDateTime).getTime() - eventStartMs,
            )
          : Number.POSITIVE_INFINITY,
      }))
      .filter((entry) => entry.distanceMs <= 18 * 60 * 60 * 1000)
      .sort((left, right) => left.distanceMs - right.distanceMs);

    return matching[0]?.report ?? null;
  }

  return (
    candidates.sort((left, right) =>
      (
        right.meetingEndDateTime ??
        right.meetingStartDateTime ??
        ""
      ).localeCompare(
        left.meetingEndDateTime ?? left.meetingStartDateTime ?? "",
      ),
    )[0] ?? null
  );
}

async function fetchSelfAttendance(
  accessToken: string,
  meetingId: string,
  userEmail: string,
  options: FetchMeetingMemoryOptions,
): Promise<{
  attendance: MeetingAttendanceSignal | null;
  status: MicrosoftMemorySourceStatus;
}> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const reportUrl = `${GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(
    meetingId,
  )}/attendanceReports`;
  const reports = await listCollection<GraphAttendanceReport>(
    accessToken,
    reportUrl,
    timeoutMs,
    1,
  );

  if (reports.status.availability !== "ok") {
    return { attendance: null, status: reports.status };
  }

  const report = pickAttendanceReport(
    reports.value.slice(0, options.maxReports ?? DEFAULT_REPORT_LIMIT),
    options.eventStartIso,
  );
  if (!report?.id) {
    return { attendance: null, status: sourceStatus("not_found") };
  }

  const recordsUrl = `${GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(
    meetingId,
  )}/attendanceReports/${encodeURIComponent(report.id)}/attendanceRecords`;
  const records = await listCollection<GraphAttendanceRecord>(
    accessToken,
    recordsUrl,
    timeoutMs,
    2,
  );

  if (records.status.availability !== "ok") {
    return { attendance: null, status: records.status };
  }

  const selfAttendance = deriveSelfAttendance(records.value, userEmail);
  return {
    attendance: {
      meetingId,
      reportId: report.id,
      meetingStartDateTime: report.meetingStartDateTime ?? null,
      meetingEndDateTime: report.meetingEndDateTime ?? null,
      totalMinutes: selfAttendance.totalMinutes,
      intervals: selfAttendance.intervals,
      source: "teams_attendance_report",
    },
    status: sourceStatus("ok"),
  };
}

export function pickTranscriptForEvent(
  transcripts: GraphCallTranscript[],
  eventStartIso?: string,
): GraphCallTranscript | null {
  const eventStartMs = eventStartIso ? new Date(eventStartIso).getTime() : NaN;
  const candidates = Number.isNaN(eventStartMs)
    ? transcripts
    : transcripts.filter((transcript) => {
        if (!isValidIso(transcript.createdDateTime)) return false;
        const differenceMs =
          new Date(transcript.createdDateTime).getTime() - eventStartMs;
        return (
          differenceMs >= -60 * 60 * 1000 && differenceMs <= 12 * 60 * 60 * 1000
        );
      });
  return (
    [...candidates]
      .filter((transcript) => transcript.id)
      .sort((left, right) =>
        (right.createdDateTime ?? "").localeCompare(left.createdDateTime ?? ""),
      )[0] ?? null
  );
}

function validateTranscriptSummary(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (compact.length < 12 || compact.length > 220) return false;
  return (
    !compact.includes("\n") && !compact.includes("{") && !compact.includes("}")
  );
}

export function sanitizeTranscriptForSummary(transcript: string): string {
  return transcript
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (line.toUpperCase() === "WEBVTT") return false;
      if (/^(NOTE|STYLE|REGION)\b/i.test(line)) return false;
      if (/^\d+$/.test(line)) return false;
      if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->/u.test(line)) return false;
      return true;
    })
    .map((line) => line.replace(/<v\s+[^>]+>/gi, "").replace(/<\/v>/gi, ""))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

async function summarizeTranscriptText(
  transcript: string,
): Promise<MeetingTranscriptSummary | null> {
  const sanitizedTranscript = sanitizeTranscriptForSummary(transcript);
  if (!sanitizedTranscript) return null;

  const completion = await completeText({
    system:
      "Voce resume transcricoes de reunioes para apontamento de horas. Responda em pt-BR com uma frase profissional, sem nomes sensiveis desnecessarios e sem inventar fatos.",
    prompt: `Gere uma descricao de timesheet em uma unica frase para esta reuniao:\n\n${sanitizedTranscript}`,
    timeoutMs: 12_000,
    maxTokens: 80,
    temperature: 0.2,
    validate: validateTranscriptSummary,
  });

  if (!completion) return null;

  return {
    text: completion.text.replace(/\s+/g, " ").trim(),
    provider: completion.provider,
    source: "teams_transcript",
  };
}

async function fetchTranscriptSummary(
  accessToken: string,
  meetingId: string,
  options: FetchMeetingMemoryOptions,
): Promise<{
  summary: MeetingTranscriptSummary | null;
  status: MicrosoftMemorySourceStatus;
}> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const transcriptsUrl = `${GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(
    meetingId,
  )}/transcripts`;
  const transcripts = await listCollection<GraphCallTranscript>(
    accessToken,
    transcriptsUrl,
    timeoutMs,
    1,
  );

  if (transcripts.status.availability !== "ok") {
    return { summary: null, status: transcripts.status };
  }

  const transcript = pickTranscriptForEvent(
    transcripts.value,
    options.eventStartIso,
  );
  if (!transcript?.id) {
    return { summary: null, status: sourceStatus("not_found") };
  }

  const contentUrl = `${GRAPH_BASE}/me/onlineMeetings/${encodeURIComponent(
    meetingId,
  )}/transcripts/${encodeURIComponent(transcript.id)}/content`;

  try {
    const response = await graphFetch(
      accessToken,
      contentUrl,
      {
        headers: {
          Accept: "application/vnd.microsoft.graph.transcript+text",
        },
      },
      timeoutMs,
    );

    if (!response.ok) {
      return { summary: null, status: await statusFromResponse(response) };
    }

    const transcriptText = (await response.text()).slice(
      0,
      options.maxTranscriptChars ?? DEFAULT_TRANSCRIPT_LIMIT,
    );
    const summary = await summarizeTranscriptText(transcriptText);

    return {
      summary,
      status: summary ? sourceStatus("ok") : sourceStatus("unavailable"),
    };
  } catch (error: unknown) {
    return { summary: null, status: graphErrorStatus(error) };
  }
}

export async function fetchMeetingMemory(
  accessToken: string,
  joinWebUrl: string,
  userEmail: string,
  options: FetchMeetingMemoryOptions = {},
): Promise<FetchMeetingMemoryResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const meeting = await fetchOnlineMeetingByJoinUrl(
    accessToken,
    joinWebUrl,
    timeoutMs,
  );

  const baseSources = {
    onlineMeeting: meeting.status,
    attendance: sourceStatus("not_found"),
    transcript: options.summarize
      ? sourceStatus("not_found")
      : sourceStatus("not_found", "Transcript was not requested"),
  };

  if (!meeting.meetingId) {
    return {
      meetingId: null,
      attendance: null,
      transcriptSummary: null,
      sources: baseSources,
    };
  }

  const [attendance, transcript] = await Promise.all([
    fetchSelfAttendance(accessToken, meeting.meetingId, userEmail, options),
    options.summarize
      ? fetchTranscriptSummary(accessToken, meeting.meetingId, options)
      : Promise.resolve({ summary: null, status: baseSources.transcript }),
  ]);

  return {
    meetingId: meeting.meetingId,
    attendance: attendance.attendance,
    transcriptSummary: transcript.summary,
    sources: {
      onlineMeeting: meeting.status,
      attendance: attendance.status,
      transcript: transcript.status,
    },
  };
}
