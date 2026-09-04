import * as vscode from "vscode";
import { OptTimeClient } from "./api/client";
import { toMessage } from "./api/errors";
import { SessionManager, TOKEN_SECRET_KEY } from "./auth/session";
import { registerCommands } from "./commands";
import { onDidChangeSettings, readSettings } from "./config/settings";
import { BranchContextProvider, type BranchHints } from "./core/branch-context";
import { IdleMonitor } from "./core/idle-monitor";
import { TimerController } from "./core/timer-controller";
import { DayStatusPanel } from "./ui/day-status";
import { ProjectIcons } from "./ui/icons";
import { IdlePrompt } from "./ui/idle-prompt";
import { StatusBar } from "./ui/status-bar";
import { ProjectsTreeProvider } from "./ui/tree-projects";
import { TodayTreeProvider } from "./ui/tree-today";
import { Logger } from "./util/logger";

/**
 * Composition root.
 *
 * Everything is constructed here and wired through constructors, so each piece
 * can be read on its own: the controller never reaches for the status bar, and
 * the status bar never issues a request. This file is the only place that knows
 * the whole graph.
 */

const REMINDER_STATE_KEY = "optTime.lastTimesheetReminder";

export async function activate(
  context: vscode.ExtensionContext,
): Promise<void> {
  let settings = readSettings();

  const logger = new Logger();
  context.subscriptions.push(logger);
  logger.info(`Opt-Time ativado. Servidor: ${settings.baseUrl}`);

  // ── Core services ─────────────────────────────────────────────────────

  const client = new OptTimeClient({
    getBaseUrl: () => settings.baseUrl,
    // Read straight from SecretStorage rather than through the session, which
    // is constructed with this client and would close the loop.
    getToken: () => Promise.resolve(context.secrets.get(TOKEN_SECRET_KEY)),
    userAgent: `opt-time-vscode/${context.extension.packageJSON.version ?? "0.0.0"}`,
    onRequest: (method, path, status) =>
      logger.debug(`${method} ${path} → ${status}`),
  });

  const session = new SessionManager(context, client, logger);
  const timers = new TimerController(client, session, logger, settings);
  const branches = new BranchContextProvider(client, logger, settings);
  const idleMonitor = new IdleMonitor(timers, logger, settings);
  const icons = new ProjectIcons(context, logger);

  context.subscriptions.push(session, timers, branches, idleMonitor, icons);

  // ── UI ────────────────────────────────────────────────────────────────

  const statusBar = new StatusBar(timers, session, settings);
  const idlePrompt = new IdlePrompt(timers, idleMonitor, logger, settings);
  const todayTree = new TodayTreeProvider(timers, session, icons);
  const projectsTree = new ProjectsTreeProvider(
    client,
    session,
    branches,
    icons,
    logger,
  );

  context.subscriptions.push(
    statusBar,
    idlePrompt,
    todayTree,
    projectsTree,
    vscode.window.createTreeView("optTime.today", {
      treeDataProvider: todayTree,
      showCollapseAll: false,
    }),
    vscode.window.createTreeView("optTime.projects", {
      treeDataProvider: projectsTree,
      showCollapseAll: false,
    }),
  );

  const refreshViews = (): void => {
    todayTree.refresh();
    projectsTree.refresh(false);
  };

  // ── Commands ──────────────────────────────────────────────────────────

  context.subscriptions.push(
    ...registerCommands({
      client,
      timers,
      session,
      branches,
      logger,
      getSettings: () => settings,
      refreshViews,
    }),
  );

  // ── Reactions ─────────────────────────────────────────────────────────

  context.subscriptions.push(
    onDidChangeSettings((next) => {
      const baseUrlChanged = next.baseUrl !== settings.baseUrl;
      settings = next;

      timers.updateSettings(next);
      branches.updateSettings(next);
      idleMonitor.updateSettings(next);
      idlePrompt.updateSettings(next);
      statusBar.updateSettings(next);

      if (baseUrlChanged) {
        logger.info(`Servidor alterado para ${next.baseUrl}. Revalidando sessão…`);
        void session.refresh().then(() => timers.refresh());
      }

      refreshViews();
    }),

    session.onDidChange((state) => {
      logger.info(
        state.signedIn
          ? `Sessão ativa: ${state.identity?.user.email}`
          : "Sem sessão ativa.",
      );
      projectsTree.refresh(true);
      void timers.refresh();
    }),

    // The day panel is a snapshot; keep it live while it is open.
    timers.onDidChange(() => {
      if (!DayStatusPanel.isOpen) return;
      void refreshDayPanel(client, logger);
    }),

    branches.onDidChangeBranch((hints) => {
      void handleBranchSwitch(hints, { timers, logger, getSettings: () => settings });
    }),

    // Coming back to the window is the moment stale data is most visible.
    vscode.window.onDidChangeWindowState((state) => {
      if (state.focused) void timers.refresh();
    }),
  );

  // ── Start ─────────────────────────────────────────────────────────────

  timers.start();
  idleMonitor.start();

  await session.refresh();
  await branches.activate();
  await timers.refresh();
  refreshViews();

  if (!session.isSignedIn) {
    void promptFirstRun(context, logger);
  } else if (settings.notifications.timesheetReminder) {
    void maybeRemindTimesheet(context, client, logger);
  }
}

