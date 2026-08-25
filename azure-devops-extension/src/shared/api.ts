import { getStoredApiUrl, getStoredToken } from "./auth";
import { ApiError, diagnoseNetworkFailure, kindForStatus } from "./errors";
import { resolveSchedulingHours, toNumericHours } from "./scheduling";
import type {
  ActiveTimer,
  ExtensionUser,
  Project,
  TimeEntry,
  WorkItemTimeData,
} from "./types";

function apiUrl(path: string): string {
  const base = getStoredApiUrl() ?? "";
  return `${base}${path}`;
}

function authHeaders(): HeadersInit {
  const token = getStoredToken() ?? "";
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

/**
 * Chamada autenticada à API, com a causa da falha preservada.
 *
 * Toda saída de erro daqui é um `ApiError` classificado. Quando o `fetch` é
 * rejeitado — offline, host fora do ar, CORS — o motivo é apurado aqui, antes
 * de propagar: no `catch` de quem chamou já não há como distinguir.
 */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const method = (init?.method ?? "GET").toUpperCase();
  const isGet = method === "GET";
  const base = getStoredApiUrl() ?? "";
  const url = apiUrl(path);

  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      method,
      cache: isGet ? "no-store" : init?.cache,
      headers: { ...authHeaders(), ...(init?.headers ?? {}) },
    });
  } catch (cause: unknown) {
    const kind = await diagnoseNetworkFailure(base);
    throw new ApiError(kind, `Falha ao chamar ${base || url}.`, {
      target: base || url,
      detail: cause instanceof Error ? cause.message : String(cause),
    });
  }

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(kindForStatus(res.status), messageFor(res, text, base), {
      status: res.status,
      target: base || url,
      detail: text || null,
    });
  }

  return res.json() as Promise<T>;
}

/**
 * A mensagem do servidor tem prioridade: ela vem em português e sabe coisas que
 * a extensão não sabe, como o motivo de um período de timesheet estar bloqueado.
 */
function messageFor(res: Response, body: string, base: string): string {
  return (
    extractServerMessage(body) ?? `${base || "O servidor"} respondeu ${res.status}.`
  );
}

function extractServerMessage(body: string): string | null {
  if (!body) return null;

  try {
    const parsed: unknown = JSON.parse(body);
    if (parsed && typeof parsed === "object") {
      const record = parsed as Record<string, unknown>;
      if (typeof record.error === "string") return record.error;
      if (typeof record.message === "string") return record.message;
    }
  } catch {
    // Corpo não-JSON (HTML de proxy, texto puro) não vira mensagem de tela.
  }

  return null;
}

// ── Auth ─────────────────────────────────────────────────────────────────────

export async function getMe(): Promise<ExtensionUser> {
  return apiFetch<ExtensionUser>("/api/extension/me");
}

// ── Projects ─────────────────────────────────────────────────────────────────

export async function getProjects(): Promise<Project[]> {
  const data = await apiFetch<{ projects: Project[] }>(
    "/api/extension/projects",
  );
  return data.projects;
}

// ── Work Item Time Entries ────────────────────────────────────────────────────

export async function getWorkItemTimeEntries(
  workItemId: number,
): Promise<WorkItemTimeData> {
  return apiFetch<WorkItemTimeData>(
    `/api/extension/work-items/${workItemId}/time-entries`,
  );
}

// ── Time Entry ────────────────────────────────────────────────────────────────

export interface CreateTimeEntryPayload {
  projectId: string;
  description: string;
  date: string;
  duration: number;
  billable: boolean;
  azureWorkItemId?: number;
  azureWorkItemTitle?: string;
}

