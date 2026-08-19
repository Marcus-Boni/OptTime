/**
 * AI Operator — turns the actions proposed in a single turn into one ordered,
 * confirm-once plan.
 *
 * A command like "registre 3 horas no OptSolv Web e envie meu timesheet"
 * makes the model call two `prepare_*` tools. Rendering two disconnected cards
 * would make the user confirm twice and, worse, let them submit the week
 * before the entry exists. The plan fixes both: one confirmation, one ordered
 * run.
 */

import type {
  ConfirmableAction,
  OperatorPlanAction,
  OperatorPlanStep,
  OperatorStepAction,
} from "@/lib/ai/types";
import { formatDuration, getWeekPeriod } from "@/lib/utils";

/**
 * Execution order. Steps that produce hours must land before the steps that
 * summarise or submit them, and anything that leaves the app goes last.
 * Actions sharing a rank keep the order the model proposed them in.
 */
const STEP_RANK: Record<ConfirmableAction["kind"], number> = {
  resume_timer: 0,
  pause_timer: 0,
  stop_timer: 0,
  create_time_entry: 1,
  update_time_entry: 1,
  delete_time_entry: 1,
  start_timer: 2,
  submit_timesheet: 3,
  approve_timesheet: 3,
  reject_timesheet: 3,
  export_report: 4,
  notify_team: 5,
};

export function isConfirmableAction(
  action: OperatorStepAction,
): action is ConfirmableAction {
  return action.kind !== "navigate";
}

/** One-line description of a step, shown in the plan checklist. */
export function describeStep(action: ConfirmableAction): {
  title: string;
  detail: string | null;
} {
  switch (action.kind) {
    case "create_time_entry":
      return {
        title: `Registrar ${formatDuration(action.durationMinutes)} em ${action.projectName ?? "projeto"}`,
        detail: `${action.date} · ${action.description}`,
      };
    case "update_time_entry":
      return {
        title: `Editar lançamento de ${action.date}`,
        detail: `${formatDuration(action.current.durationMinutes)} → ${formatDuration(action.next.durationMinutes)}`,
      };
    case "delete_time_entry":
      return {
        title: `Excluir ${formatDuration(action.durationMinutes)} de ${action.date}`,
        detail: action.description,
      };
    case "start_timer":
      return {
        title: `Iniciar cronômetro em ${action.projectName ?? "projeto"}`,
        detail: action.description || null,
      };
    case "stop_timer":
      return {
        title: `Parar cronômetro (${formatDuration(action.elapsedMinutes)})`,
        detail: action.projectName,
      };
    case "pause_timer":
      return { title: "Pausar cronômetro", detail: action.projectName };
    case "resume_timer":
      return { title: "Retomar cronômetro", detail: action.projectName };
    case "submit_timesheet":
      return {
        title: `Submeter timesheet ${action.period}`,
        detail: `${action.periodLabel} · ${formatDuration(action.totalMinutes)}`,
      };
    case "approve_timesheet":
      return {
        title: `Aprovar timesheet de ${action.userName}`,
        detail: `${action.period} · ${formatDuration(action.totalMinutes)}`,
      };
    case "reject_timesheet":
      return {
        title: `Rejeitar timesheet de ${action.userName}`,
        detail: action.reason,
      };
    case "export_report":
      return {
        title: `Gerar relatório ${action.format.toUpperCase()}`,
        detail: `${action.title} · ${action.periodLabel}`,
      };
    case "notify_team":
      return {
        title: `Notificar ${action.recipients.length} pessoa(s)`,
        detail: action.subject,
      };
    default:
      return { title: "Ação", detail: null };
  }
}

/**
 * A submit step is previewed before the plan's own entries exist, so its total
 * would read low. Add the minutes this plan is about to create in the same
 * week, and mark the card so the UI can explain the adjusted figure.
 */
function withAdjustedTotals(steps: ConfirmableAction[]): ConfirmableAction[] {
  const pendingByPeriod = new Map<string, { minutes: number; count: number }>();

  for (const action of steps) {
    if (action.kind !== "create_time_entry") continue;

    const period = getWeekPeriod(action.date);
    const current = pendingByPeriod.get(period) ?? { minutes: 0, count: 0 };
    pendingByPeriod.set(period, {
      minutes: current.minutes + action.durationMinutes,
      count: current.count + 1,
    });
  }

  if (pendingByPeriod.size === 0) return steps;

  return steps.map((action) => {
    if (action.kind !== "submit_timesheet") return action;

    const pending = pendingByPeriod.get(action.period);
    if (!pending) return action;

    return {
      ...action,
      totalMinutes: action.totalMinutes + pending.minutes,
      entryCount: action.entryCount + pending.count,
    };
  });
}

export interface BuildPlanResult {
  plan: OperatorPlanAction | null;
  /** Actions to emit on their own (a single action, plus any navigation). */
  singles: OperatorStepAction[];
}

/**
 * Splits the turn's actions into a plan (2+ confirmable actions) and the
 * standalone actions. A lone action keeps the familiar single-card UX.
 */
export function buildOperatorPlan(
  actions: OperatorStepAction[],
  planId: string,
): BuildPlanResult {
  const confirmable = actions.filter(isConfirmableAction);
  const others = actions.filter((action) => !isConfirmableAction(action));

  if (confirmable.length < 2) {
    return { plan: null, singles: actions };
  }

  const ordered = withAdjustedTotals(
    [...confirmable].sort((a, b) => STEP_RANK[a.kind] - STEP_RANK[b.kind]),
  );

  const steps: OperatorPlanStep[] = ordered.map((action, index) => {
    const { title, detail } = describeStep(action);
    return {
      id: `${planId}-${index}`,
      index,
      title,
      detail,
      action,
    };
  });

  return {
    plan: {
      kind: "operator_plan",
      planId,
      title: `${steps.length} ações em sequência`,
      steps,
    },
    singles: others,
  };
}