export function deactivate(): void {
  // Everything registered in `context.subscriptions` is disposed by the host.
}

// ── Branch switching ────────────────────────────────────────────────────

/**
 * Offers to start a timer when the developer checks out a work branch.
 *
 * Deliberately a non-modal notification: a checkout is a frequent, low-stakes
 * event, and a modal on every branch switch would be intolerable. Ignoring it
 * costs nothing.
 */
async function handleBranchSwitch(
  hints: BranchHints,
  deps: {
    timers: TimerController;
    logger: Logger;
    getSettings: () => ReturnType<typeof readSettings>;
  },
): Promise<void> {
  const settings = deps.getSettings();
  const mode = settings.branch.promptOnSwitch;

  if (mode === "never") return;
  if (mode === "whenIdle" && deps.timers.hasTimer) return;

  const running = deps.timers.state.timer;

  // Nothing to suggest if the timer is already pointed at this work item.
  if (running && running.azureWorkItemId === hints.workItemId) return;

  const label = hints.workItem
    ? `#${hints.workItem.id} — ${hints.workItem.title}`
    : hints.workItemId
      ? `#${hints.workItemId}`
      : hints.branch;

  const start = running ? "Trocar timer" : "Iniciar timer";
  const link = running && hints.workItemId ? "Vincular Work Item" : undefined;

  const answer = await vscode.window.showInformationMessage(
    `Você está em ${label}.`,
    ...[start, link].filter((action): action is string => Boolean(action)),
  );

  if (answer === start) {
    await vscode.commands.executeCommand(
      running ? "optTime.switchProject" : "optTime.startTimer",
    );
  } else if (answer === link) {
    await vscode.commands.executeCommand("optTime.linkBranchWorkItem");
  }

  deps.logger.debug(`Sugestão de branch respondida com: ${answer ?? "ignorada"}`);
}

// ── First run & reminders ───────────────────────────────────────────────

async function promptFirstRun(
  context: vscode.ExtensionContext,
  logger: Logger,
): Promise<void> {
  const seenKey = "optTime.welcomed";
  if (context.globalState.get<boolean>(seenKey)) return;

  await context.globalState.update(seenKey, true);
  logger.info("Primeira execução — exibindo boas-vindas.");

  const connect = "Conectar conta";
  const tour = "Ver introdução";

  const answer = await vscode.window.showInformationMessage(
    "Opt-Time instalado. Conecte sua conta para registrar horas sem sair do editor.",
    connect,
    tour,
  );

  if (answer === connect) {
    await vscode.commands.executeCommand("optTime.signIn");
  } else if (answer === tour) {
    await vscode.commands.executeCommand(
      "workbench.action.openWalkthrough",
      "OptSolvTimeTracker.opt-time-vscode#optTime.setup",
      false,
    );
  }
}

/**
 * Nudges about an unsubmitted week, at most once a day.
 *
 * The reminder is stored by date rather than by a timestamp so it survives
 * restarts without nagging: reopening the editor five times in one afternoon
 * still produces at most one notification.
 */
async function maybeRemindTimesheet(
  context: vscode.ExtensionContext,
  client: OptTimeClient,
  logger: Logger,
): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);
  if (context.globalState.get<string>(REMINDER_STATE_KEY) === today) return;

  try {
    const timesheet = await client.getTimesheet();
    if (!timesheet.canSubmit || timesheet.totalMinutes === 0) return;

    // Only nag once the week is effectively over.
    const weekday = new Date().getDay();
    if (weekday !== 5 && weekday !== 6 && weekday !== 0) return;

    await context.globalState.update(REMINDER_STATE_KEY, today);

    const submit = "Submeter agora";
    const review = "Revisar";

    const answer = await vscode.window.showInformationMessage(
      `A semana ${timesheet.period} ainda não foi submetida — ${timesheet.totalLabel} registradas.`,
      submit,
      review,
    );

    if (answer === submit) {
      await vscode.commands.executeCommand("optTime.submitTimesheet");
    } else if (answer === review) {
      await vscode.commands.executeCommand("optTime.dayStatus");
    }
  } catch (error: unknown) {
    logger.debug(`Lembrete de timesheet ignorado: ${toMessage(error)}`);
  }
}

async function refreshDayPanel(
  client: OptTimeClient,
  logger: Logger,
): Promise<void> {
  try {
    const [summary, timesheet] = await Promise.all([
      client.getSummary(),
      client.getTimesheet().catch(() => null),
    ]);
    DayStatusPanel.refreshIfOpen({ summary, timesheet });
  } catch (error: unknown) {
    logger.debug(`Falha ao atualizar o painel do dia: ${toMessage(error)}`);
  }
}
