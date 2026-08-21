import * as vscode from "vscode";
import type { OptTimeClient } from "../api/client";
import { isApiError, toMessage } from "../api/errors";
import type { SessionManager } from "../auth/session";
import type { OptTimeSettings } from "../config/settings";
import type { BranchContextProvider, BranchHints } from "../core/branch-context";
import type { TimerController } from "../core/timer-controller";
import { DayStatusPanel } from "../ui/day-status";
import {
  askDescription,
  askDuration,
  pickDate,
  pickProject,
  pickWorkItem,
  toIsoDate,
} from "../ui/quick-picks";
import { formatMinutes, formatStopwatch } from "../util/duration";
import type { Logger } from "../util/logger";

/**
 * Every user-facing command.
 *
 * The commands are the only layer that talks to the user: they gather input,
 * call the controller, and report what happened. Business decisions live in the
 * controller and on the server — a command should read like the steps a person
 * would describe out loud.
 *
 * All of them funnel failures through `run`, so a dropped connection produces
 * one clear notification instead of an unhandled rejection in the host log.
 */

export interface CommandDeps {
  client: OptTimeClient;
  timers: TimerController;
  session: SessionManager;
  branches: BranchContextProvider;
  logger: Logger;
  getSettings: () => OptTimeSettings;
  refreshViews: () => void;
}

