/**
 * The paragraph the Meu Tempo assistant opens with.
 *
 * The model never sees raw data — it receives a pre-formatted fact sheet built
 * from the same numbers the page renders and is told, in the system prompt,
 * that inventing anything outside it is forbidden. When no provider is
 * configured, or every provider fails or derails, the deterministic writer
 * takes over: the assistant is never blocked on the AI being available.
 */

import { completeText } from "@/lib/ai/completion";
import { WEEKDAY_LABELS } from "@/lib/collaboration/period";
import { formatDuration } from "@/lib/utils";
import type {
  CollaborationPeriod,
  DeliveryCounts,
  PeriodInsight,
  PeriodNarrative,
} from "@/types/collaboration";

const SYSTEM_PROMPT = `Você é o assistente de tempo do **OptSolv Time Tracker**. Escreve uma abertura curta para a própria pessoa sobre onde o tempo dela foi no período.

Regras absolutas:
- NUNCA inclua raciocínio, pensamento, scratchpad ou frases como "Here's a thinking process". Comece IMEDIATAMENTE pela primeira frase.
- Use **somente** os números da ficha recebida. Nunca invente, projete, estime ou arredonde diferente.
- Português do Brasil, segunda pessoa (você). **No máximo 2 frases, num único parágrafo.** É uma abertura, não um relatório — os detalhes já estão na tela ao lado.
- Diga para onde o tempo foi. Só mencione um ponto de atenção se ele for o fato mais relevante do período.
- Tom de colega competente: direto, sem "Olá", sem "Espero que esteja bem", sem emojis, sem Markdown, sem bullets, sem títulos.
- **Nunca cobre horas.** Não diga que faltam horas, que a meta não foi batida nem que a pessoa deveria trabalhar mais. Registrar é responsabilidade dela, não uma dívida com você.
- Se o período teve pouca atividade, diga isso em uma frase e não invente motivos.`;

/** Shorter than this is not a summary; longer is the model ignoring the brief. */
const MIN_NARRATIVE_LENGTH = 50;
/** Two sentences. Past this the model wrote a report instead of an opening. */
const MAX_NARRATIVE_LENGTH = 420;
/** Tight enough to cut a rambling model off mid-report. */
const NARRATIVE_MAX_TOKENS = 180;

