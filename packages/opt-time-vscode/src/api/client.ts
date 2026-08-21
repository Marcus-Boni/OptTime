import { type ApiErrorEnvelope, OptTimeApiError } from "./errors";
import type {
  DaySummary,
  DiscardTimerResult,
  Identity,
  LogTimeResult,
  ProjectSummary,
  StartTimerResult,
  StopTimerResult,
  SubmitTimesheetResult,
  TimeEntryView,
  TimesheetStatus,
  WorkItemResult,
} from "./types";

/**
 * Typed HTTP client for the OptSolv agent API.
 *
 * Everything the extension knows about the network lives here: the base URL,
 * the bearer token, timeouts, and the translation of failures into
 * `OptTimeApiError`. Callers get plain data or a typed throw — never a
 * `Response` to inspect.
 *
 * The token is read through a callback rather than stored, because it lives in
 * `SecretStorage` and can be replaced while the extension is running.
 */

export interface ClientOptions {
  getBaseUrl: () => string;
  getToken: () => Promise<string | undefined>;
  timeoutMs?: number;
  userAgent?: string;
  onRequest?: (method: string, path: string, status: number) => void;
}

type Query = Record<string, string | number | boolean | undefined | null>;

const DEFAULT_TIMEOUT_MS = 15_000;

export class OptTimeClient {
  constructor(private readonly options: ClientOptions) {}

  get baseUrl(): string {
    return normalizeBaseUrl(this.options.getBaseUrl());
  }

  // ── Identity ──────────────────────────────────────────────────────────

  whoami(): Promise<Identity> {
    return this.request<Identity>("GET", "");
  }

  // ── Projects & work items ─────────────────────────────────────────────

  async listProjects(query: { search?: string; limit?: number } = {}): Promise<
    ProjectSummary[]
  > {
    const data = await this.request<{ projects: ProjectSummary[] }>(
      "GET",
      "/projects",
      { query: { ...query, status: "active" } },
    );
    return data.projects;
  }

  async searchWorkItems(query: {
    q: string;
    projectId?: string;
    limit?: number;
  }): Promise<WorkItemResult[]> {
    const data = await this.request<{ workItems: WorkItemResult[] }>(
      "GET",
      "/work-items",
      { query },
    );
    return data.workItems;
  }

  // ── Timer ─────────────────────────────────────────────────────────────

  async getActiveTimer(): Promise<ActiveTimerOrNull> {
    const data = await this.request<{ timer: ActiveTimerOrNull }>(
      "GET",
      "/timer",
    );
    return data.timer;
  }

  startTimer(body: {
    projectId: string;
    description: string;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
    billable?: boolean;
  }): Promise<StartTimerResult> {
    return this.request("POST", "/timer", {
      body: { action: "start", ...body },
    });
  }

  stopTimer(): Promise<StopTimerResult> {
    return this.request("POST", "/timer", { body: { action: "stop" } });
  }

  async pauseTimer(): Promise<NonNullable<ActiveTimerOrNull>> {
    const data = await this.request<{
      timer: NonNullable<ActiveTimerOrNull>;
    }>("POST", "/timer", { body: { action: "pause" } });
    return data.timer;
  }

  async resumeTimer(): Promise<NonNullable<ActiveTimerOrNull>> {
    const data = await this.request<{
      timer: NonNullable<ActiveTimerOrNull>;
    }>("POST", "/timer", { body: { action: "resume" } });
    return data.timer;
  }

  /** Removes idle minutes from the running timer without stopping it. */
  discardTimerTime(minutes: number): Promise<DiscardTimerResult> {
    return this.request("POST", "/timer", {
      body: { action: "discard", minutes },
    });
  }

  /**
   * Edits the running timer in place.
   *
   * `azureWorkItemId: null` clears the link; omitting a field leaves it alone.
   */
  async updateTimer(patch: {
    description?: string;
    billable?: boolean;
    azureWorkItemId?: number | null;
    azureWorkItemTitle?: string;
  }): Promise<NonNullable<ActiveTimerOrNull>> {
    const data = await this.request<{
      timer: NonNullable<ActiveTimerOrNull>;
    }>("POST", "/timer", { body: { action: "update", ...patch } });
    return data.timer;
  }

