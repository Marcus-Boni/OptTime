import * as vscode from "vscode";
import type { OptTimeClient } from "../api/client";
import { isApiError, toMessage } from "../api/errors";
import type { Identity } from "../api/types";
import type { Logger } from "../util/logger";

/**
 * Ownership of the personal access token and the signed-in identity.
 *
 * The token goes to `SecretStorage`, which is backed by the OS keychain — never
 * to `settings.json`, which is plain text and frequently committed or synced.
 * Everything else in the extension asks this class whether there is a session
 * instead of reading the secret itself.
 */

/**
 * Where the personal access token lives.
 *
 * Exported because the HTTP client reads it directly: making the client depend
 * on `SessionManager` — which itself needs the client to call `whoami` — would
 * be a construction cycle for no benefit. The key is the contract; both sides
 * agree on it and neither has to own the other.
 */
export const TOKEN_SECRET_KEY = "optTime.apiToken";

const SECRET_KEY = TOKEN_SECRET_KEY;
const TOKEN_PATTERN = /^opt_tok_[0-9a-f]{8}_[0-9a-f]{32,96}$/;

export interface SessionState {
  signedIn: boolean;
  identity: Identity | null;
}

export class SessionManager implements vscode.Disposable {
  private identity: Identity | null = null;
  private readonly disposables: vscode.Disposable[] = [];

  private readonly onDidChangeEmitter = new vscode.EventEmitter<SessionState>();
  /** Fires whenever the user signs in, signs out, or the token is revoked. */
  readonly onDidChange = this.onDidChangeEmitter.event;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly client: OptTimeClient,
    private readonly logger: Logger,
  ) {
    this.disposables.push(
      this.onDidChangeEmitter,
      // Another window signing in or out should not leave this one stale.
      context.secrets.onDidChange((event) => {
        if (event.key === SECRET_KEY) {
          void this.refresh();
        }
      }),
    );
  }

  get state(): SessionState {
    return { signedIn: this.identity !== null, identity: this.identity };
  }

  get isSignedIn(): boolean {
    return this.identity !== null;
  }

  getToken(): Thenable<string | undefined> {
    return this.context.secrets.get(SECRET_KEY);
  }

  /**
   * Validates the stored token against the server and caches the identity.
   *
   * Called on activation and whenever the secret changes. A revoked token
   * clears the session so the UI can fall back to the "connect" state instead
   * of failing on every poll.
   */
  async refresh(): Promise<Identity | null> {
    const token = await this.getToken();
    if (!token) {
      this.setIdentity(null);
      return null;
    }

    try {
      const identity = await this.client.whoami();
      this.setIdentity(identity);
      return identity;
    } catch (error: unknown) {
      if (isApiError(error) && error.isAuthFailure) {
        this.logger.warn("Token rejeitado pelo servidor; sessão encerrada.");
        await this.context.secrets.delete(SECRET_KEY);
        this.setIdentity(null);
        return null;
      }

      // A network blip must not sign the user out — keep the cached identity
      // and let the next poll settle it.
      this.logger.warn(`Falha ao validar sessão: ${toMessage(error)}`);
      return this.identity;
    }
  }

  /**
   * Prompts for a token, validates it, and stores it on success.
   *
   * Validation happens before persisting: storing a bad token would leave the
   * extension in a state where every command fails with the same 401 and the
   * user has no obvious way to correct it.
   */
  async signIn(): Promise<boolean> {
    const baseUrl = this.client.baseUrl;

    const token = await vscode.window.showInputBox({
      title: "Conectar conta OptSolv",
      prompt: `Cole seu token pessoal de ${baseUrl}`,
      placeHolder: "opt_tok_…",
      password: true,
      ignoreFocusOut: true,
      validateInput: (value) => {
        const trimmed = value.trim();
        if (!trimmed) return "Cole o token gerado no dashboard.";
        if (!TOKEN_PATTERN.test(trimmed)) {
          return "Formato inválido. O token começa com 'opt_tok_'.";
        }
        return null;
      },
    });

    if (!token) return false;

    const trimmed = token.trim();

    const identity = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: "Validando token…" },
      async () => {
        // Store first so the client's token callback can read it, then roll
        // back if the server rejects it.
        const previous = await this.getToken();
        await this.context.secrets.store(SECRET_KEY, trimmed);

        try {
          return await this.client.whoami();
        } catch (error: unknown) {
          if (previous) {
            await this.context.secrets.store(SECRET_KEY, previous);
          } else {
            await this.context.secrets.delete(SECRET_KEY);
          }
          throw error;
        }
      },
    ).then(
      (value) => value,
      (error: unknown) => {
        this.logger.error("Falha ao conectar conta", error);
        void vscode.window.showErrorMessage(
          `Não foi possível conectar: ${toMessage(error)}`,
        );
        return null;
      },
    );

    if (!identity) return false;

    this.setIdentity(identity);
    this.logger.info(
      `Conectado como ${identity.user.email} (escopos: ${identity.token.scopes.join(", ")}).`,
    );

    const scopeNote = identity.token.scopes.includes("time:write")
      ? ""
      : " Atenção: este token é somente leitura — você não conseguirá registrar horas.";

    void vscode.window.showInformationMessage(
      `Conectado como ${identity.user.name}.${scopeNote}`,
    );

    return true;
  }

  async signOut(): Promise<void> {
    await this.context.secrets.delete(SECRET_KEY);
    this.setIdentity(null);
    this.logger.info("Sessão encerrada.");
    void vscode.window.showInformationMessage("Conta OptSolv desconectada.");
  }

  /** True when the token carries the scope, so the UI can fail early. */
  hasScope(scope: string): boolean {
    return this.identity?.token.scopes.includes(scope) ?? false;
  }

  private setIdentity(identity: Identity | null): void {
    const changed =
      (this.identity === null) !== (identity === null) ||
      this.identity?.user.id !== identity?.user.id;

    this.identity = identity;

    void vscode.commands.executeCommand(
      "setContext",
      "optTime.signedIn",
      identity !== null,
    );

    if (changed) {
      this.onDidChangeEmitter.fire(this.state);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
