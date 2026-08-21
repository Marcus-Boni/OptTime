import * as vscode from "vscode";
import type { OptTimeClient } from "../api/client";
import { toMessage } from "../api/errors";
import type { ProjectSummary } from "../api/types";
import type { SessionManager } from "../auth/session";
import type { BranchContextProvider } from "../core/branch-context";
import type { Logger } from "../util/logger";
import { matchProjectByHints } from "./quick-picks";
import type { ProjectIcons } from "./icons";

/**
 * The "Projetos" panel — one click to start a timer on any project.
 *
 * The project list barely changes, so it is fetched once and cached until
 * something invalidates it. The branch-suggested project is pinned to the top
 * and labelled, which turns the common case into a single click.
 */

interface ProjectNode {
  project: ProjectSummary;
  suggested: boolean;
}

export class ProjectsTreeProvider
  implements vscode.TreeDataProvider<ProjectNode>, vscode.Disposable
{
  private cache: ProjectSummary[] | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly onDidChangeTreeDataEmitter = new vscode.EventEmitter<
    ProjectNode | undefined
  >();
  readonly onDidChangeTreeData = this.onDidChangeTreeDataEmitter.event;

  constructor(
    private readonly client: OptTimeClient,
    private readonly session: SessionManager,
    private readonly branches: BranchContextProvider,
    private readonly icons: ProjectIcons,
    private readonly logger: Logger,
  ) {
    this.disposables.push(
      this.onDidChangeTreeDataEmitter,
      this.session.onDidChange(() => this.refresh(true)),
      this.branches.onDidChangeBranch(() => this.refresh(false)),
    );
  }

  /** `invalidate` forces a refetch; otherwise only the ordering is redrawn. */
  refresh(invalidate = true): void {
    if (invalidate) this.cache = null;
    this.onDidChangeTreeDataEmitter.fire(undefined);
  }

  async getChildren(element?: ProjectNode): Promise<ProjectNode[]> {
    if (element) return [];
    if (!this.session.isSignedIn) return [];

    const projects = await this.load();
    const hints = await this.branches.getHints();
    const suggestedId = matchProjectByHints(projects, hints)?.id;

    return projects
      .map((project) => ({ project, suggested: project.id === suggestedId }))
      .sort((a, b) => {
        if (a.suggested !== b.suggested) return a.suggested ? -1 : 1;
        return a.project.name.localeCompare(b.project.name, "pt-BR");
      });
  }

  async getTreeItem(node: ProjectNode): Promise<vscode.TreeItem> {
    const item = new vscode.TreeItem(
      node.project.name,
      vscode.TreeItemCollapsibleState.None,
    );

    item.description = node.suggested
      ? `${node.project.code} · sugerido`
      : node.project.code;
    item.iconPath = await this.icons.dot(node.project.color);
    item.contextValue = "optTime.project";

    // Passing the project through keeps the command from re-asking for it.
    item.command = {
      command: "optTime.startTimer",
      title: "Iniciar timer neste projeto",
      arguments: [{ projectId: node.project.id }],
    };

    const lines = [`**${node.project.name}** · \`${node.project.code}\``];
    if (node.project.clientName) lines.push(node.project.clientName);
    if (!node.project.billable) lines.push("_Não faturável_");
    if (node.suggested) lines.push("$(git-branch) Sugerido pela branch atual");

    const tooltip = new vscode.MarkdownString(lines.join("\n\n"), true);
    tooltip.supportThemeIcons = true;
    item.tooltip = tooltip;

    return item;
  }

  private async load(): Promise<ProjectSummary[]> {
    if (this.cache) return this.cache;

    try {
      this.cache = await this.client.listProjects({ limit: 200 });
      return this.cache;
    } catch (error: unknown) {
      // Left uncached so the next refresh retries rather than showing an
      // empty list for the rest of the session.
      this.logger.warn(
        `Não foi possível carregar projetos: ${toMessage(error)}`,
      );
      return [];
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
