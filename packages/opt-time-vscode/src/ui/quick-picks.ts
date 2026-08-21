import * as vscode from "vscode";
import type { OptTimeClient } from "../api/client";
import { toMessage } from "../api/errors";
import type { ProjectSummary, WorkItemResult } from "../api/types";
import type { BranchHints } from "../core/branch-context";
import { formatMinutes, parseDuration } from "../util/duration";

/**
 * The pickers and inputs shared by every command.
 *
 * Each function returns `undefined` when the user dismisses it, so callers can
 * treat cancellation as an ordinary outcome and simply stop — no exceptions,
 * no error toasts for pressing Escape.
 */

export interface StartTimerAnswers {
  project: ProjectSummary;
  description: string;
  azureWorkItemId?: number;
  azureWorkItemTitle?: string;
  billable: boolean;
}

export interface QuickLogAnswers extends StartTimerAnswers {
  durationMinutes: number;
  date: string;
}

interface ProjectItem extends vscode.QuickPickItem {
  project: ProjectSummary;
}

/**
 * Picks a project, floating the one the branch suggests to the top.
 *
 * The suggestion is what makes this a one-keystroke step on a well-named
 * branch: `feat/OPT-452-…` puts the OPT project first, already selected.
 */
export async function pickProject(
  client: OptTimeClient,
  options: {
    title?: string;
    hints?: BranchHints | null;
    placeHolder?: string;
  } = {},
): Promise<ProjectSummary | undefined> {
  const projects = await vscode.window.withProgress(
    { location: { viewId: "optTime.today" } },
    () => client.listProjects({ limit: 200 }),
  );

  if (projects.length === 0) {
    void vscode.window.showWarningMessage(
      "Nenhum projeto ativo disponível para você.",
    );
    return undefined;
  }

  const suggestedId = matchProjectByHints(projects, options.hints)?.id;

  const items: ProjectItem[] = projects
    .map<ProjectItem>((project) => ({
      project,
      label: `$(circle-filled) ${project.name}`,
      description: project.code,
      detail:
        project.id === suggestedId
          ? `$(git-branch) Sugerido pela branch ${options.hints?.branch ?? ""}`.trim()
          : (project.clientName ?? undefined),
      picked: project.id === suggestedId,
    }))
    .sort((a, b) => {
      if (a.project.id === suggestedId) return -1;
      if (b.project.id === suggestedId) return 1;
      return a.project.name.localeCompare(b.project.name, "pt-BR");
    });

  const choice = await vscode.window.showQuickPick(items, {
    title: options.title ?? "Selecione o projeto",
    placeHolder: options.placeHolder ?? "Digite para filtrar por nome ou código",
    matchOnDescription: true,
    matchOnDetail: true,
    ignoreFocusOut: true,
  });

  return choice?.project;
}

/**
 * Matches a project against the branch hints.
 *
 * The project code is the strong signal (`OPT-452` → project `OPT`); the branch
 * text is a weak fallback for teams that name branches after the project rather
 * than the ticket.
 */
export function matchProjectByHints(
  projects: ProjectSummary[],
  hints: BranchHints | null | undefined,
): ProjectSummary | null {
  if (!hints) return null;

  if (hints.projectCode) {
    const code = hints.projectCode.toUpperCase();

    const exact = projects.find((p) => p.code.toUpperCase() === code);
    if (exact) return exact;

    // Project codes are usually `OPT-001` while branches carry just `OPT`.
    const prefixed = projects.filter((p) =>
      p.code.toUpperCase().startsWith(`${code}-`),
    );
    if (prefixed.length === 1) return prefixed[0] ?? null;
  }

  const haystack = `${hints.branch} ${hints.repositoryName}`.toLowerCase();
  const byName = projects.filter(
    (p) => p.name.length > 3 && haystack.includes(p.name.toLowerCase()),
  );
  if (byName.length === 1) return byName[0] ?? null;

  return null;
}

/** Free-text description, pre-filled from the branch or the last commit. */
export async function askDescription(options: {
  title: string;
  value?: string;
  prompt?: string;
}): Promise<string | undefined> {
  const value = await vscode.window.showInputBox({
    title: options.title,
    prompt:
      options.prompt ?? "O que você fez? Aparece no timesheet e na aprovação.",
    value: options.value ?? "",
    // Cursor placed at the end so a suggested value can be extended, not retyped.
    valueSelection: options.value ? [options.value.length, options.value.length] : undefined,
    ignoreFocusOut: true,
    validateInput: (input) =>
      input.trim().length === 0
        ? "A descrição é obrigatória."
        : input.trim().length > 500
          ? "Máximo de 500 caracteres."
          : null,
  });

  return value?.trim() || undefined;
}

