import type {
  ChecklistTask,
  ChecklistTaskProgress,
  OnboardingSignals,
} from "@/lib/onboarding/types";
import type { UserRole } from "@/types/user";

const ALL_ROLES: readonly UserRole[] = ["member", "manager", "admin"];
const LEADERSHIP: readonly UserRole[] = ["manager", "admin"];
const ADMIN_ONLY: readonly UserRole[] = ["admin"];

/**
 * The "Primeiros Passos" checklist.
 *
 * Kept deliberately short: a list nobody finishes is worse than no list. Tasks
 * are either derived from what the person actually did in the product
 * (`signal`), from finishing a tour (`tour`), or ticked by hand (`manual`).
 *
 * Never add a task that rewards logging more hours — see the anti-overwork
 * rule that also governs gamification.
 */
export const CHECKLIST_TASKS: readonly ChecklistTask[] = [
  {
    id: "welcome_tour",
    title: "Conheça a plataforma",
    description:
      "Um tour de três minutos pelas telas e atalhos que você vai usar todo dia.",
    kind: "tour",
    tourId: "welcome",
    cta: { label: "Iniciar tour", href: null },
    icon: "compass",
    roles: ALL_ROLES,
  },
  {
    id: "first_entry",
    title: "Registre suas primeiras horas",
    description:
      "Lance qualquer atividade recente. Aceita 2, 2.5, 2h30 ou 150m como duração.",
    kind: "signal",
    signal: "hasTimeEntry",
    cta: { label: "Registrar tempo", href: "/dashboard/time" },
    icon: "clock",
    roles: ALL_ROLES,
  },
  {
    id: "use_timer",
    title: "Cronometre uma atividade",
    description:
      "Inicie o timer e pare ao terminar. Ele roda no servidor e sobrevive a refresh e troca de máquina.",
    kind: "signal",
    signal: "hasTimerEntry",
    cta: { label: "Abrir registro", href: "/dashboard/time" },
    icon: "clock",
    roles: ALL_ROLES,
  },
  {
    id: "first_submit",
    title: "Feche sua primeira semana",
    description:
      "Revise os lançamentos da semana e submeta ao seu gestor. Só assim as horas entram na conformidade.",
    kind: "signal",
    signal: "hasSubmittedTimesheet",
    cta: { label: "Ver timesheets", href: "/dashboard/time?view=timesheets" },
    icon: "check-square",
    roles: ALL_ROLES,
  },
  {
    id: "meet_timebot",
    title: "Conheça a IA do produto",
    description:
      "TimeBot, comando de voz e resumo semanal — e como definir até onde a automação pode ir.",
    kind: "tour",
    tourId: "ai-assistant",
    cta: { label: "Iniciar tour", href: null },
    icon: "bot",
    roles: ALL_ROLES,
  },
  {
    id: "customize_experience",
    title: "Ajuste a plataforma ao seu jeito",
    description:
      "Tema, visão padrão, duração sugerida, lembretes e privacidade no mural da equipe.",
    kind: "manual",
    cta: { label: "Abrir configurações", href: "/dashboard/settings" },
    icon: "settings",
    roles: ALL_ROLES,
  },
  {
    id: "management_tour",
    title: "Explore a Central de Gestão",
    description:
      "Radar de risco, capacidade da equipe, aprovação em lote e portal do cliente.",
    kind: "tour",
    tourId: "management",
    cta: { label: "Iniciar tour", href: null },
    icon: "radar",
    roles: LEADERSHIP,
  },
  {
    id: "first_approval",
    title: "Aprove um timesheet da equipe",
    description:
      "Revise as horas de quem se reporta a você e aprove, ou rejeite com um motivo claro.",
    kind: "signal",
    signal: "hasApprovedTimesheet",
    cta: { label: "Ver aprovações", href: "/dashboard/timesheets/approvals" },
    icon: "check-square",
    roles: LEADERSHIP,
  },
  {
    id: "admin_tour",
    title: "Configure as integrações",
    description:
      "Azure DevOps, Microsoft Teams, MCP e as automações que rodam sozinhas.",
    kind: "tour",
    tourId: "admin-setup",
    cta: { label: "Iniciar tour", href: null },
    icon: "settings",
    roles: ADMIN_ONLY,
  },
  {
    id: "invite_teammate",
    title: "Convide alguém para o time",
    description:
      "O convite cria a conta no primeiro acesso, com papel de membro por padrão.",
    kind: "signal",
    signal: "hasSentInvitation",
    cta: { label: "Abrir equipe", href: "/dashboard/people" },
    icon: "settings",
    roles: ADMIN_ONLY,
  },
];

/** Tasks that apply to a role, in catalogue order. */
export function getTasksForRole(role: UserRole): ChecklistTask[] {
  return CHECKLIST_TASKS.filter(
    (task) => !task.roles || task.roles.includes(role),
  );
}

export interface ChecklistInput {
  role: UserRole;
  completedTours: readonly string[];
  completedTasks: readonly string[];
  signals: OnboardingSignals;
}

/** Resolves each task's `done` flag from tours, signals and manual ticks. */
export function resolveChecklist(
  input: ChecklistInput,
): ChecklistTaskProgress[] {
  return getTasksForRole(input.role).map((task) => {
    if (task.kind === "tour") {
      return {
        ...task,
        done: task.tourId ? input.completedTours.includes(task.tourId) : false,
      };
    }

    if (task.kind === "signal") {
      return {
        ...task,
        done: task.signal ? input.signals[task.signal] : false,
      };
    }

    return { ...task, done: input.completedTasks.includes(task.id) };
  });
}

/** Only manual tasks can be ticked or un-ticked through the API. */
export function isManualTaskId(taskId: string): boolean {
  return CHECKLIST_TASKS.some(
    (task) => task.id === taskId && task.kind === "manual",
  );
}
