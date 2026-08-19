import type { AppRole } from "@/lib/access-control";
import type { AssistantSnapshot } from "@/lib/ai/context";

/**
 * Contextual prompt chips. Generated deterministically from live state so the
 * suggestions always reflect what the user actually needs to do next.
 */
export function buildOpeningSuggestions(
  snapshot: AssistantSnapshot,
  role: AppRole,
  activePath?: string,
): string[] {
  const suggestions: string[] = [];

  if (snapshot.timer.running) {
    suggestions.push("Parar meu timer e registrar as horas");
  }

  if (snapshot.previousWeekStatus === "rejected") {
    suggestions.push("Por que meu timesheet foi rejeitado?");
  } else if (
    snapshot.previousWeekStatus === "open" &&
    snapshot.previousWeekMinutes > 0
  ) {
    suggestions.push("Submeter o timesheet da semana passada");
  }

  if (snapshot.incompleteDays.length > 0) {
    const first = snapshot.incompleteDays[0];
    suggestions.push(`Quais dias estão incompletos nesta semana?`);
    if (first && snapshot.todayMinutes === 0) {
      suggestions.push("Trabalhei 3h hoje ajustando bugs");
    }
  }

  if (role !== "member" && snapshot.pendingApprovals > 0) {
    suggestions.push("O que preciso aprovar?");
    suggestions.push("Me leva para as aprovações");
  }

  if (activePath?.includes("/reports")) {
    suggestions.push("Compare minhas horas com o mês passado");
  }

  if (activePath?.includes("/projects")) {
    suggestions.push("Como minhas horas se distribuem por projeto?");
  }

  // The last two teach the interface commands, which nobody discovers on
  // their own from a chat box.
  const defaults = [
    "Quantas horas eu fiz nesta semana?",
    "Trabalhei 2h30 no projeto ajustando a task #102",
    "Meu timesheet está pronto para enviar?",
    "Abrir o registro de horas",
    "Quero focar: abre o Modo Foco",
  ];

  for (const suggestion of defaults) {
    if (suggestions.length >= 4) break;
    if (!suggestions.includes(suggestion)) suggestions.push(suggestion);
  }

  return suggestions.slice(0, 4);
}

/** Follow-ups shown after an answer, biased away from what was just asked. */
export function buildFollowUpSuggestions(
  snapshot: AssistantSnapshot,
  role: AppRole,
  usedTools: Set<string>,
): string[] {
  const suggestions: string[] = [];

  if (usedTools.has("prepare_time_entry")) {
    suggestions.push("Como ficou minha semana agora?");
    suggestions.push("Meu timesheet já pode ser enviado?");
  }

  if (usedTools.has("get_work_summary")) {
    suggestions.push("Compare com a semana passada");
    suggestions.push("Quais dias ficaram abaixo da meta?");
  }

  if (usedTools.has("get_timesheet_status") && snapshot.weekStatus === "open") {
    suggestions.push("Submeter minha semana");
  }

  if (usedTools.has("get_pending_approvals") && role !== "member") {
    suggestions.push("Me leva para as aprovações");
    suggestions.push("Como está a carga da equipe nesta semana?");
  }

  if (usedTools.has("get_project_budget")) {
    suggestions.push("Abrir a tela desse projeto");
  }

  if (usedTools.has("list_projects")) {
    suggestions.push("Abrir Projetos");
  }

  // Right after a navigation the useful follow-up is what to do on arrival.
  if (usedTools.has("navigate_to")) {
    suggestions.push("Quero focar: abre o Modo Foco");
  }

  const defaults = [
    "Quantas horas eu fiz nesta semana?",
    "Mostre meus lançamentos recentes",
    "Quais são meus projetos ativos?",
  ];

  for (const suggestion of defaults) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(suggestion)) suggestions.push(suggestion);
  }

  return suggestions.slice(0, 3);
}
