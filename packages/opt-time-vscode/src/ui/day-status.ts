import * as vscode from "vscode";
import type { DaySummary, TimesheetStatus } from "../api/types";
import { formatMinutes } from "../util/duration";
import { normalizeHex } from "./icons";

/**
 * "Ver Status do Dia" — a themed panel instead of a notification.
 *
 * A day summary is a small dataset with real structure: a total against a
 * target, a split by project, a list of entries, and the week around it. A
 * toast flattens all of that into one line, so this renders a proper view.
 *
 * The panel is a singleton: running the command twice reveals and updates the
 * existing one rather than stacking duplicates.
 */

export interface DayStatusActions {
  onRefresh: () => void;
  onStartTimer: () => void;
  onSubmitWeek: () => void;
  onOpenDashboard: () => void;
}

export class DayStatusPanel implements vscode.Disposable {
  private static current: DayStatusPanel | undefined;

  private readonly panel: vscode.WebviewPanel;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(private readonly actions: DayStatusActions) {
    this.panel = vscode.window.createWebviewPanel(
      "optTime.dayStatus",
      "Opt-Time — Status do dia",
      { viewColumn: vscode.ViewColumn.Active, preserveFocus: false },
      {
        enableScripts: true,
        // The view is cheap to rebuild and always re-rendered on reveal, so
        // there is nothing worth keeping alive in a hidden tab.
        retainContextWhenHidden: false,
        localResourceRoots: [],
      },
    );

    this.disposables.push(
      this.panel.onDidDispose(() => this.dispose()),
      this.panel.webview.onDidReceiveMessage((message: unknown) => {
        const command = (message as { command?: string } | null)?.command;
        switch (command) {
          case "refresh":
            this.actions.onRefresh();
            break;
          case "startTimer":
            this.actions.onStartTimer();
            break;
          case "submitWeek":
            this.actions.onSubmitWeek();
            break;
          case "openDashboard":
            this.actions.onOpenDashboard();
            break;
        }
      }),
    );
  }

  /** Reveals the singleton panel, creating it on first use. */
  static show(
    actions: DayStatusActions,
    data: { summary: DaySummary; timesheet: TimesheetStatus | null },
  ): DayStatusPanel {
    const panel = (DayStatusPanel.current ??= new DayStatusPanel(actions));
    panel.panel.reveal(vscode.ViewColumn.Active, false);
    panel.update(data);
    return panel;
  }

  /** Updates the open panel in place, if there is one. */
  static refreshIfOpen(data: {
    summary: DaySummary;
    timesheet: TimesheetStatus | null;
  }): void {
    DayStatusPanel.current?.update(data);
  }

  static get isOpen(): boolean {
    return DayStatusPanel.current !== undefined;
  }

  update(data: {
    summary: DaySummary;
    timesheet: TimesheetStatus | null;
  }): void {
    this.panel.webview.html = render(
      data.summary,
      data.timesheet,
      makeNonce(),
      this.panel.webview.cspSource,
    );
  }

  dispose(): void {
    DayStatusPanel.current = undefined;
    for (const disposable of this.disposables) disposable.dispose();
    this.panel.dispose();
  }
}

// ── Rendering ───────────────────────────────────────────────────────────

