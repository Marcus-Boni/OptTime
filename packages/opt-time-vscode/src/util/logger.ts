import * as vscode from "vscode";

/**
 * A single output channel for the whole extension.
 *
 * Extensions have no console the user can reach, so anything worth diagnosing
 * later — a failed request, a branch that did not parse, an idle prompt that
 * fired — goes here. `Opt-Time: Ver Logs` reveals it.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LEVEL_LABEL: Record<LogLevel, string> = {
  debug: "DEBUG",
  info: "INFO ",
  warn: "WARN ",
  error: "ERROR",
};

export class Logger implements vscode.Disposable {
  private readonly channel: vscode.LogOutputChannel;

  constructor() {
    this.channel = vscode.window.createOutputChannel("Opt-Time", { log: true });
  }

  /** Reveals the channel without stealing focus from the editor. */
  show(): void {
    this.channel.show(true);
  }

  debug(message: string, ...args: unknown[]): void {
    this.write("debug", message, args);
  }

  info(message: string, ...args: unknown[]): void {
    this.write("info", message, args);
  }

  warn(message: string, ...args: unknown[]): void {
    this.write("warn", message, args);
  }

  error(message: string, error?: unknown): void {
    this.write("error", message, error === undefined ? [] : [describe(error)]);
  }

  private write(level: LogLevel, message: string, args: unknown[]): void {
    const suffix = args.length > 0 ? ` ${args.map(stringify).join(" ")}` : "";
    const line = `[${LEVEL_LABEL[level]}] ${message}${suffix}`;

    // LogOutputChannel already stamps timestamps and honours the user's log
    // level filter, so we only forward to the matching method.
    switch (level) {
      case "debug":
        this.channel.debug(line);
        break;
      case "info":
        this.channel.info(line);
        break;
      case "warn":
        this.channel.warn(line);
        break;
      case "error":
        this.channel.error(line);
        break;
    }
  }

  dispose(): void {
    this.channel.dispose();
  }
}

function stringify(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/** Turns an unknown thrown value into something worth reading in a log. */
export function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.stack ?? `${error.name}: ${error.message}`;
  }
  return stringify(error);
}
