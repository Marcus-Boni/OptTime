/**
 * Turns each integration's outcome into something the page can act on.
 *
 * Meu Tempo reads five sources and every one of them can be absent for a
 * reason the person can fix: a session created before the admin consent, an
 * account without a Viva licence, an Azure DevOps token nobody configured.
 *
 * The first version reported these as free-text warnings in an 11px list at
 * the very bottom of the page — under a full screen of zeros, which is exactly
 * where someone who cannot see their data will never look. These statuses
 * carry the reason *and* the button that fixes it, so the UI can put both at
 * the top.
 *
 * Pure: every input is passed in, so the verify script drives the same
 * function the page renders.
 */

import type {
  MailboxAvailability,
  PortraitAvailability,
  SourceStatus,
} from "@/types/collaboration";

/** How the calendar read ended, resolved by the caller from the Graph error. */
export type CalendarOutcome = "ok" | "no_token" | "auth_failed" | "unavailable";

export function buildCalendarStatus(outcome: CalendarOutcome): SourceStatus {
  const base = { id: "calendar" as const, label: "Agenda do Outlook" };

  switch (outcome) {
    case "ok":
      return { ...base, health: "ok", detail: "", action: null };
    case "no_token":
      return {
        ...base,
        health: "not_connected",
        detail:
          "Sua conta Microsoft não está conectada, então não conseguimos ver nenhuma reunião. Entrar novamente resolve.",
        action: "reauth",
      };
    case "auth_failed":
      return {
        ...base,
        health: "needs_reauth",
        detail:
          "Sua sessão é anterior à liberação da permissão de agenda. Saia e entre novamente — costuma levar um clique, sem digitar senha.",
        action: "reauth",
      };
    default:
      return {
        ...base,
        health: "unavailable",
        detail:
          "O Outlook não respondeu agora. Os números de agenda desta tela ficam de fora até a próxima tentativa.",
        action: null,
      };
  }
}

export function buildPortraitStatus(
  availability: PortraitAvailability | null,
): SourceStatus {
  const base = { id: "portrait" as const, label: "Microsoft 365 (Viva)" };

  switch (availability) {
    case "ok":
    case null:
      return { ...base, health: "ok", detail: "", action: null };
    case "missing_scope":
      return {
        ...base,
        health: "needs_reauth",
        detail:
          "Saia e entre novamente para liberar a leitura do seu resumo de atividade.",
        action: "reauth",
      };
    case "unlicensed":
      return {
        ...base,
        health: "unlicensed",
        detail:
          "Sua conta não tem o Viva Insights habilitado. O resto da tela funciona normalmente — só o bloco de reuniões, chamadas e conversas fica de fora.",
        action: null,
      };
    case "no_token":
      return {
        ...base,
        health: "not_connected",
        detail: "Reconecte sua conta Microsoft para ver o resumo de atividade.",
        action: "reauth",
      };
    default:
      return {
        ...base,
        health: "unavailable",
        detail:
          "O Viva Insights não respondeu agora. Ele é calculado de madrugada, então o dia de hoje costuma vir vazio mesmo.",
        action: null,
      };
  }
}

export function buildMailboxStatus(
  availability: MailboxAvailability | null,
): SourceStatus {
  const base = { id: "mailbox" as const, label: "Horário de trabalho" };

  switch (availability) {
    case "ok":
    case null:
      return { ...base, health: "ok", detail: "", action: null };
    case "missing_scope":
      return {
        ...base,
        health: "needs_reauth",
        detail:
          "Sem acesso ao seu horário do Outlook, consideramos um expediente das 9h às 18h. Entrar novamente corrige.",
        action: "reauth",
      };
    case "no_token":
      return {
        ...base,
        health: "not_connected",
        detail:
          "Reconecte sua conta Microsoft para usarmos o seu horário de trabalho real.",
        action: "reauth",
      };
    default:
      return {
        ...base,
        health: "unavailable",
        detail:
          "Não conseguimos ler o seu horário do Outlook agora. Assumimos um expediente das 9h às 18h neste período.",
        action: null,
      };
  }
}

/** How the Azure DevOps sweep ended. */
export type AzureDevOpsOutcome =
  | "ok"
  | "not_configured"
  | "bad_token"
  | "no_projects"
  | "unavailable";

export function buildAzureDevOpsStatus(
  outcome: AzureDevOpsOutcome,
): SourceStatus {
  const base = { id: "azure_devops" as const, label: "Azure DevOps" };

  switch (outcome) {
    case "ok":
      return { ...base, health: "ok", detail: "", action: null };
    case "not_configured":
      return {
        ...base,
        health: "not_connected",
        detail:
          "Sem a integração, a linha do tempo mostra só as suas reuniões. Quem não usa o Azure DevOps pode ignorar isto — o resto da tela não depende dele.",
        action: "connect_azure_devops",
      };
    case "bad_token":
      return {
        ...base,
        health: "needs_reauth",
        detail:
          "Não foi possível ler o seu token do Azure DevOps. Reconfigure a integração para voltar a ver pull requests e commits.",
        action: "connect_azure_devops",
      };
    case "no_projects":
      return {
        ...base,
        health: "not_connected",
        detail:
          "Nenhum projeto ativo vinculado ao Azure DevOps, então não há o que buscar.",
        action: null,
      };
    default:
      return {
        ...base,
        health: "unavailable",
        detail:
          "O Azure DevOps não respondeu agora. Suas reuniões continuam na linha do tempo.",
        action: null,
      };
  }
}

/** The ones worth showing. An `ok` source is not news. */
export function issuesOf(statuses: SourceStatus[]): SourceStatus[] {
  return statuses.filter((status) => status.health !== "ok");
}

/** True when signing in again would fix at least one of them. */
export function needsReauth(statuses: SourceStatus[]): boolean {
  return statuses.some((status) => status.action === "reauth");
}