export async function createTimeEntry(
  payload: CreateTimeEntryPayload,
): Promise<TimeEntry> {
  const data = await apiFetch<{ entry: TimeEntry }>(
    "/api/extension/time-entries",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
  return data.entry;
}

// ── Timer ─────────────────────────────────────────────────────────────────────

export async function getTimer(): Promise<ActiveTimer | null> {
  const data = await apiFetch<{ timer: ActiveTimer | null }>(
    "/api/extension/timer",
  );
  return data.timer;
}

export interface StartTimerPayload {
  action: "start";
  projectId: string;
  description?: string;
  billable?: boolean;
  azureWorkItemId?: number;
  azureWorkItemTitle?: string;
}

export async function startTimer(
  payload: Omit<StartTimerPayload, "action">,
): Promise<ActiveTimer> {
  const data = await apiFetch<{ timer: ActiveTimer }>("/api/extension/timer", {
    method: "POST",
    body: JSON.stringify({ action: "start", ...payload }),
  });
  return data.timer;
}

export async function stopTimer(): Promise<TimeEntry> {
  const data = await apiFetch<{ entry: TimeEntry }>("/api/extension/timer", {
    method: "POST",
    body: JSON.stringify({ action: "stop" }),
  });
  return data.entry;
}

// ── Azure DevOps Work Item Field Sync ────────────────────────────────────────

/**
 * IWorkItemFormService subset — only the methods we actually use.
 * Keeps the type compatible with the real SDK without importing it.
 */
export interface IFormServiceSubset {
  getId: () => Promise<number>;
  getFieldValue: (
    field: string,
    options?: { returnOriginalValue: boolean },
  ) => Promise<unknown>;
  getFieldValues?: (
    fields: string[],
    options?: { returnOriginalValue: boolean },
  ) => Promise<Record<string, unknown>>;
  setFieldValue: (field: string, value: unknown) => Promise<void>;
  setFieldValues?: (fields: Record<string, unknown>) => Promise<unknown>;
  /** Available in newer SDK versions — gracefully skipped if absent */
  save?: () => Promise<void>;
}

export interface WorkItemFieldUpdate {
  completedWork: number; // hours
  remainingWork: number | null; // hours; null = field was not written
  saved: boolean; // whether save() was called successfully
  skipped?: boolean; // true when sync was skipped (terminal work item state)
}

/**
 * Reads current Completed Work & Remaining Work from the DevOps form service,
 * applies the delta for a new time entry of `durationMinutes`, writes back the
 * updated values, and then saves the work item.
 *
 * NOTE: `setFieldValue` only marks fields as dirty in the extension panel.
 * Calling `save()` persists the changes to Azure DevOps immediately.
 *
 * @param formService - IWorkItemFormService (or compatible subset) from the DevOps SDK
 * @param durationMinutes - duration of the new entry being saved
 */
export async function syncWorkItemFields(
  formService: IFormServiceSubset,
  durationMinutes: number,
): Promise<WorkItemFieldUpdate> {
  const durationHours = durationMinutes / 60;
  const fieldNames = [
    "Microsoft.VSTS.Scheduling.CompletedWork",
    "Microsoft.VSTS.Scheduling.RemainingWork",
    "Microsoft.VSTS.Scheduling.OriginalEstimate",
    "System.State",
  ];
  const fieldValues = formService.getFieldValues
    ? await formService.getFieldValues(fieldNames, {
        returnOriginalValue: false,
      })
    : {
        "Microsoft.VSTS.Scheduling.CompletedWork":
          await formService.getFieldValue(
            "Microsoft.VSTS.Scheduling.CompletedWork",
            {
              returnOriginalValue: false,
            },
          ),
        "Microsoft.VSTS.Scheduling.RemainingWork":
          await formService.getFieldValue(
            "Microsoft.VSTS.Scheduling.RemainingWork",
            {
              returnOriginalValue: false,
            },
          ),
        "Microsoft.VSTS.Scheduling.OriginalEstimate":
          await formService.getFieldValue(
            "Microsoft.VSTS.Scheduling.OriginalEstimate",
            {
              returnOriginalValue: false,
            },
          ),
        "System.State": await formService.getFieldValue("System.State", {
          returnOriginalValue: false,
        }),
      };

  // Skip field updates only for states that are typically immutable.
  // "Done" must still be synced for this extension workflow.
  const TERMINAL_STATES = new Set(["Removed"]);
  const workItemState = fieldValues["System.State"];
  if (typeof workItemState === "string" && TERMINAL_STATES.has(workItemState)) {
    return {
      completedWork: 0,
      remainingWork: null,
      saved: false,
      skipped: true,
    };
  }

  const currentCompleted = toNumericHours(
    fieldValues["Microsoft.VSTS.Scheduling.CompletedWork"],
  );
  const updatedFields = resolveSchedulingHours({
    completedWork: fieldValues["Microsoft.VSTS.Scheduling.CompletedWork"],
    remainingWork: fieldValues["Microsoft.VSTS.Scheduling.RemainingWork"],
    originalEstimate: fieldValues["Microsoft.VSTS.Scheduling.OriginalEstimate"],
    nextCompletedWork: currentCompleted + durationHours,
  });

  // Some process templates require Remaining Work to stay empty on Done items.
  // In that case we still sync Completed Work, but never write Remaining Work.
  const shouldSkipRemainingWorkUpdate =
    workItemState === "Done" ||
    workItemState === "Closed" ||
    workItemState === "Resolved";
  const nextRemainingWork = shouldSkipRemainingWorkUpdate
    ? null
    : updatedFields.remainingWork;

  // Only write RemainingWork when the scheduling logic determined it should be updated.
  // When remainingWork is null (no original estimate + no existing remaining work),
  // we intentionally leave the field untouched to match DevOps default behaviour.
  const fieldsToUpdate: Record<string, unknown> = {
    "Microsoft.VSTS.Scheduling.CompletedWork": updatedFields.completedWork,
  };
  if (nextRemainingWork !== null) {
    fieldsToUpdate["Microsoft.VSTS.Scheduling.RemainingWork"] =
      nextRemainingWork;
  }

  if (formService.setFieldValues) {
    await formService.setFieldValues(fieldsToUpdate);
  } else {
    await formService.setFieldValue(
      "Microsoft.VSTS.Scheduling.CompletedWork",
      updatedFields.completedWork,
    );
    if (nextRemainingWork !== null) {
      await formService.setFieldValue(
        "Microsoft.VSTS.Scheduling.RemainingWork",
        nextRemainingWork,
      );
    }
  }

  // Persist to DevOps — save() is required, setFieldValue alone only marks dirty
  let saved = false;
  if (typeof formService.save === "function") {
    try {
      await formService.save();
      saved = true;
    } catch (saveErr) {
      console.error("[syncWorkItemFields] save() failed:", saveErr);
      // Non-fatal — fields are still dirty in the form, user can manually save
    }
  }

  return {
    completedWork: updatedFields.completedWork,
    remainingWork: nextRemainingWork,
    saved,
  };
}