export function registerCommands(deps: CommandDeps): vscode.Disposable[] {
  const { timers, session, branches, client, logger } = deps;

  /**
   * Wraps a handler with the two guarantees every command needs: a signed-in
   * session, and a single place where failures become notifications.
   */
  function run(
    name: string,
    handler: (...args: unknown[]) => Promise<void>,
    options: { requiresAuth?: boolean; requiresScope?: string } = {},
  ): vscode.Disposable {
    return vscode.commands.registerCommand(name, async (...args: unknown[]) => {
      try {
        if (options.requiresAuth !== false && !session.isSignedIn) {
          const connect = "Conectar agora";
          const answer = await vscode.window.showWarningMessage(
            "Conecte sua conta OptSolv para usar este comando.",
            connect,
          );
          if (answer === connect) await session.signIn();
          return;
        }

        if (options.requiresScope && !session.hasScope(options.requiresScope)) {
          void vscode.window.showErrorMessage(
            `Seu token não tem permissão para esta ação (escopo '${options.requiresScope}'). ` +
              "Gere um novo token com o preset 'Registrar horas'.",
          );
          return;
        }

        await handler(...args);
      } catch (error: unknown) {
        logger.error(`Comando ${name} falhou`, error);

        if (isApiError(error) && error.isAuthFailure) {
          await session.refresh();
        }

        void vscode.window.showErrorMessage(`Opt-Time: ${toMessage(error)}`);
      }
    });
  }

  // ── Session ───────────────────────────────────────────────────────────

  const signIn = run(
    "optTime.signIn",
    async () => {
      if (await session.signIn()) {
        await timers.refresh();
        deps.refreshViews();
      }
    },
    { requiresAuth: false },
  );

  const signOut = run(
    "optTime.signOut",
    async () => {
      await session.signOut();
      await timers.refresh();
      deps.refreshViews();
    },
    { requiresAuth: false },
  );

  // ── Timer ─────────────────────────────────────────────────────────────

  const startTimer = run(
    "optTime.startTimer",
    async (arg) => {
      const preset = arg as { projectId?: string } | undefined;
      const hints = await branches.getEnrichedHints();

      const project = preset?.projectId
        ? ((await client.listProjects({ limit: 200 })).find(
            (candidate) => candidate.id === preset.projectId,
          ) ?? null)
        : await pickProject(client, {
            title: "Iniciar timer",
            hints,
          });

      if (!project) return;

      const description = await askDescription({
        title: `Iniciar timer — ${project.name}`,
        value: suggestDescription(hints),
      });
      if (!description) return;

      const workItem = await pickWorkItem(client, {
        suggested: hints?.workItem ?? null,
        projectId: project.id,
      });
      if (workItem === undefined) return;

      const result = await timers.startTimer({
        projectId: project.id,
        description,
        billable: project.billable,
        ...(workItem
          ? { azureWorkItemId: workItem.id, azureWorkItemTitle: workItem.title }
          : {}),
      });

      deps.refreshViews();

      const notes: string[] = [`Timer iniciado em ${project.name}.`];
      if (result.replaced) {
        notes.push(
          `${formatMinutes(result.replaced.durationMinutes)} salvas em ${result.replaced.projectName}.`,
        );
      }
      if (result.discarded) {
        notes.push(`Timer anterior (${result.discarded.projectName}) descartado por ser curto demais.`);
      }

      void vscode.window.showInformationMessage(notes.join(" "));
    },
    { requiresScope: "time:write" },
  );

  const stopTimer = run(
    "optTime.stopTimer",
    async () => {
      if (!timers.hasTimer) {
        void vscode.window.showInformationMessage("Nenhum timer ativo.");
        return;
      }

      const result = await timers.stopTimer();
      deps.refreshViews();

      if (!result.saved) {
        void vscode.window.showInformationMessage(
          "Timer descartado — durou menos de um minuto.",
        );
        return;
      }

      const seeDay = "Ver o dia";
      const answer = await vscode.window.showInformationMessage(
        `${result.durationLabel} registradas em ${result.project.name}.`,
        seeDay,
      );
      if (answer === seeDay) {
        await vscode.commands.executeCommand("optTime.dayStatus");
      }
    },
    { requiresScope: "time:write" },
  );

  const toggleTimer = run(
    "optTime.toggleTimer",
    async () => {
      const timer = timers.state.timer;

      if (!timer) {
        await vscode.commands.executeCommand("optTime.startTimer");
        return;
      }

      if (timer.isPaused) {
        await timers.resumeTimer();
        void vscode.window.showInformationMessage(
          `Timer retomado em ${timer.project.name}.`,
        );
      } else {
        await timers.pauseTimer();
        void vscode.window.showInformationMessage(
          `Timer pausado em ${formatStopwatch(timers.elapsedSeconds())}.`,
        );
      }

      deps.refreshViews();
    },
    { requiresScope: "time:write" },
  );

  const switchProject = run(
    "optTime.switchProject",
    async () => {
      const current = timers.state.timer;
      const hints = await branches.getEnrichedHints();

      const project = await pickProject(client, {
        title: current
          ? `Trocar de projeto (atual: ${current.project.code})`
          : "Iniciar timer em",
        hints,
      });
      if (!project) return;

      if (current && project.id === current.project.id) {
        void vscode.window.showInformationMessage(
          `O timer já está em ${project.name}.`,
        );
        return;
      }

      // Starting a timer closes the previous one server-side and saves it, so
      // switching keeps the elapsed work rather than dropping it.
      const description =
        current?.description ||
        (await askDescription({
          title: `Timer — ${project.name}`,
          value: suggestDescription(hints),
        }));
      if (!description) return;

      const result = await timers.startTimer({
        projectId: project.id,
        description,
        billable: project.billable,
        ...(current?.azureWorkItemId
          ? {
              azureWorkItemId: current.azureWorkItemId,
              azureWorkItemTitle: current.azureWorkItemTitle ?? undefined,
            }
          : hints?.workItem
            ? {
                azureWorkItemId: hints.workItem.id,
                azureWorkItemTitle: hints.workItem.title,
              }
            : {}),
      });

      deps.refreshViews();

      void vscode.window.showInformationMessage(
        result.replaced
          ? `${formatMinutes(result.replaced.durationMinutes)} salvas em ${result.replaced.projectName}. Timer agora em ${project.name}.`
          : `Timer iniciado em ${project.name}.`,
      );
    },
    { requiresScope: "time:write" },
  );

  // ── Manual entry ──────────────────────────────────────────────────────

  const logQuick = run(
    "optTime.logQuick",
    async () => {
      const hints = await branches.getEnrichedHints();

      const project = await pickProject(client, {
        title: "Lançar horas",
        hints,
      });
      if (!project) return;

      const durationMinutes = await askDuration();
      if (durationMinutes === undefined) return;

      const description = await askDescription({
        title: `${formatMinutes(durationMinutes)} em ${project.name}`,
        value: suggestDescription(hints),
      });
      if (!description) return;

      const workItem = await pickWorkItem(client, {
        suggested: hints?.workItem ?? null,
        projectId: project.id,
      });
      if (workItem === undefined) return;

      const date = await pickDate();
      if (!date) return;

      const result = await client.logTime({
        projectId: project.id,
        durationMinutes,
        description,
        date,
        billable: project.billable,
        ...(workItem
          ? { azureWorkItemId: workItem.id, azureWorkItemTitle: workItem.title }
          : {}),
      });

      await timers.refresh();
      deps.refreshViews();

      const isToday = date === toIsoDate(new Date());
      void vscode.window.showInformationMessage(
        `${result.entry.durationLabel} em ${project.name}` +
          (isToday ? `. Total do dia: ${result.dayTotalLabel}.` : ` em ${formatDatePtBr(date)}.`),
      );
    },
    { requiresScope: "time:write" },
  );

  // ── Branch integration ────────────────────────────────────────────────

  const linkBranchWorkItem = run(
    "optTime.linkBranchWorkItem",
    async () => {
      const settings = deps.getSettings();
      if (!settings.branch.detectionEnabled) {
        void vscode.window.showWarningMessage(
          "A detecção de branch está desativada em 'optTime.branch.detectionEnabled'.",
        );
        return;
      }

      const hints = await branches.getEnrichedHints();

      if (!hints) {
        void vscode.window.showInformationMessage(
          "Nenhuma branch de trabalho detectada. Abra um repositório Git e saia da branch principal.",
        );
        return;
      }

      if (!hints.workItemId) {
        void vscode.window.showInformationMessage(
          `A branch "${hints.branch}" não contém um número de Work Item reconhecível.`,
        );
        return;
      }

      const label = hints.workItem
        ? `#${hints.workItem.id} — ${hints.workItem.title}`
        : `#${hints.workItemId} (não encontrado no Azure DevOps)`;

      const timer = timers.state.timer;

      if (!timer) {
        const start = "Iniciar timer";
        const answer = await vscode.window.showInformationMessage(
          `Work Item detectado: ${label}`,
          { detail: `Branch: ${hints.branch}`, modal: false },
          start,
        );
        if (answer === start) {
          await vscode.commands.executeCommand("optTime.startTimer");
        }
        return;
      }

      if (timer.azureWorkItemId === hints.workItemId) {
        void vscode.window.showInformationMessage(
          `O timer já está vinculado ao Work Item ${label}.`,
        );
        return;
      }

      const link = "Vincular ao timer";
      const answer = await vscode.window.showInformationMessage(
        `Vincular o timer de ${timer.project.name} ao Work Item ${label}?`,
        link,
      );
      if (answer !== link) return;

      await timers.updateTimer({
        azureWorkItemId: hints.workItemId,
        ...(hints.workItem ? { azureWorkItemTitle: hints.workItem.title } : {}),
      });

      deps.refreshViews();
      void vscode.window.showInformationMessage(
        `Timer vinculado ao Work Item #${hints.workItemId}.`,
      );
    },
    { requiresScope: "time:write" },
  );

  // ── Reporting ─────────────────────────────────────────────────────────

  const dayStatus = run("optTime.dayStatus", async () => {
    const [summary, timesheet] = await Promise.all([
      client.getSummary(),
      client.getTimesheet().catch((error: unknown) => {
        logger.warn(`Timesheet indisponível: ${toMessage(error)}`);
        return null;
      }),
    ]);

    DayStatusPanel.show(
      {
        onRefresh: () => void vscode.commands.executeCommand("optTime.dayStatus"),
        onStartTimer: () =>
          void vscode.commands.executeCommand("optTime.startTimer"),
        onSubmitWeek: () =>
          void vscode.commands.executeCommand("optTime.submitTimesheet"),
        onOpenDashboard: () =>
          void vscode.commands.executeCommand("optTime.openDashboard"),
      },
      { summary, timesheet },
    );
  });

  const weekStatus = run("optTime.weekStatus", async () => {
    const timesheet = await client.getTimesheet();

    const lines = timesheet.days
      .map(
        (day) =>
          `${day.weekday.slice(0, 3).padEnd(4)} ${day.label.padStart(6)}${
            day.isBelowTarget && !day.isWeekend ? "  ⚠" : ""
          }`,
      )
      .join("\n");

    const actions = timesheet.canSubmit ? ["Submeter semana"] : [];
    const answer = await vscode.window.showInformationMessage(
      `Semana ${timesheet.period} — ${timesheet.totalLabel} (${timesheet.statusLabel})`,
      {
        modal: true,
        detail: [
          lines,
          "",
          ...timesheet.warnings,
          timesheet.rejectionReason
            ? `Motivo da rejeição: ${timesheet.rejectionReason}`
            : "",
        ]
          .filter(Boolean)
          .join("\n"),
      },
      ...actions,
    );

    if (answer === "Submeter semana") {
      await vscode.commands.executeCommand("optTime.submitTimesheet");
    }
  });

  const submitTimesheet = run(
    "optTime.submitTimesheet",
    async () => {
      const timesheet = await client.getTimesheet();

      if (!timesheet.canSubmit) {
        void vscode.window.showWarningMessage(
          `A semana ${timesheet.period} não pode ser submetida agora (status: ${timesheet.statusLabel}).`,
        );
        return;
      }

      const confirm = "Submeter";
      const answer = await vscode.window.showWarningMessage(
        `Submeter a semana ${timesheet.period} para aprovação?`,
        {
          modal: true,
          detail: [
            `Total: ${timesheet.totalLabel} em ${timesheet.entryCount} lançamento(s).`,
            "",
            ...timesheet.warnings,
            "",
            "Após a submissão os lançamentos ficam bloqueados até a aprovação.",
          ]
            .filter((line) => line !== undefined)
            .join("\n"),
        },
        confirm,
      );
      if (answer !== confirm) return;

      const result = await client.submitTimesheet(timesheet.period);
      await timers.refresh();
      deps.refreshViews();

      void vscode.window.showInformationMessage(
        `Semana ${result.period} submetida — ${result.totalLabel}.`,
      );
    },
    { requiresScope: "timesheets:submit" },
  );

  // ── Menu & utilities ──────────────────────────────────────────────────

  const menu = run("optTime.menu", async () => {
    const timer = timers.state.timer;
    const summary = timers.state.summary;

    interface MenuItem extends vscode.QuickPickItem {
      command?: string;
    }

    const items: MenuItem[] = [];

    if (timer) {
      items.push(
        {
          label: timer.isPaused
            ? "$(debug-continue) Retomar timer"
            : "$(debug-pause) Pausar timer",
          description: formatStopwatch(timers.elapsedSeconds()),
          detail: `${timer.project.name} · ${timer.description || "sem descrição"}`,
          command: "optTime.toggleTimer",
        },
        {
          label: "$(primitive-square) Parar e registrar",
          command: "optTime.stopTimer",
        },
        {
          label: "$(arrow-swap) Trocar de projeto",
          command: "optTime.switchProject",
        },
      );
    } else {
      items.push({
        label: "$(play) Iniciar timer",
        detail: summary ? `Hoje: ${summary.totalLabel}` : undefined,
        command: "optTime.startTimer",
      });
    }

    items.push(
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      { label: "$(add) Lançar horas rápidas", command: "optTime.logQuick" },
      { label: "$(graph) Ver status do dia", command: "optTime.dayStatus" },
      { label: "$(calendar) Ver status da semana", command: "optTime.weekStatus" },
      { label: "$(link) Vincular Work Item da branch", command: "optTime.linkBranchWorkItem" },
      { label: "", kind: vscode.QuickPickItemKind.Separator },
      { label: "$(link-external) Abrir dashboard", command: "optTime.openDashboard" },
      { label: "$(pulse) Diagnosticar conexão", command: "optTime.diagnose" },
    );

    const choice = await vscode.window.showQuickPick(items, {
      title: timer
        ? `${timer.project.name} — ${formatStopwatch(timers.elapsedSeconds())}`
        : "Opt-Time",
      placeHolder: "O que você quer fazer?",
    });

    if (choice?.command) {
      await vscode.commands.executeCommand(choice.command);
    }
  });

  const openDashboard = run(
    "optTime.openDashboard",
    async () => {
      await vscode.env.openExternal(
        vscode.Uri.parse(`${client.baseUrl}/dashboard`),
      );
    },
    { requiresAuth: false },
  );

  const refresh = run(
    "optTime.refresh",
    async () => {
      await timers.refresh();
      deps.refreshViews();
    },
    { requiresAuth: false },
  );

  const showLogs = run(
    "optTime.showLogs",
    async () => {
      logger.show();
    },
    { requiresAuth: false },
  );

  const diagnose = run(
    "optTime.diagnose",
    async () => {
      await runDiagnostics(deps);
    },
    { requiresAuth: false },
  );

  return [
    signIn,
    signOut,
    startTimer,
    stopTimer,
    toggleTimer,
    switchProject,
    logQuick,
    linkBranchWorkItem,
    dayStatus,
    weekStatus,
    submitTimesheet,
    menu,
    openDashboard,
    refresh,
    showLogs,
    diagnose,
  ];
}

