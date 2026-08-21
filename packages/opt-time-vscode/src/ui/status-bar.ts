import * as vscode from "vscode";
import type { OptTimeSettings } from "../config/settings";
import type { TimerController } from "../core/timer-controller";
import type { SessionManager } from "../auth/session";
import {
  formatMinutes,
  formatStopwatch,
  progressBar,
} from "../util/duration";
import { normalizeHex } from "./icons";

/**
 * The live timer in the status bar.
 *
 * Two items, both optional:
 *   • the clock — `$(record) OPT-014  1:23:45`, tinted with the project colour
 *   • the day meter — `$(pulse) 6h12 / 8h`
 *
 * Re-rendered on every controller tick, so the text is rebuilt roughly once a
 * second. That is cheap, but it is also why nothing here does I/O: it reads the
 * controller's already-fetched state and formats it.
 */

export class StatusBar implements vscode.Disposable {
  private clock: vscode.StatusBarItem | undefined;
  private meter: vscode.StatusBarItem | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly timers: TimerController,
    private readonly session: SessionManager,
    private settings: OptTimeSettings,
  ) {
    this.build();

    this.disposables.push(
      this.timers.onDidChange(() => this.render()),
      this.timers.onDidTick(() => this.render()),
      this.session.onDidChange(() => this.render()),
    );

    this.render();
  }

  updateSettings(settings: OptTimeSettings): void {
    this.settings = settings;
    this.build();
    this.render();
  }

  /**
   * (Re)creates the items.
   *
   * Alignment and priority are fixed at creation time by the API, so a settings
   * change means disposing and rebuilding rather than mutating.
   */
  private build(): void {
    this.clock?.dispose();
    this.meter?.dispose();
    this.clock = undefined;
    this.meter = undefined;

    if (!this.settings.statusBar.enabled) return;

    const { alignment, priority } = this.settings.statusBar;

    this.clock = vscode.window.createStatusBarItem(
      "optTime.clock",
      alignment,
      priority,
    );
    this.clock.name = "Opt-Time — Timer";
    this.clock.command =
      this.settings.statusBar.clickAction === "toggle"
        ? "optTime.toggleTimer"
        : "optTime.menu";
    this.clock.show();

    if (this.settings.statusBar.showDayProgress) {
      this.meter = vscode.window.createStatusBarItem(
        "optTime.dayProgress",
        alignment,
        priority - 1,
      );
      this.meter.name = "Opt-Time — Horas do dia";
      this.meter.command = "optTime.dayStatus";
      this.meter.show();
    }
  }

  private render(): void {
    if (!this.clock) return;

    const { timer, summary, lastError } = this.timers.state;

    if (!this.session.isSignedIn) {
      this.clock.text = "$(watch) Opt-Time";
      this.clock.tooltip = "Conecte sua conta OptSolv para registrar horas.";
      this.clock.command = "optTime.signIn";
      this.clock.color = undefined;
      this.clock.backgroundColor = undefined;
      this.meter?.hide();
      return;
    }

    this.clock.command =
      this.settings.statusBar.clickAction === "toggle" && timer
        ? "optTime.toggleTimer"
        : "optTime.menu";

    if (timer) {
      const paused = timer.isPaused;
      const icon = paused ? "$(debug-pause)" : "$(record)";
      const clock = formatStopwatch(this.timers.elapsedSeconds());

      this.clock.text = `${icon} ${timer.project.code} ${clock}`;
      this.clock.color =
        this.settings.statusBar.useProjectColor && !paused
          ? (normalizeHex(timer.project.color) ?? undefined)
          : undefined;
      this.clock.backgroundColor = undefined;
    } else {
      const total = summary?.totalMinutes ?? 0;
      this.clock.text =
        total > 0
          ? `$(watch) ${formatMinutes(total)} hoje`
          : "$(watch) Iniciar timer";
      this.clock.color = undefined;
      this.clock.backgroundColor = undefined;
    }

    // A stale reading is worth flagging, but not worth hiding the clock over.
    if (lastError) {
      this.clock.backgroundColor = new vscode.ThemeColor(
        "statusBarItem.warningBackground",
      );
    }

    this.clock.tooltip = this.buildTooltip();
    this.renderMeter();
  }

  private renderMeter(): void {
    if (!this.meter) return;

    const { summary } = this.timers.state;
    if (!summary) {
      this.meter.hide();
      return;
    }

    const logged = this.timers.projectedDayMinutes();
    const capacity = summary.dailyCapacityMinutes;

    this.meter.text = `$(pulse) ${formatMinutes(logged)}${
      capacity > 0 ? ` / ${formatMinutes(capacity)}` : ""
    }`;
    this.meter.tooltip = "Opt-Time — ver status do dia";
    this.meter.color =
      capacity > 0 && logged >= capacity
        ? new vscode.ThemeColor("charts.green")
        : undefined;
    this.meter.show();
  }

  /**
   * The tooltip carries everything that does not fit in the bar: the project,
   * the description, the linked work item, and where the day stands.
   */
  private buildTooltip(): vscode.MarkdownString {
    const { timer, summary, lastError } = this.timers.state;

    const md = new vscode.MarkdownString(undefined, true);
    md.isTrusted = true;
    md.supportThemeIcons = true;

    if (timer) {
      const state = timer.isPaused ? "Pausado" : "Em andamento";
      md.appendMarkdown(`**${timer.project.name}** · \`${timer.project.code}\`\n\n`);
      md.appendMarkdown(
        `$(clock) ${formatStopwatch(this.timers.elapsedSeconds())} — ${state}\n\n`,
      );

      if (timer.description) {
        md.appendMarkdown(`${escapeMarkdown(timer.description)}\n\n`);
      }

      if (timer.azureWorkItemId) {
        const title = timer.azureWorkItemTitle
          ? ` — ${escapeMarkdown(timer.azureWorkItemTitle)}`
          : "";
        md.appendMarkdown(`$(link) Work Item **#${timer.azureWorkItemId}**${title}\n\n`);
      }

      if (!timer.billable) {
        md.appendMarkdown("$(circle-slash) Não faturável\n\n");
      }

      md.appendMarkdown("---\n\n");
    }

    if (summary) {
      const logged = this.timers.projectedDayMinutes();
      const capacity = summary.dailyCapacityMinutes;

      md.appendMarkdown(`**Hoje** — ${summary.weekday}\n\n`);
      if (capacity > 0) {
        md.appendMarkdown(
          `\`${progressBar(logged, capacity)}\` ${formatMinutes(logged)} / ${formatMinutes(capacity)}\n\n`,
        );
      } else {
        md.appendMarkdown(`${formatMinutes(logged)} registradas\n\n`);
      }

      md.appendMarkdown(
        `**Semana** — ${formatMinutes(summary.weekTotalMinutes)}`,
      );
      if (summary.weeklyCapacityMinutes > 0) {
        md.appendMarkdown(
          ` de ${formatMinutes(summary.weeklyCapacityMinutes)}`,
        );
      }
      md.appendMarkdown("\n\n---\n\n");
    }

    if (lastError) {
      md.appendMarkdown(`$(warning) ${escapeMarkdown(lastError)}\n\n`);
    }

    const actions = timer
      ? [
          timer.isPaused
            ? "[$(debug-continue) Retomar](command:optTime.toggleTimer)"
            : "[$(debug-pause) Pausar](command:optTime.toggleTimer)",
          "[$(primitive-square) Parar](command:optTime.stopTimer)",
          "[$(arrow-swap) Trocar projeto](command:optTime.switchProject)",
        ]
      : [
          "[$(play) Iniciar timer](command:optTime.startTimer)",
          "[$(add) Lançar horas](command:optTime.logQuick)",
        ];

    md.appendMarkdown(actions.join(" · "));

    return md;
  }

  dispose(): void {
    this.clock?.dispose();
    this.meter?.dispose();
    for (const disposable of this.disposables) disposable.dispose();
  }
}

/** Keeps project names and commit subjects from breaking tooltip layout. */
function escapeMarkdown(value: string): string {
  return value.replace(/([\\`*_{}[\]()#+\-.!|])/g, "\\$1");
}
