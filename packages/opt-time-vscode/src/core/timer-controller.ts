import * as vscode from "vscode";
import type { OptTimeClient } from "../api/client";
import { isApiError, toMessage } from "../api/errors";
import type {
  ActiveTimer,
  DaySummary,
  StartTimerResult,
  StopTimerResult,
} from "../api/types";
import type { SessionManager } from "../auth/session";
import type { OptTimeSettings } from "../config/settings";
import type { Logger } from "../util/logger";

/**
 * The single source of truth for timer and day state.
 *
 * Every view — status bar, tree views, quick picks — reads from here and
 * re-renders on its events. Nothing else calls the timer endpoints, which is
 * what keeps two views from disagreeing about whether a timer is running.
 *
 * The timer itself lives on the server, so this class reconciles two clocks:
 * a poll every `refreshIntervalMs` for the truth, and a local one-second tick
 * so the display moves like a stopwatch instead of stepping every 45 seconds.
 */

export interface TimerState {
  timer: ActiveTimer | null;
  summary: DaySummary | null;
  /** Last transport failure, kept so the UI can show a degraded state. */
  lastError: string | null;
  loading: boolean;
}

export class TimerController implements vscode.Disposable {
  private timer: ActiveTimer | null = null;
  private summary: DaySummary | null = null;
  private lastError: string | null = null;
  private loading = false;

  private pollHandle: ReturnType<typeof setInterval> | undefined;
  private tickHandle: ReturnType<typeof setInterval> | undefined;
  private inFlight: Promise<void> | null = null;

  /** Local anchor used to extrapolate the running clock between polls. */
  private anchor: { epoch: string; localMs: number; elapsedMs: number } | null =
    null;

  private readonly onDidChangeEmitter = new vscode.EventEmitter<TimerState>();
  /** Fires when the underlying data changes — poll result or local action. */
  readonly onDidChange = this.onDidChangeEmitter.event;

  private readonly onDidTickEmitter = new vscode.EventEmitter<void>();
  /** Fires once per second while a timer is running, for the clock display. */
  readonly onDidTick = this.onDidTickEmitter.event;

  constructor(
    private readonly client: OptTimeClient,
    private readonly session: SessionManager,
    private readonly logger: Logger,
    private settings: OptTimeSettings,
  ) {}

  get state(): TimerState {
    return {
      timer: this.timer,
      summary: this.summary,
      lastError: this.lastError,
      loading: this.loading,
    };
  }

  get isRunning(): boolean {
    return this.timer !== null && !this.timer.isPaused;
  }

  get hasTimer(): boolean {
    return this.timer !== null;
  }

  start(): void {
    this.restartPolling();
    this.tickHandle = setInterval(() => {
      if (this.timer && !this.timer.isPaused) this.onDidTickEmitter.fire();
    }, 1000);
  }

  updateSettings(settings: OptTimeSettings): void {
    const intervalChanged =
      settings.refreshIntervalMs !== this.settings.refreshIntervalMs;
    this.settings = settings;
    if (intervalChanged) this.restartPolling();
  }

  /**
   * Elapsed milliseconds for display, extrapolated from the last poll.
   *
   * The anchor is recomputed only when the timer's identity or paused state
   * changes, so within one "epoch" the value only ever moves forward — a clock
   * that jumps backwards on every poll would read as a bug.
   */
  elapsedMs(now = Date.now()): number {
    if (!this.timer) return 0;

    const epoch = `${this.timer.id}|${this.timer.startedAt}|${this.timer.pausedAt ?? ""}`;

    if (!this.anchor || this.anchor.epoch !== epoch) {
      const startedAtMs = Date.parse(this.timer.startedAt);
      // `elapsedMinutes` is floored, so it is a lower bound. For a timer that
      // was never paused, wall time since `startedAt` is exact and larger.
      const flooredMs = this.timer.elapsedMinutes * 60_000;
      const elapsedMs = this.timer.isPaused
        ? flooredMs
        : Math.max(flooredMs, now - startedAtMs);

      this.anchor = { epoch, localMs: now, elapsedMs };
    }

    if (this.timer.isPaused) return this.anchor.elapsedMs;
    return this.anchor.elapsedMs + (now - this.anchor.localMs);
  }

