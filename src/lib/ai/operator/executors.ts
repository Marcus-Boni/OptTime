"use client";

/**
 * AI Operator — client-side execution of confirmed actions.
 *
 * One executor per action kind, shared by the single-action cards and by the
 * multi-step plan runner so both behave identically. Every executor calls the
 * same REST endpoints the manual UI uses, which means all server-side
 * validation (ownership, timesheet locks, roles) still applies.
 */

import type {
  ApproveTimesheetAction,
  ConfirmableAction,
  CreateTimeEntryAction,
  DeleteTimeEntryAction,
  ExportReportAction,
  NotifyTeamAction,
  RejectTimesheetAction,
  StartTimerAction,
  SubmitTimesheetAction,
  UpdateTimeEntryAction,
} from "@/lib/ai/types";
import {
  dispatchTimeEntriesUpdated,
  dispatchTimerUpdated,
  dispatchTimesheetsUpdated,
} from "@/lib/time-events";
import { formatDuration } from "@/lib/utils";

export interface ExecutionOutcome {
  ok: boolean;
  /** Id of the row the action created, so the history can offer an undo. */
  resultId: string | null;
  /** Short confirmation shown in the step row and the toast. */
  message: string;
}

export class ExecutionError extends Error {}

export function resolveTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "America/Sao_Paulo";
  }
}

async function readError(res: Response, fallback: string): Promise<string> {
  const payload = (await res.json().catch(() => null)) as {
    error?: unknown;
  } | null;

  if (typeof payload?.error === "string") return payload.error;
  return fallback;
}

async function request<T>(
  url: string,
  init: RequestInit,
  fallbackError: string,
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "x-timezone": resolveTimeZone(),
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new ExecutionError(await readError(res, fallbackError));
  }

  return (await res.json()) as T;
}

// ─── Time entries ────────────────────────────────────────────────────

async function createTimeEntry(
  action: CreateTimeEntryAction,
): Promise<ExecutionOutcome> {
  if (!action.projectId) {
    throw new ExecutionError(
      "Projeto não identificado — escolha um no cartão antes de confirmar.",
    );
  }

  const data = await request<{ entry?: { id?: string } }>(
    "/api/time-entries",
    {
      method: "POST",
      body: JSON.stringify({
        projectId: action.projectId,
        description: action.description,
        date: action.date,
        duration: action.durationMinutes,
        billable: action.billable,
        azureWorkItemId: action.azureWorkItemId ?? undefined,
        azureWorkItemTitle: action.azureWorkItemTitle ?? undefined,
      }),
    },
    "Falha ao registrar as horas.",
  );

  dispatchTimeEntriesUpdated();
  dispatchTimesheetsUpdated();

  return {
    ok: true,
    resultId: data.entry?.id ?? null,
    message: `${formatDuration(action.durationMinutes)} registradas`,
  };
}

