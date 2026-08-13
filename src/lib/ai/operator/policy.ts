/**
 * AI Operator — action catalogue and permission resolution.
 *
 * Two independent gates decide whether an action runs without a click:
 *
 *  1. Hard limits encoded in `OPERATOR_ACTIONS` — anything that reaches other
 *     people (e-mails, approvals) or destroys data always needs a click, no
 *     matter what the user configured. This is not user-overridable on purpose.
 *  2. The user's own mode plus per-action overrides.
 */

import type { AppRole } from "@/lib/access-control";
import type { ConfirmableActionKind } from "@/lib/ai/types";
import {
  DEFAULT_OPERATOR_SETTINGS,
  type OperatorActionMeta,
  type OperatorMode,
  type OperatorPermission,
  type OperatorSettings,
} from "./types";

export const OPERATOR_ACTIONS: Record<
  ConfirmableActionKind,
  OperatorActionMeta
> = {
  create_time_entry: {
    kind: "create_time_entry",
    label: "Registrar horas",
    description: "Cria um lançamento de horas no seu nome.",
    risk: "low",
    reversible: true,
    outward: false,
  },
  update_time_entry: {
    kind: "update_time_entry",
    label: "Editar lançamento",
    description: "Altera duração, descrição ou faturamento de um lançamento.",
    // Overwrites data we do not snapshot, so it stays out of "smart" mode.
    risk: "medium",
    reversible: false,
    outward: false,
  },
  delete_time_entry: {
    kind: "delete_time_entry",
    label: "Excluir lançamento",
    description: "Remove um lançamento de horas.",
    risk: "high",
    reversible: true,
    outward: false,
  },
  start_timer: {
    kind: "start_timer",
    label: "Iniciar cronômetro",
    description: "Começa a contar tempo em um projeto.",
    risk: "low",
    reversible: false,
    outward: false,
  },
  stop_timer: {
    kind: "stop_timer",
    label: "Parar cronômetro",
    description: "Encerra o cronômetro e registra as horas acumuladas.",
    risk: "low",
    // Undo removes the entry it created (the timer itself is already closed).
    reversible: true,
    outward: false,
  },
  pause_timer: {
    kind: "pause_timer",
    label: "Pausar cronômetro",
    description: "Pausa a contagem sem encerrar o cronômetro.",
    risk: "low",
    reversible: false,
    outward: false,
  },
  resume_timer: {
    kind: "resume_timer",
    label: "Retomar cronômetro",
    description: "Retoma um cronômetro pausado.",
    risk: "low",
    reversible: false,
    outward: false,
  },
  submit_timesheet: {
    kind: "submit_timesheet",
    label: "Submeter timesheet",
    description:
      "Envia a semana para aprovação do gestor e bloqueia os lançamentos.",
    risk: "medium",
    reversible: false,
    outward: true,
  },
  approve_timesheet: {
    kind: "approve_timesheet",
    label: "Aprovar timesheet",
    description: "Aprova o timesheet de um colaborador.",
    risk: "high",
    reversible: false,
    outward: true,
    roles: ["manager", "admin"],
  },
  reject_timesheet: {
    kind: "reject_timesheet",
    label: "Rejeitar timesheet",
    description: "Rejeita o timesheet de um colaborador com um motivo.",
    risk: "high",
    reversible: false,
    outward: true,
    roles: ["manager", "admin"],
  },
  export_report: {
    kind: "export_report",
    label: "Gerar relatório",
    description: "Gera e baixa um relatório em PDF ou Excel.",
    risk: "low",
    // Nothing to undo: it only reads data and produces a file.
    reversible: false,
    outward: false,
  },
  notify_team: {
    kind: "notify_team",
    label: "Notificar equipe",
    description: "Envia um e-mail para pessoas do time.",
    risk: "high",
    reversible: false,
    outward: true,
    roles: ["manager", "admin"],
  },
};

export const OPERATOR_ACTION_LIST: OperatorActionMeta[] =
  Object.values(OPERATOR_ACTIONS);

/**
 * Hard ceiling, not user-overridable: anything that leaves the app (e-mails,
 * approvals, submissions) or destroys data always requires a click. Only
 * low/medium-risk, self-contained actions may ever be delegated.
 */
export function canEverAutoRun(kind: ConfirmableActionKind): boolean {
  const meta = OPERATOR_ACTIONS[kind];
  if (!meta) return false;
  return !meta.outward && meta.risk !== "high";
}

