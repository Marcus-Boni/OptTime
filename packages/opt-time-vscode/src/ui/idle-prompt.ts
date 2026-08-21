import * as vscode from "vscode";
import { toMessage } from "../api/errors";
import type { OptTimeSettings } from "../config/settings";
import type { IdleEvent } from "../core/idle-monitor";
import type { IdleMonitor } from "../core/idle-monitor";
import type { TimerController } from "../core/timer-controller";
import { formatMinutes } from "../util/duration";
import type { Logger } from "../util/logger";

/**
 * What to do with time the developer did not actually work.
 *
 * The prompt is modal on purpose. A dismissible toast would be missed exactly
 * when it matters — the developer is away — and the answer would default to
 * "keep", quietly inflating the timesheet. A modal waits for them to come back.
 *
 * The three answers map to what actually happens after stepping away: a meeting
 * you were still working through (keep), a lunch break (discard and carry on),
 * or the end of the session (discard and stop).
 */

export class IdlePrompt implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];

  constructor(
    private readonly timers: TimerController,
    private readonly monitor: IdleMonitor,
    private readonly logger: Logger,
    private settings: OptTimeSettings,
  ) {
    this.disposables.push(
      this.monitor.onDidDetectIdle((event) => {
        void this.handle(event);
      }),
    );
  }

  updateSettings(settings: OptTimeSettings): void {
    this.settings = settings;
  }

  private async handle(event: IdleEvent): Promise<void> {
    try {
      switch (this.settings.idle.action) {
        case "discard":
          await this.discard(event.idleMinutes, { thenPause: false });
          break;
        case "pause":
          await this.discard(event.idleMinutes, { thenPause: true });
          break;
        case "prompt":
          await this.ask(event);
          break;
      }
    } catch (error: unknown) {
      this.logger.error("Falha ao tratar inatividade", error);
      void vscode.window.showErrorMessage(
        `Não foi possível ajustar o tempo ocioso: ${toMessage(error)}`,
      );
    } finally {
      this.monitor.acknowledge();
    }
  }

  private async ask(event: IdleEvent): Promise<void> {
    const timer = this.timers.state.timer;
    if (!timer) return;

    const elapsedLabel = formatMinutes(Math.floor(event.timerElapsedMs / 60_000));
    const idleLabel = formatMinutes(event.idleMinutes);
    const keptLabel = formatMinutes(
      Math.max(0, Math.floor(event.timerElapsedMs / 60_000) - event.idleMinutes),
    );

    const keep = `Manter ${elapsedLabel}`;
    const discard = `Descartar ${idleLabel}`;
    const discardAndStop = "Descartar e parar";

    const answer = await vscode.window.showWarningMessage(
      `Você ficou ${idleLabel} sem atividade no editor.`,
      {
        modal: true,
        detail:
          `O timer de ${timer.project.name} (${timer.project.code}) está em ${elapsedLabel}.\n\n` +
          `• ${keep} — mantém tudo, útil se você estava em reunião.\n` +
          `• ${discard} — o timer continua e fica em ${keptLabel}.\n` +
          `• ${discardAndStop} — descarta a ociosidade e registra ${keptLabel}.`,
      },
      keep,
      discard,
      discardAndStop,
    );

    // Escape on a modal returns undefined. Keeping the time is the safe
    // default: never silently delete work someone may have done offline.
    if (answer === undefined || answer === keep) {
      this.logger.info(`Inatividade de ${idleLabel} mantida no timer.`);
      return;
    }

    await this.discard(event.idleMinutes, {
      thenPause: false,
      thenStop: answer === discardAndStop,
    });
  }

  private async discard(
    minutes: number,
    options: { thenPause: boolean; thenStop?: boolean },
  ): Promise<void> {
    const discarded = await this.timers.discardMinutes(minutes);
    this.logger.info(`${discarded} min de inatividade descartados.`);

    if (options.thenStop) {
      const result = await this.timers.stopTimer();
      void vscode.window.showInformationMessage(
        result.saved
          ? `${formatMinutes(discarded)} descartados. ${result.durationLabel} registradas em ${result.project.name}.`
          : `${formatMinutes(discarded)} descartados. O tempo restante era curto demais para registrar.`,
      );
      return;
    }

    if (options.thenPause) {
      await this.timers.pauseTimer();
      void vscode.window.showInformationMessage(
        `${formatMinutes(discarded)} de inatividade descartados. Timer pausado.`,
      );
      return;
    }

    void vscode.window.showInformationMessage(
      `${formatMinutes(discarded)} de inatividade descartados. O timer continua rodando.`,
    );
  }

  dispose(): void {
    for (const disposable of this.disposables) disposable.dispose();
  }
}
