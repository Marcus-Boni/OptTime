import { type OptSolvConfig, SERVER_VERSION } from "./config.js";

/**
 * Typed HTTP client for the OptSolv agent API (`/api/v1/me/*`).
 *
 * Every tool in this package goes through here, which keeps authentication,
 * timeouts and error translation in one place. Server errors arrive in a fixed
 * envelope (`{ error: { code, message, hint } }`) and are re-thrown as
 * `OptSolvApiError` so tool handlers can surface the message and the hint to
 * the model without inspecting HTTP status codes.
 */

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
    hint?: string | null;
  };
}

export class OptSolvApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly hint: string | null;
  readonly details: unknown;

  constructor(
    status: number,
    body: ApiErrorBody["error"] | null,
    fallback: string,
  ) {
    super(body?.message ?? fallback);
    this.name = "OptSolvApiError";
    this.status = status;
    this.code = body?.code ?? "UNKNOWN";
    this.hint = body?.hint ?? null;
    this.details = body?.details ?? null;
  }

  /** Message plus actionable hint, formatted for a model to read. */
  toAgentText(): string {
    const parts = [`❌ ${this.message}`];
    if (this.hint) parts.push(`💡 ${this.hint}`);
    if (this.details) parts.push(`Detalhes: ${JSON.stringify(this.details)}`);
    return parts.join("\n");
  }
}

// ─── Response shapes ───────────────────────────────────────────────────

export interface ProjectSummary {
  id: string;
  name: string;
  code: string;
  color: string;
  status: string;
  billable: boolean;
  clientName: string | null;
  azureProjectId: string | null;
}

export interface ActiveTimer {
  id: string;
  description: string;
  billable: boolean;
  startedAt: string;
  pausedAt: string | null;
  isPaused: boolean;
  elapsedMinutes: number;
  elapsedLabel: string;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  project: { id: string; name: string; code: string; color: string };
}

export interface TimeEntryView {
  id: string;
  date: string;
  durationMinutes: number;
  durationLabel: string;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  locked: boolean;
  project: { id: string; name: string; code: string; color: string };
}

export interface DaySummary {
  date: string;
  weekday: string;
  totalMinutes: number;
  totalLabel: string;
  billableMinutes: number;
  entryCount: number;
  dailyCapacityMinutes: number;
  remainingMinutes: number;
  remainingLabel: string;
  isComplete: boolean;
  byProject: Array<{
    projectId: string;
    projectName: string;
    projectCode: string;
    minutes: number;
    label: string;
  }>;
  entries: TimeEntryView[];
  activeTimer: ActiveTimer | null;
  weekTotalMinutes: number;
  weekTotalLabel: string;
  weeklyCapacityMinutes: number;
}

export interface TimesheetStatus {
  period: string;
  periodStart: string;
  periodEnd: string;
  status: "open" | "submitted" | "approved" | "rejected";
  statusLabel: string;
  totalMinutes: number;
  totalLabel: string;
  billableMinutes: number;
  weeklyCapacityMinutes: number;
  entryCount: number;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  rejectionReason: string | null;
  canSubmit: boolean;
  days: Array<{
    date: string;
    weekday: string;
    minutes: number;
    label: string;
    isWeekend: boolean;
    isBelowTarget: boolean;
  }>;
  warnings: string[];
}

export interface WorkItemResult {
  id: number;
  title: string;
  type: string;
  state: string;
  projectName: string;
  url: string | null;
}

export interface Identity {
  user: { id: string; name: string; email: string; role: string };
  token: { name: string; scopes: string[]; legacy: boolean };
  capacity: { weeklyMinutes: number; dailyMinutes: number };
  today: {
    date: string;
    totalMinutes: number;
    totalLabel: string;
    remainingMinutes: number;
    entryCount: number;
    activeTimer: ActiveTimer | null;
  };
}

export interface DailySuggestions {
  date: string;
  alreadyLoggedMinutes: number;
  alreadyLoggedLabel: string;
  sources: { commits: number; azureDevOpsAvailable: boolean };
  notes: string[];
  suggestions: Array<{
    projectId: string | null;
    projectName: string | null;
    description: string;
    date: string;
    durationMinutes: number;
    durationLabel: string;
    billable: boolean;
    azureWorkItemId: number | null;
    confidence: "high" | "medium" | "low";
    reasons: string[];
  }>;
}

export interface LogTimeResult {
  entry: TimeEntryView;
  dayTotalMinutes: number;
  dayTotalLabel: string;
}

export interface StartTimerResult {
  timer: ActiveTimer;
  replaced: {
    projectName: string;
    durationMinutes: number;
    entryId: string;
  } | null;
  /** Set when a previous timer was dropped for having run under a minute. */
  discarded: { projectName: string } | null;
}

export interface StopTimerResult {
  /** False when the timer was too short to record; no entry was created. */
  saved: boolean;
  entryId: string | null;
  durationMinutes: number;
  durationLabel: string;
  elapsedSeconds: number;
  date: string;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  project: { id: string; name: string; code: string };
}

export interface SubmitTimesheetResult {
  period: string;
  status: string;
  totalMinutes: number;
  totalLabel: string;
  entryCount: number;
  submittedAt: string | null;
  warnings: string[];
}

// ─── Client ────────────────────────────────────────────────────────────

export class OptSolvClient {
  constructor(private readonly config: OptSolvConfig) {}