/** Duration input accepting `2h30`, `150m`, `2,5` or `2:30`. */
export async function askDuration(
  defaultValue = "",
): Promise<number | undefined> {
  const value = await vscode.window.showInputBox({
    title: "Quantas horas?",
    prompt: "Aceita 2h30, 150m, 2,5 ou 2:30",
    placeHolder: "2h30",
    value: defaultValue,
    ignoreFocusOut: true,
    validateInput: (input) => {
      if (!input.trim()) return null;
      const parsed = parseDuration(input);
      return parsed.ok
        ? {
            message: `= ${formatMinutes(parsed.minutes)}`,
            severity: vscode.InputBoxValidationSeverity.Info,
          }
        : parsed.reason;
    },
  });

  if (value === undefined) return undefined;

  const parsed = parseDuration(value);
  return parsed.ok ? parsed.minutes : undefined;
}

interface WorkItemItem extends vscode.QuickPickItem {
  workItem: WorkItemResult | null;
}

/**
 * Confirms or changes the work item link.
 *
 * When the branch already resolved one, it is the default and the whole step is
 * a single Enter. Otherwise this becomes a live search against Azure DevOps.
 */
export async function pickWorkItem(
  client: OptTimeClient,
  options: { suggested?: WorkItemResult | null; projectId?: string } = {},
): Promise<{ id: number; title: string } | null | undefined> {
  const picker = vscode.window.createQuickPick<WorkItemItem>();
  picker.title = "Vincular Work Item do Azure DevOps";
  picker.placeholder = "Digite o ID (#452) ou parte do título — ou deixe em branco";
  picker.matchOnDescription = true;
  picker.ignoreFocusOut = true;

  const noneItem: WorkItemItem = {
    workItem: null,
    label: "$(circle-slash) Sem Work Item",
    description: "Registrar sem vincular",
    alwaysShow: true,
  };

  const baseItems: WorkItemItem[] = options.suggested
    ? [toWorkItemPick(options.suggested, true), noneItem]
    : [noneItem];

  picker.items = baseItems;
  if (options.suggested) picker.activeItems = [baseItems[0] as WorkItemItem];

  let searchToken = 0;

  const disposables: vscode.Disposable[] = [
    picker.onDidChangeValue(async (value) => {
      const query = value.trim();
      if (query.length < 2) {
        picker.items = baseItems;
        picker.busy = false;
        return;
      }

      const token = ++searchToken;
      picker.busy = true;

      try {
        const results = await client.searchWorkItems({
          q: query,
          projectId: options.projectId,
          limit: 20,
        });

        // A slower earlier request must not overwrite a newer result set.
        if (token !== searchToken) return;

        picker.items = [
          ...results.map((item) => toWorkItemPick(item, false)),
          noneItem,
        ];
      } catch (error: unknown) {
        if (token !== searchToken) return;
        picker.items = [
          { ...noneItem, detail: `Busca indisponível: ${toMessage(error)}` },
        ];
      } finally {
        if (token === searchToken) picker.busy = false;
      }
    }),
  ];

  const selection = await new Promise<WorkItemItem | undefined>((resolve) => {
    disposables.push(
      picker.onDidAccept(() => resolve(picker.selectedItems[0])),
      picker.onDidHide(() => resolve(undefined)),
    );
    picker.show();
  });

  picker.dispose();
  for (const disposable of disposables) disposable.dispose();

  if (selection === undefined) return undefined;
  if (!selection.workItem) return null;

  return { id: selection.workItem.id, title: selection.workItem.title };
}

function toWorkItemPick(item: WorkItemResult, suggested: boolean): WorkItemItem {
  return {
    workItem: item,
    label: `$(issues) #${item.id} — ${item.title}`,
    description: `${item.type} · ${item.state}`,
    detail: suggested
      ? "$(git-branch) Detectado a partir da branch atual"
      : item.projectName,
    alwaysShow: suggested,
  };
}

/** Date picker for back-dated entries, limited to the editable window. */
export async function pickDate(): Promise<string | undefined> {
  const today = new Date();
  const items: Array<vscode.QuickPickItem & { date: string }> = [];

  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(today);
    date.setDate(today.getDate() - offset);

    const iso = toIsoDate(date);
    const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
    const pretty = date.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
    });

    items.push({
      date: iso,
      label:
        offset === 0
          ? "$(calendar) Hoje"
          : offset === 1
            ? "$(calendar) Ontem"
            : `$(calendar) ${capitalize(weekday)}`,
      description: pretty,
      detail: offset === 0 ? undefined : iso,
    });
  }

  const choice = await vscode.window.showQuickPick(items, {
    title: "Data do lançamento",
    placeHolder: "Selecione o dia",
    ignoreFocusOut: true,
  });

  return choice?.date;
}

/**
 * Local-calendar ISO date.
 *
 * `toISOString()` would convert to UTC and shift the date across midnight for
 * anyone west of Greenwich — which is the entire team.
 */
export function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
