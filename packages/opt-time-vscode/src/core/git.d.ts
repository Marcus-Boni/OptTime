import type { Event, Uri } from "vscode";

/**
 * The slice of the built-in Git extension's API that this extension uses.
 *
 * `vscode.git` publishes `git.d.ts` but does not ship it as an installable
 * package, so the accepted practice is to vendor the declarations. Keeping only
 * the members we call makes it obvious what the Git dependency actually is —
 * the branch name, and the last commit message.
 */

export interface GitExtension {
  readonly enabled: boolean;
  readonly onDidChangeEnablement: Event<boolean>;
  getAPI(version: 1): API;
}

export interface API {
  readonly state: APIState;
  readonly onDidChangeState: Event<APIState>;
  readonly repositories: Repository[];
  readonly onDidOpenRepository: Event<Repository>;
  readonly onDidCloseRepository: Event<Repository>;
}

export type APIState = "uninitialized" | "initialized";

export interface Repository {
  readonly rootUri: Uri;
  readonly state: RepositoryState;
  log(options?: LogOptions): Promise<Commit[]>;
}

export interface RepositoryState {
  readonly HEAD: Branch | undefined;
  readonly onDidChange: Event<void>;
}

export interface Branch {
  readonly name?: string;
  readonly commit?: string;
  readonly upstream?: { readonly name: string; readonly remote: string };
}

export interface Commit {
  readonly hash: string;
  readonly message: string;
  readonly authorDate?: Date;
}

export interface LogOptions {
  readonly maxEntries?: number;
  readonly path?: string;
}
