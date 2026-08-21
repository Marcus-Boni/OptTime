import * as vscode from "vscode";

/**
 * Typed access to the `optTime.*` configuration.
 *
 * `workspace.getConfiguration().get<T>()` is untyped at the call site and
 * silently returns `undefined` for a renamed key, which surfaces much later as
 * a broken feature. Reading every setting through this one shape means a typo
 * fails at compile time and defaults live in exactly one place.
 */

export type StatusBarClickAction = "menu" | "toggle";
export type IdleAction = "prompt" | "discard" | "pause";
export type BranchPromptMode = "whenIdle" | "always" | "never";

export interface OptTimeSettings {
  baseUrl: string;
  statusBar: {
    enabled: boolean;
    alignment: vscode.StatusBarAlignment;
    priority: number;
    useProjectColor: boolean;
    showDayProgress: boolean;
    clickAction: StatusBarClickAction;
  };
  refreshIntervalMs: number;
  idle: {
    enabled: boolean;
    thresholdMs: number;
    thresholdMinutes: number;
    action: IdleAction;
  };
  branch: {
    detectionEnabled: boolean;
    promptOnSwitch: BranchPromptMode;
    useLastCommitAsDescription: boolean;
    extraPatterns: string[];
  };
  notifications: {
    timesheetReminder: boolean;
  };
}

const SECTION = "optTime";

export function readSettings(): OptTimeSettings {
  const config = vscode.workspace.getConfiguration(SECTION);

  return {
    baseUrl: config.get<string>("baseUrl", "https://opt-time.optsolv.com.br"),
    statusBar: {
      enabled: config.get<boolean>("statusBar.enabled", true),
      alignment:
        config.get<string>("statusBar.alignment", "left") === "right"
          ? vscode.StatusBarAlignment.Right
          : vscode.StatusBarAlignment.Left,
      priority: config.get<number>("statusBar.priority", 100),
      useProjectColor: config.get<boolean>("statusBar.useProjectColor", true),
      showDayProgress: config.get<boolean>("statusBar.showDayProgress", true),
      clickAction: config.get<StatusBarClickAction>(
        "statusBar.clickAction",
        "menu",
      ),
    },
    refreshIntervalMs:
      clamp(config.get<number>("refreshIntervalSeconds", 45), 10, 600) * 1000,
    idle: {
      enabled: config.get<boolean>("idle.enabled", true),
      thresholdMinutes: clamp(
        config.get<number>("idle.thresholdMinutes", 15),
        1,
        240,
      ),
      thresholdMs:
        clamp(config.get<number>("idle.thresholdMinutes", 15), 1, 240) * 60_000,
      action: config.get<IdleAction>("idle.action", "prompt"),
    },
    branch: {
      detectionEnabled: config.get<boolean>("branch.detectionEnabled", true),
      promptOnSwitch: config.get<BranchPromptMode>(
        "branch.promptOnSwitch",
        "whenIdle",
      ),
      useLastCommitAsDescription: config.get<boolean>(
        "branch.useLastCommitAsDescription",
        true,
      ),
      extraPatterns: config.get<string[]>("branch.extraPatterns", []),
    },
    notifications: {
      timesheetReminder: config.get<boolean>(
        "notifications.timesheetReminder",
        true,
      ),
    },
  };
}

/** Fires when any `optTime.*` key changes, with the already-parsed settings. */
export function onDidChangeSettings(
  listener: (settings: OptTimeSettings) => void,
): vscode.Disposable {
  return vscode.workspace.onDidChangeConfiguration((event) => {
    if (event.affectsConfiguration(SECTION)) {
      listener(readSettings());
    }
  });
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
