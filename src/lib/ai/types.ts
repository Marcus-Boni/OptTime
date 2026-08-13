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

export interface UpdateTimeEntryAction {
  kind: "update_time_entry";
  entryId: string;
  projectName: string | null;
  projectColor: string | null;
  date: string;
  /** Values currently stored, shown as the "before" side of the diff. */
  current: {
    description: string;
    durationMinutes: number;
    billable: boolean;
  };
  /** Values the assistant proposes, shown as the "after" side. */
  next: {
    description: string;
    durationMinutes: number;
    billable: boolean;
  };
  warning: string | null;
}

export interface DeleteTimeEntryAction {
  kind: "delete_time_entry";
  entryId: string;
  projectName: string | null;
  projectColor: string | null;
  description: string;
  date: string;
  durationMinutes: number;
  warning: string | null;
}

export interface PauseTimerAction {
  kind: "pause_timer";
  projectName: string | null;
  description: string | null;
  elapsedMinutes: number;
}

export interface ResumeTimerAction {
  kind: "resume_timer";
  projectName: string | null;
  description: string | null;
  elapsedMinutes: number;
}

export interface ApproveTimesheetAction {
  kind: "approve_timesheet";
  timesheetId: string;
  userName: string;
  period: string;
  periodLabel: string;
  totalMinutes: number;
  warning: string | null;
}

export interface RejectTimesheetAction {
  kind: "reject_timesheet";
  timesheetId: string;
  userName: string;
  period: string;
  periodLabel: string;
  totalMinutes: number;
  reason: string;
  warning: string | null;
}

export type ReportFormat = "pdf" | "xlsx";
export type ReportKind = "summary" | "detailed";
export type ReportScope = "me" | "project" | "team";

export interface ExportReportAction {
  kind: "export_report";
  format: ReportFormat;
  reportKind: ReportKind;
  scope: ReportScope;
  projectId: string | null;
  projectName: string | null;
  from: string;
  to: string;
  periodLabel: string;
  title: string;
  /** Row count previewed server-side so the card can warn about empty ranges. */
  entryCount: number;
  totalMinutes: number;
  warning: string | null;
}

export type NotifyAudience = "project_members" | "direct_reports" | "custom";

export interface NotifyTeamAction {
  kind: "notify_team";
  audience: NotifyAudience;
  projectId: string | null;
  projectName: string | null;
  recipients: Array<{ id: string; name: string; email: string }>;
  subject: string;
  message: string;
  /** Extra factual lines rendered as a highlight block in the email. */
  contextLines: string[];
  warning: string | null;
}

export interface NavigateAction {
  kind: "navigate";
  path: string;
  label: string;
}

// ─── Multi-step plans ────────────────────────────────────────────────

export interface OperatorPlanStep {
  /** Stable id used as the React key and in the audit log. */
  id: string;
  index: number;
  title: string;
  detail: string | null;
  action: OperatorStepAction;
}

/**
 * Wraps two or more actions proposed in the same turn so the user confirms
 * once and the steps run in order — e.g. "log 3h and submit my timesheet".
 */
export interface OperatorPlanAction {
  kind: "operator_plan";
  planId: string;
  title: string;
  steps: OperatorPlanStep[];
}

export type AssistantAction =
  | CreateTimeEntryAction
  | StartTimerAction
  | StopTimerAction
  | SubmitTimesheetAction
  | UpdateTimeEntryAction
  | DeleteTimeEntryAction
  | PauseTimerAction
  | ResumeTimerAction
  | ApproveTimesheetAction
  | RejectTimesheetAction
  | ExportReportAction
  | NotifyTeamAction
  | NavigateAction
  | OperatorPlanAction;

/** A single action, i.e. anything that can sit inside a plan step. */
export type OperatorStepAction = Exclude<AssistantAction, OperatorPlanAction>;

/** Actions that change state and therefore require explicit confirmation. */
export type ConfirmableAction = Exclude<
  AssistantAction,
  NavigateAction | OperatorPlanAction
>;

/** Discriminator values of every confirmable action. */
export type ConfirmableActionKind = ConfirmableAction["kind"];

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