  get baseUrl(): string {
    return this.config.baseUrl;
  }

  private async request<T>(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    options?: {
      query?: Record<string, string | number | undefined | null>;
      body?: unknown;
    },
  ): Promise<T> {
    const url = new URL(`${this.config.baseUrl}/api/v1/me${path}`);

    for (const [key, value] of Object.entries(options?.query ?? {})) {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": `opt-time-mcp/${SERVER_VERSION}`,
        },
        body: options?.body ? JSON.stringify(options.body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      const payload: unknown = text ? safeJsonParse(text) : null;

      if (this.config.debug) {
        process.stderr.write(
          `[opt-time-mcp] ${method} ${url.pathname} → ${response.status}\n`,
        );
      }

      if (!response.ok) {
        const body =
          payload && typeof payload === "object" && "error" in payload
            ? (payload as ApiErrorBody).error
            : null;
        throw new OptSolvApiError(
          response.status,
          body,
          `A API do OptSolv respondeu ${response.status}.`,
        );
      }

      return payload as T;
    } catch (error: unknown) {
      if (error instanceof OptSolvApiError) throw error;

      if (error instanceof Error && error.name === "AbortError") {
        throw new OptSolvApiError(
          504,
          {
            code: "TIMEOUT",
            message: `A API do OptSolv não respondeu em ${this.config.timeoutMs}ms.`,
            hint: "Verifique a conexão de rede e o valor de OPT_TIME_BASE_URL.",
          },
          "Timeout",
        );
      }

      throw new OptSolvApiError(
        0,
        {
          code: "NETWORK_ERROR",
          message: `Não foi possível falar com ${this.config.baseUrl}: ${
            error instanceof Error ? error.message : "erro desconhecido"
          }`,
          hint: "Confira OPT_TIME_BASE_URL e se você está na rede correta.",
        },
        "Network error",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  // ─── Identity ───────────────────────────────────────────────────────

  whoami(): Promise<Identity> {
    return this.request<Identity>("GET", "");
  }

  // ─── Projects & work items ──────────────────────────────────────────

  listProjects(query: {
    search?: string;
    status?: string;
    limit?: number;
  }): Promise<{
    projects: ProjectSummary[];
    count: number;
    total: number;
    returned: number;
    truncated: boolean;
  }> {
    return this.request("GET", "/projects", { query });
  }

  searchWorkItems(query: {
    q: string;
    projectId?: string;
    limit?: number;
  }): Promise<{ workItems: WorkItemResult[]; searchedProjects: string[] }> {
    return this.request("GET", "/work-items", { query });
  }

  // ─── Timer ──────────────────────────────────────────────────────────

  getActiveTimer(): Promise<{ timer: ActiveTimer | null }> {
    return this.request("GET", "/timer");
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

  pauseTimer(): Promise<{ timer: ActiveTimer }> {
    return this.request("POST", "/timer", { body: { action: "pause" } });
  }

  resumeTimer(): Promise<{ timer: ActiveTimer }> {
    return this.request("POST", "/timer", { body: { action: "resume" } });
  }

  // ─── Entries ────────────────────────────────────────────────────────

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

  listTimeEntries(query: {
    from?: string;
    to?: string;
    projectId?: string;
    limit?: number;
  }): Promise<{
    entries: TimeEntryView[];
    count: number;
    totalMinutes: number;
    from: string;
    to: string;
  }> {
    return this.request("GET", "/time-entries", { query });
  }

  updateTimeEntry(
    entryId: string,
    body: Record<string, unknown>,
  ): Promise<{ entry: TimeEntryView }> {
    return this.request(
      "PATCH",
      `/time-entries/${encodeURIComponent(entryId)}`,
      { body },
    );
  }

  deleteTimeEntry(
    entryId: string,
  ): Promise<{ entryId: string; durationMinutes: number; date: string }> {
    return this.request(
      "DELETE",
      `/time-entries/${encodeURIComponent(entryId)}`,
    );
  }

  getSummary(date?: string): Promise<DaySummary> {
    return this.request("GET", "/summary", { query: { date } });
  }

  getSuggestions(date?: string): Promise<DailySuggestions> {
    return this.request("GET", "/suggestions", { query: { date } });
  }

  // ─── Timesheets ─────────────────────────────────────────────────────

  getTimesheetStatus(period?: string): Promise<TimesheetStatus> {
    return this.request("GET", "/timesheets", { query: { period } });
  }

  submitTimesheet(
    period?: string,
    force?: boolean,
  ): Promise<SubmitTimesheetResult> {
    return this.request("POST", "/timesheets", {
      body: { action: "submit", period, force: force ?? false },
    });
  }

  /** Public server catalog, used by `opt-time-mcp doctor`. */
  async fetchManifest(): Promise<{
    version: string;
    counts: { tools: number; resources: number; prompts: number };
    tools: Array<{ name: string }>;
  }> {
    const response = await fetch(`${this.config.baseUrl}/api/mcp/manifest`);
    if (!response.ok) {
      throw new OptSolvApiError(
        response.status,
        null,
        `Não foi possível ler o manifesto em ${this.config.baseUrl}/api/mcp/manifest.`,
      );
    }
    return (await response.json()) as {
      version: string;
      counts: { tools: number; resources: number; prompts: number };
      tools: Array<{ name: string }>;
    };
  }
}

function safeJsonParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}