async function updateTimeEntry(
  action: UpdateTimeEntryAction,
): Promise<ExecutionOutcome> {
  await request(
    `/api/time-entries/${action.entryId}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        description: action.next.description,
        duration: action.next.durationMinutes,
        billable: action.next.billable,
      }),
    },
    "Falha ao editar o lançamento.",
  );

  dispatchTimeEntriesUpdated();
  dispatchTimesheetsUpdated();

  return {
    ok: true,
    resultId: action.entryId,
    message: `Lançamento atualizado para ${formatDuration(action.next.durationMinutes)}`,
  };
}

async function deleteTimeEntry(
  action: DeleteTimeEntryAction,
): Promise<ExecutionOutcome> {
  await request(
    `/api/time-entries/${action.entryId}`,
    { method: "DELETE" },
    "Falha ao excluir o lançamento.",
  );

  dispatchTimeEntriesUpdated();
  dispatchTimesheetsUpdated();

  return {
    ok: true,
    resultId: action.entryId,
    message: `${formatDuration(action.durationMinutes)} excluídas`,
  };
}

// ─── Timer ───────────────────────────────────────────────────────────

async function startTimer(action: StartTimerAction): Promise<ExecutionOutcome> {
  if (!action.projectId) {
    throw new ExecutionError(
      "Projeto não identificado — inicie o cronômetro pela sidebar.",
    );
  }

  const data = await request<{ timer?: { id?: string } }>(
    "/api/timer",
    {
      method: "POST",
      body: JSON.stringify({
        projectId: action.projectId,
        description: action.description,
        billable: action.billable,
        azureWorkItemId: action.azureWorkItemId ?? undefined,
        azureWorkItemTitle: action.azureWorkItemTitle ?? undefined,
      }),
    },
    "Falha ao iniciar o cronômetro.",
  );

  dispatchTimerUpdated();
  dispatchTimeEntriesUpdated();

  return {
    ok: true,
    resultId: data.timer?.id ?? null,
    message: "Cronômetro iniciado",
  };
}

async function stopTimer(): Promise<ExecutionOutcome> {
  const data = await request<{ entry?: { id?: string; duration?: number } }>(
    "/api/timer",
    { method: "DELETE" },
    "Falha ao parar o cronômetro.",
  );

  dispatchTimerUpdated();
  dispatchTimeEntriesUpdated();
  dispatchTimesheetsUpdated();

  const minutes = data.entry?.duration;

  return {
    ok: true,
    resultId: data.entry?.id ?? null,
    message: minutes
      ? `${formatDuration(minutes)} registradas`
      : "Cronômetro parado",
  };
}

async function patchTimer(
  action: "pause" | "resume",
): Promise<ExecutionOutcome> {
  await request(
    "/api/timer",
    { method: "PATCH", body: JSON.stringify({ action }) },
    action === "pause"
      ? "Falha ao pausar o cronômetro."
      : "Falha ao retomar o cronômetro.",
  );

  dispatchTimerUpdated();

  return {
    ok: true,
    resultId: null,
    message: action === "pause" ? "Cronômetro pausado" : "Cronômetro retomado",
  };
}

// ─── Timesheets ──────────────────────────────────────────────────────

async function submitTimesheet(
  action: SubmitTimesheetAction,
): Promise<ExecutionOutcome> {
  // The row must exist before its status can change.
  const created = await request<{ timesheet?: { id?: string } }>(
    "/api/timesheets",
    {
      method: "POST",
      body: JSON.stringify({ period: action.period, periodType: "weekly" }),
    },
    "Falha ao localizar o timesheet.",
  );

  const timesheetId = created.timesheet?.id;
  if (!timesheetId) {
    throw new ExecutionError("Timesheet não encontrado para este período.");
  }

  await request(
    `/api/timesheets/${timesheetId}`,
    { method: "PATCH", body: JSON.stringify({ action: "submit" }) },
    "Falha ao submeter o timesheet.",
  );

  dispatchTimesheetsUpdated();
  dispatchTimeEntriesUpdated();

  return {
    ok: true,
    resultId: timesheetId,
    message: `Timesheet ${action.period} enviado para aprovação`,
  };
}

async function reviewTimesheet(
  action: ApproveTimesheetAction | RejectTimesheetAction,
): Promise<ExecutionOutcome> {
  const approving = action.kind === "approve_timesheet";

  await request(
    `/api/timesheets/${action.timesheetId}`,
    {
      method: "PATCH",
      body: JSON.stringify(
        approving
          ? { action: "approve" }
          : { action: "reject", rejectionReason: action.reason },
      ),
    },
    approving
      ? "Falha ao aprovar o timesheet."
      : "Falha ao rejeitar o timesheet.",
  );

  dispatchTimesheetsUpdated();

  return {
    ok: true,
    resultId: action.timesheetId,
    message: approving
      ? `Timesheet de ${action.userName} aprovado`
      : `Timesheet de ${action.userName} rejeitado`,
  };
}

// ─── Report export ───────────────────────────────────────────────────

interface ReportRow {
  date: string;
  project: string;
  description: string;
  duration: number;
  billable: boolean;
  status: string;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
}

interface ReportPayload {
  entries: ReportRow[];
  summary: Array<{
    projectName: string;
    totalMinutes: number;
    billableMinutes: number;
    entryCount: number;
  }>;
  totalMinutes: number;
  billableMinutes: number;
}

/**
 * Combining diacritical marks left behind by NFD normalization.
 *
 * biome-ignore lint/complexity/useRegexLiterals: built from escape sequences so
 * the source never carries bare combining marks, which render invisibly and are
 * easily corrupted by editors.
 */
const DIACRITICS = new RegExp("[\u0300-\u036f]", "g");

function reportFilename(action: ExportReportAction): string {
  const slug = (action.projectName ?? action.scope)
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `OptSolv_Relatorio_${slug || "horas"}_${action.from}_${action.to}`;
}

async function exportReport(
  action: ExportReportAction,
): Promise<ExecutionOutcome> {
  const data = await request<ReportPayload>(
    "/api/operator/report",
    {
      method: "POST",
      body: JSON.stringify({
        scope: action.scope,
        projectId: action.projectId,
        from: action.from,
        to: action.to,
      }),
    },
    "Falha ao carregar os dados do relatório.",
  );

  if (data.entries.length === 0) {
    throw new ExecutionError(
      "Não há lançamentos no período — nada para exportar.",
    );
  }

  const filename = reportFilename(action);
  const detailed = action.reportKind === "detailed";

  // Loaded on demand: jsPDF and SheetJS are heavy and rarely needed.
  if (action.format === "pdf") {
    const pdf = await import("@/lib/export/pdf");

    if (detailed) {
      await pdf.exportTimeEntriesToPDF({
        entries: data.entries,
        title: action.title,
        period: action.periodLabel,
        filename,
      });
    } else {
      await pdf.exportSummaryByProjectToPDF({
        projectData: data.summary,
        title: action.title,
        period: action.periodLabel,
        filename,
        totalMinutes: data.totalMinutes,
        billableMinutes: data.billableMinutes,
      });
    }
  } else {
    const excel = await import("@/lib/export/excel");

    if (detailed) {
      excel.exportTimeEntriesToExcel(data.entries, filename);
    } else {
      excel.exportSummaryByProjectToExcel(data.summary, {
        filename,
        period: action.periodLabel,
        totalMinutes: data.totalMinutes,
        billableMinutes: data.billableMinutes,
      });
    }
  }

  return {
    ok: true,
    resultId: null,
    message: `${action.format.toUpperCase()} gerado — ${data.entries.length} lançamento(s)`,
  };
}

// ─── Notification ────────────────────────────────────────────────────

async function notifyTeam(action: NotifyTeamAction): Promise<ExecutionOutcome> {
  const data = await request<{ sent: number; failed: number }>(
    "/api/operator/notify",
    {
      method: "POST",
      body: JSON.stringify({
        subject: action.subject,
        message: action.message,
        contextLines: action.contextLines,
        recipientIds: action.recipients.map((item) => item.id),
        projectId: action.projectId,
      }),
    },
    "Falha ao enviar a notificação.",
  );

  return {
    ok: true,
    resultId: null,
    message:
      data.failed > 0
        ? `${data.sent} e-mail(s) enviados, ${data.failed} falharam`
        : `${data.sent} e-mail(s) enviados`,
  };
}

// ─── Dispatcher ──────────────────────────────────────────────────────

/**
 * Runs a confirmed action. Throws `ExecutionError` with a user-facing message
 * when the server rejects it, so callers can surface it verbatim.
 */
export async function executeAction(
  action: ConfirmableAction,
): Promise<ExecutionOutcome> {
  switch (action.kind) {
    case "create_time_entry":
      return createTimeEntry(action);
    case "update_time_entry":
      return updateTimeEntry(action);
    case "delete_time_entry":
      return deleteTimeEntry(action);
    case "start_timer":
      return startTimer(action);
    case "stop_timer":
      return stopTimer();
    case "pause_timer":
      return patchTimer("pause");
    case "resume_timer":
      return patchTimer("resume");
    case "submit_timesheet":
      return submitTimesheet(action);
    case "approve_timesheet":
    case "reject_timesheet":
      return reviewTimesheet(action);
    case "export_report":
      return exportReport(action);
    case "notify_team":
      return notifyTeam(action);
    default:
      throw new ExecutionError("Ação desconhecida.");
  }
}

/** Records a settled action in the audit trail. Never throws. */
export async function logOperatorAction(input: {
  planId: string | null;
  stepIndex: number;
  kind: ConfirmableAction["kind"];
  summary: string;
  status: "executed" | "failed" | "skipped";
  authorization: "confirmed" | "auto";
  inputMode: "text" | "voice";
  resultId: string | null;
  errorMessage: string | null;
}): Promise<void> {
  try {
    await fetch("/api/operator/log", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
  } catch (error: unknown) {
    // A missing audit row must never break the action the user asked for.
    console.error("[logOperatorAction]:", error);
  }
}