/** Actions the role is allowed to perform at all. */
export function isActionAllowedForRole(
  kind: ConfirmableActionKind,
  role: AppRole,
): boolean {
  const meta = OPERATOR_ACTIONS[kind];
  if (!meta) return false;
  return !meta.roles || meta.roles.includes(role);
}

function modeDefault(
  kind: ConfirmableActionKind,
  mode: OperatorMode,
): OperatorPermission {
  if (mode === "always_ask") return "ask";
  if (!canEverAutoRun(kind)) return "ask";

  const meta = OPERATOR_ACTIONS[kind];
  if (mode === "autopilot") return "auto";

  // "smart": delegate only the low-risk, reversible everyday actions.
  return meta.risk === "low" ? "auto" : "ask";
}

/**
 * Final verdict for one action. `never` means the assistant must not even
 * propose it; `auto` means it may run the moment the user sends the command.
 */
export function resolvePermission(
  kind: ConfirmableActionKind,
  settings: OperatorSettings,
  role: AppRole,
): OperatorPermission {
  if (!isActionAllowedForRole(kind, role)) return "never";

  const override = settings.overrides?.[kind];
  if (override === "never") return "never";
  if (override === "ask") return "ask";
  if (override === "auto") return canEverAutoRun(kind) ? "auto" : "ask";

  return modeDefault(kind, settings.mode);
}

/** Kinds the user switched off entirely — filtered out of the tool registry. */
export function getDisabledKinds(
  settings: OperatorSettings,
  role: AppRole,
): ConfirmableActionKind[] {
  return OPERATOR_ACTION_LIST.filter(
    (meta) => resolvePermission(meta.kind, settings, role) === "never",
  ).map((meta) => meta.kind);
}

// ─── Persistence helpers ─────────────────────────────────────────────

export function isOperatorMode(value: unknown): value is OperatorMode {
  return value === "always_ask" || value === "smart" || value === "autopilot";
}

function isPermission(value: unknown): value is OperatorPermission {
  return value === "ask" || value === "auto" || value === "never";
}

function isActionKind(value: string): value is ConfirmableActionKind {
  return Object.hasOwn(OPERATOR_ACTIONS, value);
}

/** Parses the JSON override map stored on `user.operatorPolicies`. */
export function parseOverrides(
  raw: string | null | undefined,
): Partial<Record<ConfirmableActionKind, OperatorPermission>> {
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result: Partial<Record<ConfirmableActionKind, OperatorPermission>> =
      {};

    for (const [key, value] of Object.entries(parsed)) {
      if (isActionKind(key) && isPermission(value)) {
        result[key] = value;
      }
    }

    return result;
  } catch {
    return {};
  }
}

/** Builds settings from the raw user row, falling back to safe defaults. */
export function toOperatorSettings(row: {
  operatorMode?: string | null;
  operatorPolicies?: string | null;
  operatorVoiceEnabled?: boolean | null;
  operatorVoiceLocale?: string | null;
  operatorSpeakReplies?: boolean | null;
}): OperatorSettings {
  return {
    mode: isOperatorMode(row.operatorMode)
      ? row.operatorMode
      : DEFAULT_OPERATOR_SETTINGS.mode,
    overrides: parseOverrides(row.operatorPolicies),
    voiceEnabled:
      row.operatorVoiceEnabled ?? DEFAULT_OPERATOR_SETTINGS.voiceEnabled,
    voiceLocale:
      row.operatorVoiceLocale ?? DEFAULT_OPERATOR_SETTINGS.voiceLocale,
    speakReplies:
      row.operatorSpeakReplies ?? DEFAULT_OPERATOR_SETTINGS.speakReplies,
  };
}

export const OPERATOR_MODE_META: Record<
  OperatorMode,
  { label: string; description: string }
> = {
  always_ask: {
    label: "Sempre confirmar",
    description:
      "Cada ação aparece como um cartão e só acontece depois do seu clique.",
  },
  smart: {
    label: "Inteligente",
    description:
      "Ações simples e reversíveis (lançar horas, cronômetro, relatórios) acontecem na hora. O resto pede confirmação.",
  },
  autopilot: {
    label: "Piloto automático",
    description:
      "Tudo que pode ser delegado acontece direto. E-mails, aprovações e exclusões continuam pedindo confirmação.",
  },
};
