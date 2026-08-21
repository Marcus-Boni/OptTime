import * as vscode from "vscode";
import type { OptTimeClient } from "../api/client";
import { toMessage } from "../api/errors";
import type { WorkItemResult } from "../api/types";
import type { OptTimeSettings } from "../config/settings";
import type { Logger } from "../util/logger";
import {
  isTrunkBranch,
  parseBranch,
  type ParsedBranch,
} from "./branch-parser";
import type { API as GitAPI, GitExtension, Repository } from "./git";

/**
 * Everything the current Git branch can tell us about what the developer is
 * working on.
 *
 * A branch like `feat/OPT-452-auth-flow` already carries the three things a
 * time entry needs — the project (`OPT`), the Azure DevOps work item (`452`)
 * and a description (`auth flow`). Reading them here means the timer dialog
 * opens pre-filled instead of empty, which is the difference between logging
 * hours and not bothering.
 */

export interface BranchHints {
  branch: string;
  repositoryName: string;
  /** Work item number parsed from the branch, before any server lookup. */
  workItemId: number | null;
  /** Project code parsed from the branch, e.g. `OPT` in `OPT-452`. */
  projectCode: string | null;
  /** Human description derived from the branch slug. */
  slugDescription: string | null;
  /** Subject line of the branch's most recent commit. */
  lastCommitMessage: string | null;
  /** Filled in by `resolveWorkItem` once the server confirms the ID. */
  workItem: WorkItemResult | null;
}

export class BranchContextProvider implements vscode.Disposable {
  private gitApi: GitAPI | null = null;
  private readonly disposables: vscode.Disposable[] = [];
  private readonly repoWatchers = new Map<string, vscode.Disposable>();
  private readonly workItemCache = new Map<number, WorkItemResult | null>();
  private lastSeenBranch: string | null = null;

  private readonly onDidChangeBranchEmitter =
    new vscode.EventEmitter<BranchHints>();
  /** Fires when HEAD moves to a different branch in any open repository. */
  readonly onDidChangeBranch = this.onDidChangeBranchEmitter.event;

  constructor(
    private readonly client: OptTimeClient,
    private readonly logger: Logger,
    private settings: OptTimeSettings,
  ) {
    this.disposables.push(this.onDidChangeBranchEmitter);
  }

  /**
   * Connects to the built-in Git extension.
   *
   * The Git extension activates lazily and reports `uninitialized` until it has
   * scanned the workspace, so we subscribe to its state rather than reading
   * `repositories` once and concluding there is no repo.
   */
  async activate(): Promise<void> {
    const extension =
      vscode.extensions.getExtension<GitExtension>("vscode.git");

    if (!extension) {
      this.logger.info(
        "Extensão Git não encontrada — detecção de branch desativada.",
      );
      return;
    }

    const exports = extension.isActive
      ? extension.exports
      : await extension.activate();

    if (!exports.enabled) {
      this.logger.info("Git desabilitado no editor — detecção de branch inativa.");
      return;
    }

    this.gitApi = exports.getAPI(1);

    this.disposables.push(
      this.gitApi.onDidOpenRepository((repo) => this.watch(repo)),
      this.gitApi.onDidCloseRepository((repo) => this.unwatch(repo)),
    );

    for (const repo of this.gitApi.repositories) this.watch(repo);

    this.lastSeenBranch = this.currentRepository()?.state.HEAD?.name ?? null;
    this.logger.debug(`Git conectado. Branch atual: ${this.lastSeenBranch ?? "—"}`);
  }

  updateSettings(settings: OptTimeSettings): void {
    this.settings = settings;
  }

  /** The repository backing the active editor, falling back to the first one. */
  currentRepository(): Repository | null {
    if (!this.gitApi || this.gitApi.repositories.length === 0) return null;

    const activeUri = vscode.window.activeTextEditor?.document.uri;
    if (activeUri) {
      const match = this.gitApi.repositories
        .filter((repo) => activeUri.fsPath.startsWith(repo.rootUri.fsPath))
        // The innermost repository wins for nested checkouts and submodules.
        .sort((a, b) => b.rootUri.fsPath.length - a.rootUri.fsPath.length)[0];
      if (match) return match;
    }

    return this.gitApi.repositories[0] ?? null;
  }