function render(
  summary: DaySummary,
  timesheet: TimesheetStatus | null,
  nonce: string,
  cspSource: string,
): string {
  const capacity = summary.dailyCapacityMinutes;
  const ratio = capacity > 0 ? Math.min(1, summary.totalMinutes / capacity) : 0;
  const maxProjectMinutes = Math.max(
    1,
    ...summary.byProject.map((project) => project.minutes),
  );

  return /* html */ `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy"
      content="default-src 'none'; style-src ${cspSource} 'nonce-${nonce}'; script-src 'nonce-${nonce}';">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Status do dia</title>
<style nonce="${nonce}">
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    line-height: 1.5;
  }
  h1 { font-size: 1.3rem; margin: 0 0 2px; font-weight: 600; }
  h2 {
    font-size: .75rem; text-transform: uppercase; letter-spacing: .08em;
    color: var(--vscode-descriptionForeground);
    margin: 28px 0 10px; font-weight: 600;
  }
  .sub { color: var(--vscode-descriptionForeground); font-size: .85rem; }
  .hero { display: flex; align-items: center; gap: 24px; flex-wrap: wrap; }
  .ring { flex: 0 0 auto; }
  .ring text { fill: var(--vscode-foreground); }
  .totals { display: flex; gap: 28px; flex-wrap: wrap; }
  .stat .value { font-size: 1.5rem; font-weight: 600; font-variant-numeric: tabular-nums; }
  .stat .label { font-size: .75rem; color: var(--vscode-descriptionForeground); }
  .row {
    display: grid; grid-template-columns: minmax(120px, 1fr) 3fr auto;
    gap: 12px; align-items: center; padding: 6px 0;
  }
  .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bar { height: 8px; border-radius: 4px; background: var(--vscode-editorWidget-border); overflow: hidden; }
  .bar > span { display: block; height: 100%; border-radius: 4px; }
  .mono { font-variant-numeric: tabular-nums; }
  table { width: 100%; border-collapse: collapse; font-size: .88rem; }
  th {
    text-align: left; font-weight: 600; font-size: .72rem; text-transform: uppercase;
    letter-spacing: .06em; color: var(--vscode-descriptionForeground);
    padding: 6px 8px; border-bottom: 1px solid var(--vscode-editorWidget-border);
  }
  td { padding: 8px; border-bottom: 1px solid var(--vscode-editorWidget-border); vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 7px; }
  .chip {
    display: inline-block; padding: 1px 8px; border-radius: 999px; font-size: .72rem;
    border: 1px solid var(--vscode-editorWidget-border);
    color: var(--vscode-descriptionForeground);
  }
  .chip.ok { color: var(--vscode-testing-iconPassed); border-color: currentColor; }
  .chip.warn { color: var(--vscode-editorWarning-foreground); border-color: currentColor; }
  .chip.err { color: var(--vscode-editorError-foreground); border-color: currentColor; }
  .week { display: flex; gap: 6px; margin-top: 4px; }
  .day { flex: 1; text-align: center; }
  .day .track {
    height: 52px; border-radius: 5px; background: var(--vscode-editorWidget-border);
    display: flex; align-items: flex-end; overflow: hidden;
  }
  .day .fill { width: 100%; background: var(--vscode-charts-blue); border-radius: 5px; }
  .day.weekend .fill { background: var(--vscode-descriptionForeground); }
  .day.low .fill { background: var(--vscode-editorWarning-foreground); }
  .day .caption { font-size: .68rem; color: var(--vscode-descriptionForeground); margin-top: 5px; }
  .actions { display: flex; gap: 8px; margin-top: 28px; flex-wrap: wrap; }
  button {
    font-family: inherit; font-size: .85rem; padding: 6px 14px; border-radius: 3px;
    border: 1px solid transparent; cursor: pointer;
    background: var(--vscode-button-background); color: var(--vscode-button-foreground);
  }
  button:hover { background: var(--vscode-button-hoverBackground); }
  button.secondary {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  button.secondary:hover { background: var(--vscode-button-secondaryHoverBackground); }
  button:focus-visible { outline: 1px solid var(--vscode-focusBorder); outline-offset: 2px; }
  .empty { color: var(--vscode-descriptionForeground); font-style: italic; padding: 12px 0; }
</style>
</head>
<body>
  <h1>${escapeHtml(capitalize(summary.weekday))}, ${escapeHtml(formatDate(summary.date))}</h1>
  <p class="sub">${summary.entryCount} lançamento${summary.entryCount === 1 ? "" : "s"} registrado${summary.entryCount === 1 ? "" : "s"}</p>

  <div class="hero">
    ${renderRing(ratio, summary.totalLabel, capacity)}
    <div class="totals">
      <div class="stat">
        <div class="value">${escapeHtml(summary.totalLabel)}</div>
        <div class="label">Hoje</div>
      </div>
      <div class="stat">
        <div class="value">${escapeHtml(formatMinutes(summary.billableMinutes))}</div>
        <div class="label">Faturável</div>
      </div>
      <div class="stat">
        <div class="value">${escapeHtml(summary.isComplete ? "—" : summary.remainingLabel)}</div>
        <div class="label">${summary.isComplete ? "Meta atingida" : "Restante hoje"}</div>
      </div>
      <div class="stat">
        <div class="value">${escapeHtml(summary.weekTotalLabel)}</div>
        <div class="label">Semana${summary.weeklyCapacityMinutes > 0 ? ` / ${escapeHtml(formatMinutes(summary.weeklyCapacityMinutes))}` : ""}</div>
      </div>
    </div>
  </div>

  <h2>Por projeto</h2>
  ${
    summary.byProject.length === 0
      ? '<p class="empty">Nenhuma hora registrada hoje.</p>'
      : summary.byProject
          .map((project) => {
            const color =
              normalizeHex(
                summary.entries.find((e) => e.project.id === project.projectId)
                  ?.project.color,
              ) ?? "var(--vscode-charts-blue)";
            const width = Math.round((project.minutes / maxProjectMinutes) * 100);
            return `<div class="row">
              <span class="name" title="${escapeHtml(project.projectName)}">
                <span class="dot" style="background:${escapeHtml(color)}"></span>${escapeHtml(project.projectName)}
              </span>
              <span class="bar"><span style="width:${width}%;background:${escapeHtml(color)}"></span></span>
              <span class="mono">${escapeHtml(project.label)}</span>
            </div>`;
          })
          .join("")
  }

  <h2>Lançamentos</h2>
  ${
    summary.entries.length === 0
      ? '<p class="empty">Nada registrado ainda. Inicie um timer para começar.</p>'
      : `<table>
          <thead><tr><th>Projeto</th><th>Descrição</th><th>Work Item</th><th>Duração</th></tr></thead>
          <tbody>
            ${summary.entries
              .map(
                (entry) => `<tr>
                  <td><span class="dot" style="background:${escapeHtml(normalizeHex(entry.project.color) ?? "var(--vscode-charts-blue)")}"></span>${escapeHtml(entry.project.code)}</td>
                  <td>${escapeHtml(entry.description || "—")}${entry.billable ? "" : ' <span class="chip">não faturável</span>'}</td>
                  <td class="mono">${entry.azureWorkItemId ? `#${entry.azureWorkItemId}` : "—"}</td>
                  <td class="mono">${escapeHtml(entry.durationLabel)}</td>
                </tr>`,
              )
              .join("")}
          </tbody>
        </table>`
  }

  ${timesheet ? renderTimesheet(timesheet) : ""}

  <div class="actions">
    <button id="start">Iniciar timer</button>
    <button id="refresh" class="secondary">Atualizar</button>
    ${timesheet?.canSubmit ? '<button id="submit" class="secondary">Submeter semana</button>' : ""}
    <button id="dashboard" class="secondary">Abrir dashboard</button>
  </div>

<script nonce="${nonce}">
  const vscodeApi = acquireVsCodeApi();
  const send = (command) => () => vscodeApi.postMessage({ command });
  document.getElementById('start')?.addEventListener('click', send('startTimer'));
  document.getElementById('refresh')?.addEventListener('click', send('refresh'));
  document.getElementById('submit')?.addEventListener('click', send('submitWeek'));
  document.getElementById('dashboard')?.addEventListener('click', send('openDashboard'));
</script>
</body>
</html>`;
}

function renderRing(
  ratio: number,
  centerLabel: string,
  capacityMinutes: number,
): string {
  if (capacityMinutes <= 0) return "";

  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const filled = circumference * ratio;
  const complete = ratio >= 1;

  return /* html */ `<svg class="ring" width="112" height="112" viewBox="0 0 112 112" role="img"
       aria-label="Progresso do dia: ${Math.round(ratio * 100)}%">
    <circle cx="56" cy="56" r="${radius}" fill="none"
            stroke="var(--vscode-editorWidget-border)" stroke-width="9"/>
    <circle cx="56" cy="56" r="${radius}" fill="none"
            stroke="${complete ? "var(--vscode-testing-iconPassed)" : "var(--vscode-charts-blue)"}"
            stroke-width="9" stroke-linecap="round"
            stroke-dasharray="${filled.toFixed(2)} ${circumference.toFixed(2)}"
            transform="rotate(-90 56 56)"/>
    <text x="56" y="54" text-anchor="middle" font-size="19" font-weight="600">${escapeHtml(centerLabel)}</text>
    <text x="56" y="72" text-anchor="middle" font-size="11"
          fill="var(--vscode-descriptionForeground)">${Math.round(ratio * 100)}%</text>
  </svg>`;
}

function renderTimesheet(timesheet: TimesheetStatus): string {
  const chipClass =
    timesheet.status === "approved"
      ? "ok"
      : timesheet.status === "rejected"
        ? "err"
        : timesheet.status === "submitted"
          ? "ok"
          : "warn";

  const maxMinutes = Math.max(1, ...timesheet.days.map((day) => day.minutes));

  return /* html */ `
  <h2>Semana ${escapeHtml(timesheet.period)} <span class="chip ${chipClass}">${escapeHtml(timesheet.statusLabel)}</span></h2>
  <div class="week">
    ${timesheet.days
      .map((day) => {
        const height = Math.round((day.minutes / maxMinutes) * 100);
        const classes = [
          "day",
          day.isWeekend ? "weekend" : "",
          day.isBelowTarget && !day.isWeekend ? "low" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return `<div class="${classes}" title="${escapeHtml(day.date)} — ${escapeHtml(day.label)}">
          <div class="track"><div class="fill" style="height:${height}%"></div></div>
          <div class="caption">${escapeHtml(day.weekday.slice(0, 3))}<br>${escapeHtml(day.label)}</div>
        </div>`;
      })
      .join("")}
  </div>
  ${
    timesheet.rejectionReason
      ? `<p class="sub" style="margin-top:12px"><strong>Motivo da rejeição:</strong> ${escapeHtml(timesheet.rejectionReason)}</p>`
      : ""
  }
  ${
    timesheet.warnings.length > 0
      ? `<ul class="sub">${timesheet.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("")}</ul>`
      : ""
  }`;
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * Escapes every value interpolated into the HTML.
 *
 * Descriptions and project names come from other users through the API, so the
 * webview treats all of it as untrusted — the CSP blocks inline handlers, and
 * this closes the injection path that remains.
 */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(iso: string): string {
  const [year, month, day] = iso.split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function makeNonce(): string {
  const alphabet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let nonce = "";
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return nonce;
}