  elapsedSeconds(now = Date.now()): number {
    return Math.floor(this.elapsedMs(now) / 1000);
  }

  /** Today's total including the time the running timer has accrued. */
  projectedDayMinutes(now = Date.now()): number {
    const logged = this.summary?.totalMinutes ?? 0;
    return logged + Math.floor(this.elapsedMs(now) / 60_000);
  }

  // ── Server sync ───────────────────────────────────────────────────────

  /**
   * Refreshes timer and day summary in one round trip pair.
   *
   * Concurrent callers share the in-flight promise: the poll, a command and a
   * tree-view refresh can all land in the same tick, and three identical
   * requests would only burn rate limit.
   */
  async refresh(): Promise<void> {
    if (this.inFlight) return this.inFlight;

    this.inFlight = this.doRefresh().finally(() => {
      this.inFlight = null;
    });

    return this.inFlight;
  }

  private async doRefresh(): Promise<void> {
    if (!this.session.isSignedIn) {
      this.applyState(null, null, null);
      return;
    }

    this.loading = this.summary === null;

    try {
      // The summary already embeds the active timer, so one request answers
      // both questions — and guarantees they describe the same instant.
      const summary = await this.client.getSummary();
      this.applyState(summary.activeTimer, summary, null);
    } catch (error: unknown) {
      if (isApiError(error) && error.isAuthFailure) {
        this.logger.warn("Sessão expirada durante o polling.");
        await this.session.refresh();
        this.applyState(null, null, null);
        return;
      }

      const message = toMessage(error);
      this.logger.warn(`Falha ao sincronizar: ${message}`);
      // Keep the last known data on screen — a transient network failure
      // should not blank out the timer the user is watching.
      this.applyState(this.timer, this.summary, message);
    } finally {
      this.loading = false;
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────

  async startTimer(input: {
    projectId: string;
    description: string;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
    billable?: boolean;
  }): Promise<StartTimerResult> {
    const result = await this.client.startTimer(input);
    this.applyState(result.timer, this.summary, null);
    void this.refresh();
    return result;
  }

  async stopTimer(): Promise<StopTimerResult> {
    const result = await this.client.stopTimer();
    this.applyState(null, this.summary, null);
    void this.refresh();
    return result;
  }

  async pauseTimer(): Promise<ActiveTimer> {
    const timer = await this.client.pauseTimer();
    this.applyState(timer, this.summary, null);
    return timer;
  }

  async resumeTimer(): Promise<ActiveTimer> {
    const timer = await this.client.resumeTimer();
    this.applyState(timer, this.summary, null);
    return timer;
  }

  /** Removes idle minutes from the running timer, keeping it alive. */
  async discardMinutes(minutes: number): Promise<number> {
    const result = await this.client.discardTimerTime(minutes);
    this.applyState(result.timer, this.summary, null);
    return result.discardedMinutes;
  }

  /** Edits the running timer — used to attach a branch-detected work item. */
  async updateTimer(patch: {
    description?: string;
    billable?: boolean;
    azureWorkItemId?: number | null;
    azureWorkItemTitle?: string;
  }): Promise<ActiveTimer> {
    const timer = await this.client.updateTimer(patch);
    this.applyState(timer, this.summary, null);
    return timer;
  }

  // ── Internals ─────────────────────────────────────────────────────────

  private applyState(
    timer: ActiveTimer | null,
    summary: DaySummary | null,
    error: string | null,
  ): void {
    this.timer = timer;
    this.summary = summary;
    this.lastError = error;

    if (!timer) this.anchor = null;

    void vscode.commands.executeCommand(
      "setContext",
      "optTime.timerRunning",
      timer !== null,
    );

    this.onDidChangeEmitter.fire(this.state);
  }

  private restartPolling(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);

    this.pollHandle = setInterval(() => {
      // Polling a window nobody is looking at wastes rate limit; the next
      // focus event triggers a refresh anyway.
      if (!vscode.window.state.focused) return;
      void this.refresh();
    }, this.settings.refreshIntervalMs);
  }

  dispose(): void {
    if (this.pollHandle) clearInterval(this.pollHandle);
    if (this.tickHandle) clearInterval(this.tickHandle);
    this.onDidChangeEmitter.dispose();
    this.onDidTickEmitter.dispose();
  }
}