  // ── Entries ───────────────────────────────────────────────────────────

  logTime(body: {
    projectId: string;
    durationMinutes: number;
    description: string;
    date?: string;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
    billable?: boolean;
  }): Promise<LogTimeResult> {
    return this.request("POST", "/time-entries", { body });
  }

  async listTimeEntries(query: {
    from?: string;
    to?: string;
    limit?: number;
  }): Promise<TimeEntryView[]> {
    const data = await this.request<{ entries: TimeEntryView[] }>(
      "GET",
      "/time-entries",
      { query },
    );
    return data.entries;
  }

  deleteTimeEntry(entryId: string): Promise<{ entryId: string }> {
    return this.request(
      "DELETE",
      `/time-entries/${encodeURIComponent(entryId)}`,
    );
  }

  getSummary(date?: string): Promise<DaySummary> {
    return this.request("GET", "/summary", { query: { date } });
  }

  // ── Timesheets ────────────────────────────────────────────────────────

  getTimesheet(period?: string): Promise<TimesheetStatus> {
    return this.request("GET", "/timesheets", { query: { period } });
  }

  submitTimesheet(
    period?: string,
    force = false,
  ): Promise<SubmitTimesheetResult> {
    return this.request("POST", "/timesheets", {
      body: { action: "submit", period, force },
    });
  }

  // ── Transport ─────────────────────────────────────────────────────────

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options?: { query?: Query; body?: unknown },
  ): Promise<T> {
    const token = await this.options.getToken();
    if (!token) {
      throw new OptTimeApiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "Nenhuma conta OptSolv conectada.",
        hint: "Rode 'Opt-Time: Conectar Conta' para colar seu token pessoal.",
      });
    }

    const url = new URL(`${this.baseUrl}/api/v1/me${path}`);
    for (const [key, value] of Object.entries(options?.query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "User-Agent": this.options.userAgent ?? "opt-time-vscode",
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      this.options.onRequest?.(method, url.pathname, response.status);

      const text = await response.text();
      const payload: unknown = text ? safeJsonParse(text) : null;

      if (!response.ok) {
        throw toApiError(response.status, payload);
      }

      return payload as T;
    } catch (error: unknown) {
      throw normalizeTransportError(error, this.baseUrl);
    } finally {
      clearTimeout(timeout);
    }
  }
}

/** Narrow alias so the timer methods stay readable. */
type ActiveTimerOrNull = import("./types").ActiveTimer | null;

function toApiError(status: number, payload: unknown): OptTimeApiError {
  const envelope =
    payload && typeof payload === "object" && "error" in payload
      ? (payload as ApiErrorEnvelope).error
      : null;

  return new OptTimeApiError({
    status,
    code: envelope?.code ?? "UNKNOWN",
    message: envelope?.message ?? `A API do OptSolv respondeu ${status}.`,
    hint: envelope?.hint ?? null,
    details: envelope?.details ?? null,
  });
}

function normalizeTransportError(
  error: unknown,
  baseUrl: string,
): OptTimeApiError {
  if (error instanceof OptTimeApiError) return error;

  if (error instanceof Error && error.name === "AbortError") {
    return new OptTimeApiError({
      status: 504,
      code: "TIMEOUT",
      message: "O OptSolv não respondeu a tempo.",
      hint: "Verifique sua conexão e tente novamente.",
    });
  }

  return new OptTimeApiError({
    status: 0,
    code: "NETWORK_ERROR",
    message: `Não foi possível falar com ${baseUrl}.`,
    hint: "Confira a configuração 'optTime.baseUrl' e se você está na rede corporativa.",
    details: error instanceof Error ? error.message : String(error),
  });
}

/**
 * Trims the base URL the way the MCP package does.
 *
 * Pasting the API URL instead of the app URL is the single most common setup
 * mistake, and it fails with a confusing 404 — so a trailing `/api/v1` is
 * stripped rather than rejected.
 */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "").replace(/\/api(\/v1)?(\/me)?$/i, "");
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
