/**
 * TimeBot — Core agent contracts shared between providers, tools, API routes
 * and the chat UI.
 */

import type { AppRole } from "@/lib/access-control";

export type ProviderName = "gemini" | "groq" | "openrouter" | "local_fallback";

/** JSON-Schema (draft-07 subset) used to declare tool parameters. */
export interface JsonSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
}

export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/** Public description of a tool as sent to the model. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JsonSchemaObject;
}

/** A tool invocation requested by the model. */
export interface ToolCall {
  id: string;
  name: string;
  /** Raw arguments object as produced by the model (unvalidated). */
  args: Record<string, unknown>;
  /**
   * Provider-opaque token that must be echoed back with the tool result.
   * Gemini thinking models reject the follow-up turn without it.
   */
  signature?: string;
}

/** Result of executing a tool, fed back into the model. */
export interface ToolCallResult {
  id: string;
  name: string;
  ok: boolean;
  /** Compact payload serialized into the model conversation. */
  data: unknown;
  /** Human-readable label shown in the UI transcript. */
  label: string;
}

// ─── Conversation turns (provider-agnostic) ──────────────────────────

export interface AgentTurn {
  role: "user" | "assistant" | "tool";
  content?: string;
  /** Present on assistant turns that requested tools. */
  toolCalls?: ToolCall[];
  /** Present on tool turns. */
  toolCallId?: string;
  toolName?: string;
  toolResult?: unknown;
}

// ─── Structured UI payloads emitted by tools ─────────────────────────

export interface SummaryProjectSlice {
  projectId: string;
  name: string;
  code: string;
  color: string;
  minutes: number;
  percentage: number;
}

export interface SummaryDaySlice {
  date: string;
  weekday: string;
  minutes: number;
  isWeekend: boolean;
}

export interface WorkSummaryCard {
  kind: "work_summary";
  title: string;
  periodLabel: string;
  from: string;
  to: string;
  totalMinutes: number;
  billableMinutes: number;
  targetMinutes: number | null;
  entryCount: number;
  projects: SummaryProjectSlice[];
  days: SummaryDaySlice[];
}

export interface TimesheetStatusCard {
  kind: "timesheet_status";
  period: string;
  periodLabel: string;
  status: "open" | "submitted" | "approved" | "rejected";
  totalMinutes: number;
  targetMinutes: number;
  from: string;
  to: string;
  rejectionReason: string | null;
  incompleteDays: Array<{ date: string; weekday: string; minutes: number }>;
  canSubmit: boolean;
}

export interface EntriesListCard {
  kind: "entries_list";
  title: string;
  entries: Array<{
    id: string;
    date: string;
    description: string;
    minutes: number;
    projectName: string;
    projectColor: string;
    billable: boolean;
    azureWorkItemId: number | null;
    locked: boolean;
  }>;
}

export interface ApprovalsCard {
  kind: "approvals";
  items: Array<{
    id: string;
    userName: string;
    period: string;
    totalMinutes: number;
    submittedAt: string | null;
  }>;
}

export interface TeamOverviewCard {
  kind: "team_overview";
  periodLabel: string;
  from: string;
  to: string;
  members: Array<{
    userId: string;
    name: string;
    minutes: number;
    targetMinutes: number;
    timesheetStatus: string;
  }>;
}

export interface TimerCard {
  kind: "timer";
  running: boolean;
  projectName: string | null;
  projectColor: string | null;
  description: string | null;
  elapsedMinutes: number;
  paused: boolean;
}

export interface ProjectsCard {
  kind: "projects";
  projects: Array<{
    id: string;
    name: string;
    code: string;
    color: string;
    isMember: boolean;
    minutesLast30Days: number;
  }>;
}

export interface WorkItemsCard {
  kind: "work_items";
  query: string;
  items: Array<{
    id: number;
    title: string;
    type: string;
    state: string;
    url: string | null;
  }>;
}

export type AssistantCard =
  | WorkSummaryCard
  | TimesheetStatusCard
  | EntriesListCard
  | ApprovalsCard
  | TeamOverviewCard
  | TimerCard
  | ProjectsCard
  | WorkItemsCard;

// ─── Write actions (human-in-the-loop confirmation) ──────────────────

export interface CreateTimeEntryAction {
  kind: "create_time_entry";
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  description: string;
  date: string;
  durationMinutes: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  /** Warning shown in the card (e.g. locked timesheet, missing project). */
  warning: string | null;
}

export interface StartTimerAction {
  kind: "start_timer";
  projectId: string | null;
  projectName: string | null;
  projectColor: string | null;
  description: string;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  warning: string | null;
}

export interface StopTimerAction {
  kind: "stop_timer";
  projectName: string | null;
  description: string | null;
  elapsedMinutes: number;
}

export interface SubmitTimesheetAction {
  kind: "submit_timesheet";
  period: string;
  periodLabel: string;
  totalMinutes: number;
  entryCount: number;
  warning: string | null;
}

export interface NavigateAction {
  kind: "navigate";
  path: string;
  label: string;
}

export type AssistantAction =
  | CreateTimeEntryAction
  | StartTimerAction
  | StopTimerAction
  | SubmitTimesheetAction
  | NavigateAction;

/** Actions that mutate data and therefore require explicit confirmation. */
export type ConfirmableAction = Exclude<AssistantAction, NavigateAction>;

// ─── Streaming protocol (SSE) ────────────────────────────────────────

export type AgentEvent =
  | {
      type: "meta";
      provider: ProviderName;
      model: string;
      conversationId: string;
      messageId: string;
    }
  | { type: "text"; delta: string }
  | { type: "tool_start"; id: string; name: string; label: string }
  | {
      type: "tool_end";
      id: string;
      name: string;
      label: string;
      ok: boolean;
    }
  | { type: "card"; card: AssistantCard }
  | { type: "action"; action: AssistantAction }
  | { type: "suggestions"; items: string[] }
  | { type: "error"; message: string; retryable: boolean }
  | { type: "done" };

// ─── Runtime context handed to every tool ────────────────────────────

export interface AgentUserContext {
  userId: string;
  name: string;
  email: string;
  role: AppRole;
  /** Weekly capacity in hours (schema stores hours, default 40). */
  weeklyCapacityHours: number;
  /** IANA timezone reported by the client, defaults to America/Sao_Paulo. */
  timeZone: string;
  /** Today in the user's timezone (YYYY-MM-DD). */
  today: string;
  /** Current dashboard route the user is looking at. */
  activePath?: string;
}