  /**
   * Reads the current branch and everything derivable from it.
   *
   * Returns `null` when detection is off, there is no repository, or HEAD sits
   * on a trunk branch — none of which describe a unit of work.
   */
  async getHints(): Promise<BranchHints | null> {
    if (!this.settings.branch.detectionEnabled) return null;

    const repo = this.currentRepository();
    const branch = repo?.state.HEAD?.name;
    if (!repo || !branch) return null;

    if (isTrunkBranch(branch)) {
      return null;
    }

    const parsed = parseBranch(branch, this.settings.branch.extraPatterns);

    return {
      branch,
      repositoryName: basename(repo.rootUri.fsPath),
      workItemId: parsed.workItemId,
      projectCode: parsed.projectCode,
      slugDescription: parsed.slugDescription,
      lastCommitMessage: this.settings.branch.useLastCommitAsDescription
        ? await this.readLastCommitSubject(repo)
        : null,
      workItem: null,
    };
  }

  /**
   * Confirms a parsed work item ID against Azure DevOps.
   *
   * The branch only proves someone typed a number. Looking it up gives the real
   * title — and catches the case where the number was a date or a ticket from
   * another system. Misses are cached too, so a branch with a meaningless
   * number does not re-query on every prompt.
   */
  async resolveWorkItem(workItemId: number): Promise<WorkItemResult | null> {
    const cached = this.workItemCache.get(workItemId);
    if (cached !== undefined) return cached;

    try {
      const results = await this.client.searchWorkItems({
        q: `#${workItemId}`,
        limit: 5,
      });
      const match = results.find((item) => item.id === workItemId) ?? null;
      this.workItemCache.set(workItemId, match);

      if (match) {
        this.logger.debug(`Work Item #${workItemId} resolvido: ${match.title}`);
      } else {
        this.logger.debug(`Work Item #${workItemId} não encontrado no AzDO.`);
      }

      return match;
    } catch (error: unknown) {
      // A failed lookup must never block starting a timer — the ID still gets
      // attached, just without a confirmed title. Not cached, so it retries.
      this.logger.warn(
        `Não foi possível consultar o Work Item #${workItemId}: ${toMessage(error)}`,
      );
      return null;
    }
  }

  /** Hints with the work item already resolved, when the branch carried one. */
  async getEnrichedHints(): Promise<BranchHints | null> {
    const hints = await this.getHints();
    if (!hints?.workItemId) return hints;

    return { ...hints, workItem: await this.resolveWorkItem(hints.workItemId) };
  }

  private watch(repo: Repository): void {
    const key = repo.rootUri.toString();
    if (this.repoWatchers.has(key)) return;

    this.repoWatchers.set(
      key,
      repo.state.onDidChange(() => {
        void this.handleStateChange(repo);
      }),
    );
  }

  private unwatch(repo: Repository): void {
    const key = repo.rootUri.toString();
    this.repoWatchers.get(key)?.dispose();
    this.repoWatchers.delete(key);
  }

  /**
   * `onDidChange` fires for every index and working-tree change, not just
   * checkouts, so the branch name is compared before doing any work.
   */
  private async handleStateChange(repo: Repository): Promise<void> {
    const branch = repo.state.HEAD?.name ?? null;
    if (branch === this.lastSeenBranch) return;

    this.lastSeenBranch = branch;
    if (!branch) return;

    this.logger.debug(`Branch alterada para "${branch}".`);

    const hints = await this.getEnrichedHints();
    if (hints) this.onDidChangeBranchEmitter.fire(hints);
  }

  private async readLastCommitSubject(
    repo: Repository,
  ): Promise<string | null> {
    try {
      const [commit] = await repo.log({ maxEntries: 1 });
      if (!commit) return null;

      const subject = commit.message.split("\n", 1)[0]?.trim() ?? "";
      return subject.length > 0 ? subject : null;
    } catch (error: unknown) {
      this.logger.debug(`Não foi possível ler o último commit: ${toMessage(error)}`);
      return null;
    }
  }

  dispose(): void {
    for (const watcher of this.repoWatchers.values()) watcher.dispose();
    this.repoWatchers.clear();
    for (const disposable of this.disposables) disposable.dispose();
  }
}

export { parseBranch, type ParsedBranch };

function basename(fsPath: string): string {
  const parts = fsPath.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] ?? fsPath;
}
