import * as vscode from "vscode";
import type { OptTimeSettings } from "../config/settings";
import type { Logger } from "../util/logger";
import type { TimerController } from "./timer-controller";

/**
 * Detects that the developer walked away while a timer was running.
 *
 * There is no OS-level idle signal available to an extension, so activity is
 * inferred from the editor itself: typing, moving the caret, switching files,
 * using the terminal, running a debug session. Any of those means someone is
 * at the keyboard.
 *
 * The events are deliberately cheap to handle — `onDidChangeTextDocument`
 * fires on every keystroke — so the handler does nothing but stamp a number.
 */

export interface IdleEvent {
  /** How long the editor has been untouched, in milliseconds. */
  idleMs: number;
  idleMinutes: number;
  /** Elapsed time on the running timer at the moment idle was detected. */
  timerElapsedMs: number;
}

/** How often to test the idle condition. Cheap: it only compares timestamps. */
const CHECK_INTERVAL_MS = 30_000;

export class IdleMonitor implements vscode.Disposable {
  private lastActivityMs = Date.now();
  private checkHandle: ReturnType<typeof setInterval> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  /**
   * True while a prompt is on screen.
   *
   * Without this the 30-second check would stack modals behind each other,
   * since idle keeps growing until the user answers the first one.
   */
  private prompting = false;

  private readonly onDidDetectIdleEmitter = new vscode.EventEmitter<IdleEvent>();
  /** Fires once per idle stretch, never again until activity resumes. */
  readonly onDidDetectIdle = this.onDidDetectIdleEmitter.event;

  constructor(
    private readonly timers: TimerController,
    private readonly logger: Logger,
    private settings: OptTimeSettings,
  ) {
    this.disposables.push(this.onDidDetectIdleEmitter);
  }

  start(): void {
    const markActive = (): void => this.markActivity();

    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument(markActive),
      vscode.workspace.onDidSaveTextDocument(markActive),
      vscode.window.onDidChangeActiveTextEditor(markActive),
      vscode.window.onDidChangeTextEditorSelection(markActive),
      vscode.window.onDidChangeTextEditorVisibleRanges(markActive),
      vscode.window.onDidChangeActiveTerminal(markActive),
      vscode.window.onDidOpenTerminal(markActive),
      vscode.window.onDidChangeTerminalState(markActive),
      vscode.debug.onDidStartDebugSession(markActive),
      vscode.tasks.onDidStartTask(markActive),
      vscode.window.onDidChangeWindowState((state) => {
        // Regaining focus is itself activity. Losing it is not: the whole point
        // is that time keeps accruing while the window sits in the background.
        if (state.focused) this.markActivity();
      }),
    );

    this.checkHandle = setInterval(() => this.check(), CHECK_INTERVAL_MS);
  }

  updateSettings(settings: OptTimeSettings): void {
    this.settings = settings;
  }

  /** Resets the idle clock. Called on any editor activity. */
  markActivity(): void {
    this.lastActivityMs = Date.now();
  }

  get idleMs(): number {
    return Date.now() - this.lastActivityMs;
  }

  /**
   * Marks the idle stretch as handled.
   *
   * Called after the user answers the prompt: without resetting, the same
   * stretch would trigger again on the very next check.
   */
  acknowledge(): void {
    this.markActivity();
    this.prompting = false;
  }

  private check(): void {
    if (!this.settings.idle.enabled) return;
    if (this.prompting) return;

    // Only a running timer can accrue time the developer did not work.
    if (!this.timers.isRunning) return;

    const idleMs = this.idleMs;
    if (idleMs < this.settings.idle.thresholdMs) return;

    const timerElapsedMs = this.timers.elapsedMs();

    // A timer started while already idle — say, from the web app — should not
    // be accused of more idle time than it has actually run.
    const attributableMs = Math.min(idleMs, timerElapsedMs);
    if (attributableMs < 60_000) return;

    this.prompting = true;
    this.logger.info(
      `Inatividade de ${Math.round(attributableMs / 60_000)} min detectada com o timer rodando.`,
    );

    this.onDidDetectIdleEmitter.fire({
      idleMs: attributableMs,
      idleMinutes: Math.round(attributableMs / 60_000),
      timerElapsedMs,
    });
  }

  dispose(): void {
    if (this.checkHandle) clearInterval(this.checkHandle);
    for (const disposable of this.disposables) disposable.dispose();
  }
}