function sanitize(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function isUsable(text: string): boolean {
  return (
    text.length >= MIN_NARRATIVE_LENGTH && text.length <= MAX_NARRATIVE_LENGTH
  );
}

export interface BuildPeriodNarrativeInput {
  period: CollaborationPeriod;
  insights: PeriodInsight[];
  delivery?: DeliveryCounts | null;
}

/**
 * The fact sheet handed to the model.
 *
 * Exported because the verify script asserts that it never leaks a number the
 * page does not also show — that is the whole guarantee behind letting a model
 * near this data.
 */
export function buildFactSheet({
  period,
  insights,
  delivery,
}: BuildPeriodNarrativeInput): string {
  const { totals, shape, ledger, rituals, collaborators, allocations } = period;
  const lines: string[] = [];

  lines.push(`Período: ${period.label}`);
  const recordedCalls = period.calls ?? [];
  if (recordedCalls.length > 0) {
    lines.push(
      `Participação registrada em chamadas do Teams fora dos intervalos da agenda: ${formatDuration(recordedCalls.reduce((sum, call) => sum + call.minutes, 0))}. Não equivale a horas já lançadas nem comprova trabalho em um projeto.`,
    );
  }
  lines.push(
    `Horas registradas: ${formatDuration(totals.loggedMinutes)} de uma meta de ${formatDuration(totals.targetMinutes)}`,
  );
  lines.push(
    `Reuniões realizadas: ${ledger.attended.count} (${formatDuration(ledger.attended.minutes)})`,
  );

  if (ledger.cancelled.count > 0) {
    lines.push(`Reuniões canceladas: ${ledger.cancelled.count}`);
  }
  if (ledger.rescheduled.count > 0) {
    lines.push(`Reuniões remarcadas: ${ledger.rescheduled.count}`);
  }
  if (ledger.declined.count > 0) {
    lines.push(`Convites recusados: ${ledger.declined.count}`);
  }
  if (ledger.overlapped.count > 0) {
    lines.push(`Reuniões sobrepostas: ${ledger.overlapped.count}`);
  }

  lines.push(`Carga de reuniões no expediente: ${shape.meetingLoadPercent}%`);
  lines.push(`Reuniões emendadas sem intervalo: ${shape.backToBackCount}`);

  const loggedFromMeetings = Math.min(
    totals.loggedMeetingMinutes,
    totals.loggedMinutes,
  );
  const executionMinutes = Math.max(
    0,
    totals.loggedMinutes - loggedFromMeetings,
  );
  lines.push(
    `Trabalho registrado em projetos fora de reuniões: ${formatDuration(executionMinutes)}`,
  );

  if (shape.afterHoursMinutes > 0) {
    lines.push(
      `Reuniões fora do horário de trabalho: ${formatDuration(shape.afterHoursMinutes)}`,
    );
  }
  if (shape.heaviestWeekday !== null) {
    lines.push(
      `Dia da semana mais pesado: ${WEEKDAY_LABELS[shape.heaviestWeekday] ?? "—"}`,
    );
  }

  if (totals.focusMinutes > 0 || totals.collaborationMinutes > 0) {
    lines.push(
      `Microsoft 365 no período: ${formatDuration(totals.collaborationMinutes)} ocupados entre reuniões, chamadas, chat e e-mail, e ${formatDuration(totals.focusMinutes)} de espaço livre na agenda em blocos de 2h ou mais (disponibilidade, não trabalho medido)`,
    );
  }

  const topProjects = allocations.slice(0, 3);
  if (topProjects.length > 0) {
    lines.push(
      `Projetos com mais horas apontadas: ${topProjects
        .map((item) => `${item.name} (${formatDuration(item.minutes)})`)
        .join(", ")}`,
    );
  }

  const topRituals = rituals.slice(0, 3);
  if (topRituals.length > 0) {
    lines.push(
      `Reuniões recorrentes mais caras: ${topRituals
        .map(
          (item) =>
            `${item.title} — ${item.occurrences}x, ${formatDuration(item.minutes)}`,
        )
        .join("; ")}`,
    );
  }

  const topPeople = collaborators.slice(0, 3);
  if (topPeople.length > 0) {
    lines.push(
      `Pessoas com mais tempo compartilhado: ${topPeople
        .map((item) => `${item.name} (${formatDuration(item.minutes)})`)
        .join(", ")}`,
    );
  }

  if (
    delivery &&
    delivery.pullRequests + delivery.commits + delivery.workItems > 0
  ) {
    lines.push(
      `Azure DevOps no período: ${delivery.pullRequests} pull request(s) concluído(s), ${delivery.commits} commit(s), ${delivery.workItems} work item(s) movimentado(s)`,
    );
  }

  if (insights.length > 0) {
    lines.push("");
    lines.push("Achados já calculados (pode reescrever, nunca contradizer):");
    for (const insight of insights) {
      lines.push(`- ${insight.title}: ${insight.description}`);
    }
  }

  return lines.join("\n");
}

/** The writer used when no provider answers — plain, correct, never absent. */
export function buildDeterministicNarrative({
  period,
  insights,
}: BuildPeriodNarrativeInput): string {
  const { totals, ledger } = period;
  const recordedCalls = period.calls ?? [];
  const callMinutes = recordedCalls.reduce(
    (sum, call) => sum + call.minutes,
    0,
  );

  if (
    ledger.attended.count === 0 &&
    totals.loggedMinutes === 0 &&
    callMinutes === 0
  ) {
    return `Não encontramos reuniões nem horas registradas em ${period.label}. Se você trabalhou nesse período, vale conferir se a conta Microsoft está conectada e lançar as horas na tela de registro.`;
  }

  let first: string;
  if (ledger.attended.count > 0 && callMinutes > 0) {
    first = `Em ${period.label} você participou de ${ledger.attended.count} reunião(ões) (${formatDuration(ledger.attended.minutes)}) e ${recordedCalls.length} chamada(s) Teams (${formatDuration(callMinutes)}), e registrou ${formatDuration(totals.loggedMinutes)}.`;
  } else if (ledger.attended.count > 0) {
    first = `Em ${period.label} você participou de ${ledger.attended.count} reunião(ões), somando ${formatDuration(ledger.attended.minutes)}, e registrou ${formatDuration(totals.loggedMinutes)}.`;
  } else if (callMinutes > 0) {
    first = `Em ${period.label} você participou de ${recordedCalls.length} chamada(s) Teams (${formatDuration(callMinutes)}) e registrou ${formatDuration(totals.loggedMinutes)}.`;
  } else {
    first = `Em ${period.label} você registrou ${formatDuration(totals.loggedMinutes)}, sem reuniões detectadas na agenda.`;
  }

  // Only an action or a routine-health finding earns the second sentence:
  // the opening never turns into a reminder that hours are missing.
  const notable = insights.find(
    (insight) => insight.tone === "action" || insight.tone === "attention",
  );

  return notable ? `${first} ${notable.title}.` : first;
}

/**
 * Returns the narrative, preferring a provider and falling back locally.
 * Never throws and never returns an empty string.
 */
export async function buildPeriodNarrative(
  input: BuildPeriodNarrativeInput,
): Promise<PeriodNarrative> {
  const fallback = buildDeterministicNarrative(input);

  const result = await completeText({
    system: SYSTEM_PROMPT,
    prompt: `Ficha de dados (use apenas estes números):\n${buildFactSheet(input)}`,
    maxTokens: NARRATIVE_MAX_TOKENS,
    // Factual phrasing, not creative writing.
    temperature: 0.2,
    // Checked inside the provider loop so a derailed model is skipped and the
    // next one still gets a turn, instead of dropping straight to the fallback.
    validate: (candidate) => isUsable(sanitize(candidate)),
  });

  if (result) {
    const text = sanitize(result.text);
    if (isUsable(text)) return { text, source: "ai" };

    console.warn(
      `[collaboration-narrative] resposta de ${result.provider} rejeitada; usando texto determinístico`,
    );
  }

  return { text: fallback, source: "deterministic" };
}
