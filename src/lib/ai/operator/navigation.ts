/**
 * AI Operator — catalogue of screens the assistant may open.
 *
 * Only routes that really exist in the app: a wrong path would 404, and the
 * assistant navigates on its own in the delegated modes, so a bad target is
 * far more expensive here than a missing one.
 */

import { SETTINGS_TABS } from "@/app/(dashboard)/dashboard/settings/tabs";
import type { AppRole } from "@/lib/access-control";

export interface NavigationTargetMeta {
  id: string;
  path: string;
  /** Button label, pt-BR, always in the imperative ("Abrir …"). */
  label: string;
  /** What the user finds there — helps the model pick the right screen. */
  description: string;
  roles?: AppRole[];
}

export const NAVIGATION_TARGETS: Record<string, NavigationTargetMeta> = {
  dashboard: {
    id: "dashboard",
    path: "/dashboard",
    label: "Abrir o Dashboard",
    description: "Visão geral do dia e da semana, cronômetro e atalhos.",
  },
  time: {
    id: "time",
    path: "/dashboard/time",
    label: "Abrir o Registro de Horas",
    description:
      "Lançamentos por dia, semana e mês, calendário, timesheet da semana e submissão.",
  },
  timesheets: {
    id: "timesheets",
    path: "/dashboard/time",
    label: "Abrir os Timesheets",
    description:
      "Mesma tela do registro de horas — é lá que a semana é conferida e submetida.",
  },
  approvals: {
    id: "approvals",
    path: "/dashboard/timesheets/approvals",
    label: "Abrir Aprovações",
    description: "Fila de timesheets da equipe aguardando aprovação.",
    roles: ["manager", "admin"],
  },
  projects: {
    id: "projects",
    path: "/dashboard/projects",
    label: "Abrir Projetos",
    description: "Lista de projetos, budgets e membros.",
  },
  project_scopes: {
    id: "project_scopes",
    path: "/dashboard/projects/scopes",
    label: "Abrir Escopos de Projeto",
    description: "Escopos e frentes de trabalho dos projetos.",
  },
  team_hours: {
    id: "team_hours",
    path: "/dashboard/team-hours",
    label: "Abrir Horas da Equipe",
    description: "Horas consolidadas por pessoa e por projeto.",
    roles: ["manager", "admin"],
  },
  people: {
    id: "people",
    path: "/dashboard/people",
    label: "Abrir Pessoas",
    description: "Colaboradores, papéis, capacidade e desempenho.",
    roles: ["manager", "admin"],
  },
  suggestions: {
    id: "suggestions",
    path: "/dashboard/suggestions",
    label: "Abrir Sugestões",
    description:
      "Apontamentos sugeridos pela IA a partir da atividade no Azure DevOps.",
  },
  releases: {
    id: "releases",
    path: "/dashboard/releases",
    label: "Abrir Novidades",
    description: "Histórico de versões e novidades do produto.",
  },
  profile: {
    id: "profile",
    path: "/dashboard/profile",
    label: "Abrir meu Perfil",
    description: "Dados pessoais, avatar e preferências da conta.",
  },
  settings: {
    id: "settings",
    path: "/dashboard/settings",
    label: "Abrir Configurações",
    description: "Preferências gerais do sistema.",
  },
  operator_settings: {
    id: "operator_settings",
    path: "/dashboard/settings?tab=operator",
    label: "Configurar o Operador de IA",
    description:
      "Nível de autonomia do assistente, permissões por ação, voz e digest semanal.",
  },
  productivity_settings: {
    id: "productivity_settings",
    path: "/dashboard/settings?tab=productivity",
    label: "Abrir Produtividade",
    description: "Metas, capacidade semanal, Modo Foco e Pomodoro.",
  },
  integrations: {
    id: "integrations",
    path: "/dashboard/settings/integrations",
    label: "Abrir Integrações",
    description: "Conexões com Azure DevOps, Outlook e demais serviços.",
  },
  azure_devops: {
    id: "azure_devops",
    path: "/dashboard/settings/integrations/azure-devops",
    label: "Configurar o Azure DevOps",
    description: "Organização, projetos vinculados e token de acesso.",
  },
};

export const NAVIGATION_TARGET_LIST: NavigationTargetMeta[] =
  Object.values(NAVIGATION_TARGETS);

/** Screens the role is allowed to open. */
export function getNavigationTargetsForRole(
  role: AppRole,
): NavigationTargetMeta[] {
  return NAVIGATION_TARGET_LIST.filter(
    (target) => !target.roles || target.roles.includes(role),
  );
}

export function resolveNavigationTarget(
  raw: string,
  role: AppRole,
): NavigationTargetMeta | null {
  const target = NAVIGATION_TARGETS[raw.trim().toLowerCase()];
  if (!target) return null;
  if (target.roles && !target.roles.includes(role)) return null;

  return target;
}

/** Deep link into a single project's dashboard. */
export function buildProjectPath(projectId: string): string {
  return `/dashboard/projects/${projectId}`;
}

/** Deep link into a settings tab, validated against the real tab list. */
export function buildSettingsPath(tab: string): string {
  const candidate = tab.trim().toLowerCase();
  const known = SETTINGS_TABS.find((item) => item === candidate);

  return known ? `/dashboard/settings?tab=${known}` : "/dashboard/settings";
}

/** "Operador IA" tab — modes, per-action permissions, voice and weekly digest. */
export const OPERATOR_SETTINGS_PATH = "/dashboard/settings?tab=operator";
