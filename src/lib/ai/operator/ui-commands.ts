/**
 * AI Operator — catalogue of interface commands.
 *
 * These are the things the assistant can do to the *app itself* rather than to
 * the data: open the focus overlay, pop the quick-entry dialog, flip the theme.
 * The catalogue is server-safe (plain data) so the tool layer can advertise it
 * to the model and the client can execute it from the same source of truth.
 */

import type { AppRole } from "@/lib/access-control";

export type UiCommandId =
  | "focus_mode"
  | "focus_mode_start"
  | "focus_mode_exit"
  | "quick_entry"
  | "quick_timer"
  | "command_palette"
  | "weekly_digest"
  | "shortcuts"
  | "theme_dark"
  | "theme_light"
  | "theme_toggle"
  | "sidebar_toggle";

export interface UiCommandMeta {
  id: UiCommandId;
  /** Button/toast label, pt-BR. */
  label: string;
  /** What the model reads when picking a command. */
  description: string;
  /**
   * True when the command puts something modal on screen. The assistant panel
   * steps out of the way first, otherwise the dialog opens behind it.
   */
  opensOverlay: boolean;
  /** Confirmation shown once the command ran. */
  doneLabel: string;
  roles?: AppRole[];
}

export const UI_COMMANDS: Record<UiCommandId, UiCommandMeta> = {
  focus_mode: {
    id: "focus_mode",
    label: "Abrir o Modo Foco",
    description:
      "Abre o Modo Foco (tela imersiva com Pomodoro e som ambiente) sem iniciar o ciclo.",
    opensOverlay: true,
    doneLabel: "Modo Foco aberto",
  },
  focus_mode_start: {
    id: "focus_mode_start",
    label: "Iniciar sessão de foco",
    description:
      "Abre o Modo Foco e já inicia um ciclo Pomodoro de concentração.",
    opensOverlay: true,
    doneLabel: "Sessão de foco iniciada",
  },
  focus_mode_exit: {
    id: "focus_mode_exit",
    label: "Sair do Modo Foco",
    description:
      "Fecha a tela do Modo Foco, preservando a sessão em andamento.",
    opensOverlay: false,
    doneLabel: "Modo Foco fechado",
  },
  quick_entry: {
    id: "quick_entry",
    label: "Abrir lançamento rápido",
    description:
      "Abre o formulário de lançamento rápido de horas, opcionalmente pré-preenchido com projeto, data, duração e descrição.",
    opensOverlay: true,
    doneLabel: "Formulário aberto",
  },
  quick_timer: {
    id: "quick_timer",
    label: "Abrir início de cronômetro",
    description:
      "Abre o diálogo de início de cronômetro para o usuário escolher projeto e descrição.",
    opensOverlay: true,
    doneLabel: "Diálogo aberto",
  },
  command_palette: {
    id: "command_palette",
    label: "Abrir a paleta de comandos",
    description:
      "Abre a paleta de comandos global (busca de páginas e ações rápidas).",
    opensOverlay: true,
    doneLabel: "Paleta aberta",
  },
  weekly_digest: {
    id: "weekly_digest",
    label: "Abrir o resumo semanal",
    description:
      "Abre o resumo semanal gerado por IA, com destaques e recomendações da semana.",
    opensOverlay: true,
    doneLabel: "Resumo semanal aberto",
  },
  shortcuts: {
    id: "shortcuts",
    label: "Ver atalhos de teclado",
    description: "Abre a lista completa de atalhos de teclado do sistema.",
    opensOverlay: true,
    doneLabel: "Atalhos abertos",
  },
  theme_dark: {
    id: "theme_dark",
    label: "Ativar o tema escuro",
    description: "Muda a interface para o tema escuro.",
    opensOverlay: false,
    doneLabel: "Tema escuro ativado",
  },
  theme_light: {
    id: "theme_light",
    label: "Ativar o tema claro",
    description: "Muda a interface para o tema claro.",
    opensOverlay: false,
    doneLabel: "Tema claro ativado",
  },
  theme_toggle: {
    id: "theme_toggle",
    label: "Alternar o tema",
    description:
      "Alterna entre tema claro e escuro. Use quando o usuário não disser qual quer.",
    opensOverlay: false,
    doneLabel: "Tema alternado",
  },
  sidebar_toggle: {
    id: "sidebar_toggle",
    label: "Recolher/expandir o menu lateral",
    description: "Recolhe ou expande a barra lateral de navegação.",
    opensOverlay: false,
    doneLabel: "Menu lateral atualizado",
  },
};

export const UI_COMMAND_LIST: UiCommandMeta[] = Object.values(UI_COMMANDS);

export function isUiCommandId(value: string): value is UiCommandId {
  return Object.hasOwn(UI_COMMANDS, value);
}

/** Commands the role may run. */
export function getUiCommandsForRole(role: AppRole): UiCommandMeta[] {
  return UI_COMMAND_LIST.filter(
    (meta) => !meta.roles || meta.roles.includes(role),
  );
}