// ── Helpers ─────────────────────────────────────────────────────────────

/**
 * The best description the branch can offer.
 *
 * The last commit subject wins over the branch slug: it describes what was
 * actually just done, while the slug describes the whole branch.
 */
function suggestDescription(hints: BranchHints | null): string {
  if (!hints) return "";

  const commit = hints.lastCommitMessage
    ? stripConventionalPrefix(hints.lastCommitMessage)
    : null;

  return commit || hints.workItem?.title || hints.slugDescription || "";
}

/** `feat(auth): add SSO` → `add SSO`. The type is noise in a timesheet. */
function stripConventionalPrefix(message: string): string {
  return message
    .replace(/^(feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert)(\([^)]*\))?!?:\s*/i, "")
    .trim();
}

function formatDatePtBr(iso: string): string {
  const [year, month, day] = iso.split("-");
  return day && month && year ? `${day}/${month}/${year}` : iso;
}

/**
 * A guided connection check.
 *
 * Setup problems are all indistinguishable from the user's side — every one of
 * them looks like "nothing works". This walks the chain and names the step that
 * broke, instead of leaving them to guess between a wrong URL, a revoked token
 * and a scope they never granted.
 */
async function runDiagnostics(deps: CommandDeps): Promise<void> {
  const { client, session, branches, logger } = deps;
  const lines: string[] = [];

  logger.show();
  logger.info("── Diagnóstico ──");
  lines.push(`URL base: ${client.baseUrl}`);

  const token = await session.getToken();
  lines.push(token ? "Token: presente" : "Token: ausente");

  if (!token) {
    lines.push("→ Rode 'Opt-Time: Conectar Conta'.");
    report(lines, logger);
    void vscode.window.showWarningMessage(
      "Nenhum token configurado. Rode 'Opt-Time: Conectar Conta'.",
    );
    return;
  }

  const started = Date.now();
  try {
    const identity = await client.whoami();
    const latency = Date.now() - started;

    lines.push(`Autenticação: OK (${latency} ms)`);
    lines.push(`Usuário: ${identity.user.name} <${identity.user.email}> · ${identity.user.role}`);
    lines.push(`Token: "${identity.token.name}" · escopos: ${identity.token.scopes.join(", ")}`);
    lines.push(
      `Hoje: ${identity.today.totalLabel} em ${identity.today.entryCount} lançamento(s)`,
    );
    lines.push(
      identity.today.activeTimer
        ? `Timer ativo: ${identity.today.activeTimer.project.code} (${identity.today.activeTimer.elapsedLabel})`
        : "Timer ativo: nenhum",
    );

    if (!identity.token.scopes.includes("time:write")) {
      lines.push("⚠ O token é somente leitura — registrar horas vai falhar.");
    }
  } catch (error: unknown) {
    lines.push(`Autenticação: FALHOU — ${toMessage(error)}`);
    report(lines, logger);
    void vscode.window.showErrorMessage(
      `Diagnóstico: ${toMessage(error)}. Veja os detalhes em 'Opt-Time: Ver Logs'.`,
    );
    return;
  }

  const hints = await branches.getHints();
  lines.push(
    hints
      ? `Branch: ${hints.branch} → Work Item ${hints.workItemId ?? "—"}, projeto ${hints.projectCode ?? "—"}`
      : "Branch: nenhuma branch de trabalho detectada",
  );

  report(lines, logger);
  void vscode.window.showInformationMessage(
    "Diagnóstico concluído — resultados no canal Opt-Time.",
  );
}

function report(lines: string[], logger: Logger): void {
  for (const line of lines) logger.info(line);
  logger.info("─────────────────");
}
