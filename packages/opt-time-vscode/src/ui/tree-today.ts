import * as vscode from "vscode";
import type { SessionManager } from "../auth/session";
import type { TimerController } from "../core/timer-controller";
import {
  formatMinutes,
  formatStopwatch,
  progressBar,
} from "../util/duration";
import type { ProjectIcons } from "./icons";

/**
 * The "Hoje" panel: what is running, what is logged, and where the week stands.
 *
 * Rendered from the controller's cached state, so opening the panel never
 * triggers a request — it draws whatever the last poll returned and refreshes
 * on the next one.
 */

type Node =
  | { kind: "timer" }
  | { kind: "empty" }
  | { kind: "section"; label: string; id: string }
  | { kind: "metric"; label: string; description?: string; icon?: string; tooltip?: string }
  | {
      kind: "projectTotal";
      projectId: string;
      name: string;
      code: string;
      minutes: number;
      color: string | null;
    }
  | {
      kind: "entry";
      id: string;
      description: string;
      durationLabel: string;
      projectName: string;
      projectCode: string;
      color: string;
      workItemId: number | null;
      billable: boolean;
    };

export class TodayTreeProvider
  implements vscode.TreeDataProvider<Node>, vscode.Disposable
{
  private readonly disposables: vscode.Disposable[] = [];
  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    Node | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly timers: TimerController,
    private readonly session: SessionManager,
    private readonly icons: ProjectIcons,
  ) {
    this.disposables.push(
      this.onDidChangeTreeDataEmitter,
      this.timers.onDidChange(() => this.refresh()),
      this.session.onDidChange(() => this.refresh()),
    );
  }

  refresh(): void {
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  getChildren(element?: Node): Node[] {
    if (!this.session.isSignedIn) return [];

    if (!element) return this.rootNodes();

    if (element.kind === "section") {
      switch (element.id) {
        case "byProject":
          return this.projectTotals();
        case "entries":
          return this.entries();
        case "week":
          return this.weekMetrics();
        default:
          return [];
      }
    }

    return [];
  }

  async getTreeItem(node: Node): Promise<vscode.TreeItem> {
    switch (node.kind) {
      case "timer":
        return this.timerItem();

      case "empty": {
        const item = new vscode.TreeItem(
          "Nenhum timer rodando",
          vscode.TreeItemCollapsibleState.None,
        );
        item.iconPath = new vscode.ThemeIcon("play-circle");
        item.description = "Clique para iniciar";
        item.command = {
          command: "optTime.startTimer",
          title: "Iniciar Timer",
        };
        return item;
      }

      case "section": {
        const item = new vscode.TreeItem(
          node.label,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.contextValue = "optTime.section";
        return item;
      }

      case "metric": {
        const item = new vscode.TreeItem(
          node.label,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = node.description;
        item.tooltip = node.tooltip;
        if (node.icon) item.iconPath = new vscode.ThemeIcon(node.icon);
        return item;
      }

      case "projectTotal": {
        const item = new vscode.TreeItem(
          node.name,
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = `${node.code} · ${formatMinutes(node.minutes)}`;
        item.iconPath = await this.icons.dot(node.color);
        return item;
      }

      case "entry": {
        const item = new vscode.TreeItem(
          node.description || "(sem descrição)",
          vscode.TreeItemCollapsibleState.None,
        );
        item.description = `${node.projectCode} · ${node.durationLabel}`;
        item.iconPath = await this.icons.dot(node.color);
        item.contextValue = "optTime.entry";

        const details = [
          `**${node.projectName}** (${node.projectCode})`,
          `Duração: ${node.durationLabel}`,
        ];
        if (node.workItemId) details.push(`Work Item #${node.workItemId}`);
        if (!node.billable) details.push("Não faturável");
        item.tooltip = new vscode.MarkdownString(details.join("\n\n"));

        return item;
      }
    }
  }

  private rootNodes(): Node[] {
    const { timer, summary } = this.timers.state;
    const nodes: Node[] = [timer ? { kind: "timer" } : { kind: "empty" }];

    if (!summary) return nodes;

    const logged = this.timers.projectedDayMinutes();
    const capacity = summary.dailyCapacityMinutes;

    nodes.push({
      kind: "metric",
      label: capacity > 0 ? `${formatMinutes(logged)} de ${formatMinutes(capacity)}` : formatMinutes(logged),
      description: capacity > 0 ? progressBar(logged, capacity, 10) : "hoje",
      icon: summary.isComplete ? "pass-filled" : "pulse",
      tooltip:
        capacity > 0 && logged < capacity
          ? `Faltam ${formatMinutes(capacity - logged)} para fechar o dia.`
          : "Meta diária atingida.",
    });

    if (summary.byProject.length > 0) {
      nodes.push({ kind: "section", label: "Por projeto", id: "byProject" });
    }

    if (summary.entries.length > 0) {
      nodes.push({ kind: "section", label: "Lançamentos", id: "entries" });
    }

    nodes.push({ kind: "section", label: "Semana", id: "week" });

    return nodes;
  }

  private timerItem(): vscode.TreeItem {
    const timer = this.timers.state.timer;
    if (!timer) return new vscode.TreeItem("");

    const item = new vscode.TreeItem(
      formatStopwatch(this.timers.elapsedSeconds()),
      vscode.TreeItemCollapsibleState.None,
    );

    item.description = `${timer.project.code} · ${timer.description || "sem descrição"}`;
    item.iconPath = new vscode.ThemeIcon(
      timer.isPaused ? "debug-pause" : "record",
      new vscode.ThemeColor(timer.isPaused ? "charts.yellow" : "charts.red"),
    );
    item.contextValue = "optTime.activeTimer";
    item.command = { command: "optTime.menu", title: "Menu do timer" };

    const lines = [
      `**${timer.project.name}**`,
      timer.description,
      timer.azureWorkItemId
        ? `Work Item #${timer.azureWorkItemId}${timer.azureWorkItemTitle ? ` — ${timer.azureWorkItemTitle}` : ""}`
        : null,
      timer.isPaused ? "_Pausado_" : null,
    ].filter((line): line is string => Boolean(line));

    item.tooltip = new vscode.MarkdownString(lines.join("\n\n"));

    return item;
  }

  private projectTotals(): Node[] {
    const summary = this.timers.state.summary;
    if (!summary) return [];

    return summary.byProject.map((entry) => ({
      kind: "projectTotal",
      projectId: entry.projectId,
      name: entry.projectName,
      code: entry.projectCode,
      minutes: entry.minutes,
      color:
        summary.entries.find((item) => item.project.id === entry.projectId)
          ?.project.color ?? null,
    }));
  }

  private entries(): Node[] {
    const summary = this.timers.state.summary;
    if (!summary) return [];

    return summary.entries.map((entry) => ({
      kind: "entry",
      id: entry.id,
      description: entry.description,
      durationLabel: entry.durationLabel,
      projectName: entry.project.name,
      projectCode: entry.project.code,
      color: entry.project.color,
      workItemId: entry.azureWorkItemId,
      billable: entry.billable,
    }));
  }

  private weekMetrics(): Node[] {
    const summary = this.timers.state.summary;
    if (!summary) return [];

    const nodes: Node[] = [
      {
        kind: "metric",
        label: formatMinutes(summary.weekTotalMinutes),
        description:
          summary.weeklyCapacityMinutes > 0
            ? `de ${formatMinutes(summary.weeklyCapacityMinutes)}`
            : "acumuladas",
        icon: "calendar",
      },
    ];

    if (summary.weeklyCapacityMinutes > 0) {
      const remaining = summary.weeklyCapacityMinutes - summary.weekTotalMinutes;
      nodes.push({
        kind: "metric",
        label:
          remaining > 0
            ? `Faltam ${formatMinutes(remaining)}`
            : "Semana completa",
        icon: remaining > 0 ? "clock" : "pass-filled",
      });
    }

    return nodes;
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
