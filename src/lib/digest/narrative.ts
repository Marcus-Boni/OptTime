/**
 * Natural-language summary of a weekly digest.
 *
 * The model only ever *phrases* numbers that were already computed: the prompt
 * carries a pre-formatted fact sheet and forbids inventing anything else. When
 * no provider is configured (or all of them fail) the deterministic writer takes
 * over, so the digest is never blocked on the AI.
 */

import { completeText } from "@/lib/ai/completion";
import { formatDuration } from "@/lib/utils";
import { formatDigestPeriodRange } from "./presenter";
import type {
  Digest,
  DigestNarrative,
  ManagerDigest,
  MemberDigest,
} from "./types";

const SYSTEM_PROMPT = `Você escreve o resumo semanal executivo do **OptSolv Time Tracker**, o sistema de apontamento de horas da OptSolv.

Regras absolutas:
- NUNCA inclua raciocínio, pensamento, scratchpad, notas de análise, metadados ou frases como "Here's a thinking process:". Comece a resposta IMEDIATAMENTE com o primeiro parágrafo do resumo.
- Use **somente** os números da ficha de dados recebida. Nunca invente, arredonde de forma diferente, projete ou estime nada.
- Escreva em português do Brasil: no máximo 2 parágrafos, de 2 a 3 frases curtas cada.
- NUNCA numere palavras, frases ou parágrafos. Não escreva contadores como "(1)", "(2)" nem marcadores como "1)" no meio do texto. Se precisar se controlar no tamanho, apenas escreva menos frases.
- Tom profissional e direto, como um colega competente — sem "Olá!", sem "Espero que esteja bem", sem emojis.
- Destaque o que importa: onde o tempo foi, o que mudou em relação à semana anterior e o único ponto de atenção mais relevante (se houver).
- Não repita a ficha inteira em formato de lista. Escreva prosa fluida.
- Não use Markdown, títulos nem bullets.
- Se a semana não teve horas registradas, diga isso em uma frase e não invente motivos.`;

/**
 * A bare parenthesised integer, e.g. "(41)". Values carrying a unit or sign
 * ("(29h)", "(31%)", "(+12%)") deliberately do not match.
 */
const INLINE_COUNTER_PATTERN = /\s*\((\d{1,3})\)\s*/g;

/** Shorter than this is not a summary; longer is the model ignoring the brief. */
const MIN_NARRATIVE_LENGTH = 60;
const MAX_NARRATIVE_LENGTH = 1500;
/** Enough for two short paragraphs, tight enough to cut a rambling model off. */
const NARRATIVE_MAX_TOKENS = 450;

function formatDelta(digest: MemberDigest): string {
  if (digest.previousTotalMinutes === 0) {
    return "sem base de comparação (semana anterior sem registros)";
  }

  const direction = digest.deltaMinutes >= 0 ? "a mais" : "a menos";
  const magnitude = formatDuration(Math.abs(digest.deltaMinutes));
  const percent =
    digest.deltaPercentage !== null
      ? ` (${digest.deltaPercentage > 0 ? "+" : ""}${digest.deltaPercentage}%)`
      : "";

  return `${magnitude} ${direction} que a semana anterior${percent}`;
}

/** Compact fact sheet: everything the model is allowed to talk about. */
function buildMemberFacts(digest: MemberDigest): string {
  const periodDateRange = formatDigestPeriodRange(
    digest.period.from,
    digest.period.to,
  );

  const lines = [
    `Colaborador: ${digest.userName}`,
    `Semana: ${digest.period.label} (${periodDateRange})`,
    `Total registrado: ${formatDuration(digest.totalMinutes)} de uma meta de ${formatDuration(digest.targetMinutes)}`,
    `Comparativo: ${formatDelta(digest)}`,
    `Lançamentos: ${digest.entryCount}`,
    `Faturável: ${formatDuration(digest.billableMinutes)}`,
  ];

  if (digest.categories.length > 0) {
    lines.push(
      `Distribuição por tipo de trabalho (estimada por palavras-chave): ${digest.categories
        .map(
          (item) =>
            `${item.label} ${item.percentage}% (${formatDuration(item.minutes)})`,
        )
        .join(", ")}`,
    );
  }

  if (digest.projects.length > 0) {
    lines.push(
      `Projetos: ${digest.projects
        .slice(0, 5)
        .map(
          (item) =>
            `${item.name} ${item.percentage}% (${formatDuration(item.minutes)})`,
        )
        .join(", ")}`,
    );
  }

  if (digest.mostProductiveDay) {
    lines.push(
      `Dia mais produtivo: ${digest.mostProductiveDay.weekday} (${formatDuration(digest.mostProductiveDay.minutes)})`,
    );
  }

  lines.push(
    `Dias úteis abaixo de 6h: ${digest.incompleteDays}`,
    `Status do timesheet da semana: ${digest.timesheetStatus}`,
  );

  return lines.join("\n");
}

function buildManagerFacts(digest: ManagerDigest): string {
  const periodDateRange = formatDigestPeriodRange(
    digest.period.from,
    digest.period.to,
  );

  const lines = [
    `Gestor: ${digest.userName}`,
    `Semana: ${digest.period.label} (${periodDateRange})`,
    `Equipe: ${digest.memberCount} pessoa(s), ${digest.activeMemberCount} com horas registradas`,
    `Total da equipe: ${formatDuration(digest.teamTotalMinutes)} de uma capacidade de ${formatDuration(digest.teamTargetMinutes)}`,
    `Timesheets: ${digest.approvals.approved} aprovado(s), ${digest.approvals.submitted} aguardando aprovação, ${digest.approvals.rejected} rejeitado(s), ${digest.approvals.notSubmitted} não submetido(s)`,
  ];

  if (digest.projects.length > 0) {
    lines.push(
      `Projetos: ${digest.projects
        .slice(0, 5)
        .map(
          (item) =>
            `${item.name} ${item.percentage}% (${formatDuration(item.minutes)})`,
        )
        .join(", ")}`,
    );
  }

  if (digest.underloaded.length > 0) {
    lines.push(
      `Abaixo de 60% da meta: ${digest.underloaded
        .map((member) => `${member.name} (${formatDuration(member.minutes)})`)
        .join(", ")}`,
    );
  }

  if (digest.overloaded.length > 0) {
    lines.push(
      `Acima de 110% da meta: ${digest.overloaded
        .map((member) => `${member.name} (${formatDuration(member.minutes)})`)
        .join(", ")}`,
    );
  }

  return lines.join("\n");
}

/**
 * Strips reasoning tokens, chain-of-thought blocks, or prompt leaks (such as
 * "<think>...</think>" or "Here's a thinking process: ...") from model outputs.
 */
export function sanitizeNarrativeText(raw: string): string {
  if (!raw) return "";

  let cleaned = raw;

  // 1. Strip <think>...</think> tags (including unclosed <think>... if truncated)
  cleaned = cleaned.replace(/<think>[\s\S]*?<\/think>/gi, "");
  cleaned = cleaned.replace(/<think>[\s\S]*/gi, "");

  // 2. Strip "Here's a thinking process: ...", "Thinking Process: ...", "Thought Process: ..."
  if (
    /^(?:Here['’]?s a thinking process|Thinking [Pp]rocess|Thought [Pp]rocess|Racioc[ií]nio):/i.test(
      cleaned.trim(),
    )
  ) {
    const finalMatch = cleaned.match(
      /(?:Final Response|Resposta Final|Summary|Resumo):\s*([\s\S]+)$/i,
    );
    if (finalMatch?.[1]?.trim()) {
      cleaned = finalMatch[1].trim();
    } else {
      const paragraphs = cleaned.split(/\n{2,}/);
      const proseParagraphs = paragraphs.filter((p) => {
        const trimmed = p.trim();
        if (
          /^(?:Here['’]?s a thinking process|Thinking [Pp]rocess|Thought [Pp]rocess|Racioc[ií]nio):/i.test(
            trimmed,
          )
        ) {
          return false;
        }
        if (
          /^\d+\.\s+\*\*(?:Analyze|Extract|Draft|Review|Check|Process|Identify|Determine)/i.test(
            trimmed,
          )
        ) {
          return false;
        }
        if (
          /^\*\*(?:Step|Thinking|Plan|Objective|Role|Audience|Constraint)/i.test(
            trimmed,
          )
        ) {
          return false;
        }
        return true;
      });
      cleaned = proseParagraphs.join("\n\n").trim();
    }
  }

  // 3. Strip any residual markdown titles or meta headers
  cleaned = cleaned.replace(/^#+\s+.*$/gm, "");

  // 4. Some small models "count" words inline when given a length budget,
  //    emitting "(40) Painel (41) Estratégico (42) que". Three or more of those
  //    is never prose, so the counters are removed instead of being shown.
  const inlineCounters = cleaned.match(INLINE_COUNTER_PATTERN);
  if (inlineCounters && inlineCounters.length >= 3) {
    cleaned = cleaned.replace(INLINE_COUNTER_PATTERN, " ");
  }

  // 5. Leftover list numbering from a numbered draft, e.g. "9) - texto".
  cleaned = cleaned
    .replace(/^[ \t]*\d{1,3}\)[ \t]*[-\u2013\u2014]?[ \t]*/gm, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ +([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cleaned;
}

/**
 * Rejects prose that is not safe to mail out.
 *
 * The narrative goes straight into an e-mail with no chance to review it, and
 * the provider chain includes free models that occasionally derail. Anything
 * failing here falls back to the deterministic writer, which is always sane.
 */
export function isNarrativeUsable(text: string): boolean {
  if (text.length < MIN_NARRATIVE_LENGTH) return false;
  if (text.length > MAX_NARRATIVE_LENGTH) return false;

  // A finished summary closes its last sentence; anything else was cut
  // mid-thought by the token limit.
  if (!/[.!?]["'\u2019\u201d)\]]?$/.test(text)) return false;

  // Counters the sanitizer could not fully rescue.
  if ((text.match(INLINE_COUNTER_PATTERN) ?? []).length >= 2) return false;

  // We asked for prose, not a bullet list.
  if (/^[ \t]*[-*\u2022]\s/m.test(text)) return false;

  return true;
}

// ─── Deterministic fallback ──────────────────────────────────────────

function writeMemberFallback(digest: MemberDigest): string {
  if (digest.totalMinutes === 0) {
    return `Você não registrou horas na ${digest.period.label}. Se trabalhou nesse período, vale lançar as horas retroativamente — o sistema aceita até 30 dias.`;
  }

  const parts: string[] = [];

  parts.push(
    `Na ${digest.period.label}, você registrou ${formatDuration(digest.totalMinutes)} de uma meta de ${formatDuration(digest.targetMinutes)}, em ${digest.entryCount} lançamento(s).`,
  );

  if (digest.previousTotalMinutes > 0) {
    parts.push(`Isso é ${formatDelta(digest)}.`);
  }

  const topCategory = digest.categories[0];
  if (topCategory && digest.categories.length > 1) {
    const second = digest.categories[1];
    parts.push(
      `A maior parte do tempo foi em ${topCategory.label} (${topCategory.percentage}%)${
        second ? `, seguido de ${second.label} (${second.percentage}%)` : ""
      }.`,
    );
  } else if (topCategory) {
    parts.push(
      `Praticamente todo o tempo foi em ${topCategory.label} (${topCategory.percentage}%).`,
    );
  }

  if (digest.mostProductiveDay) {
    parts.push(
      `Seu dia mais produtivo foi ${digest.mostProductiveDay.weekday}, com ${formatDuration(digest.mostProductiveDay.minutes)}.`,
    );
  }

  if (digest.timesheetStatus === "open") {
    parts.push("O timesheet dessa semana ainda não foi submetido.");
  } else if (digest.timesheetStatus === "rejected") {
    parts.push(
      "O timesheet dessa semana foi rejeitado — vale revisar e resubmeter.",
    );
  } else if (digest.incompleteDays > 0) {
    parts.push(
      `${digest.incompleteDays} dia(s) útil(eis) ficaram abaixo de 6h registradas.`,
    );
  }

  return parts.join(" ");
}

function writeManagerFallback(digest: ManagerDigest): string {
  const parts: string[] = [];

  parts.push(
    `Na ${digest.period.label}, sua equipe registrou ${formatDuration(digest.teamTotalMinutes)} distribuídas em ${digest.projects.length} projeto(s), com ${digest.activeMemberCount} de ${digest.memberCount} pessoa(s) apontando horas.`,
  );

  const topProject = digest.projects[0];
  if (topProject) {
    parts.push(
      `O projeto com maior volume foi ${topProject.name}, com ${topProject.percentage}% do total.`,
    );
  }

  const pending = digest.approvals.submitted + digest.approvals.notSubmitted;
  if (pending === 0) {
    parts.push(
      "Todos os timesheets da semana já estão aprovados — nada pendente do seu lado.",
    );
  } else {
    const details: string[] = [];
    if (digest.approvals.submitted > 0) {
      details.push(`${digest.approvals.submitted} aguardando sua aprovação`);
    }
    if (digest.approvals.notSubmitted > 0) {
      details.push(`${digest.approvals.notSubmitted} ainda não submetido(s)`);
    }
    parts.push(`Pendências de timesheet: ${details.join(" e ")}.`);
  }

  if (digest.underloaded.length > 0) {
    parts.push(
      `Abaixo de 60% da meta: ${digest.underloaded.map((member) => member.name).join(", ")}.`,
    );
  }

  if (digest.overloaded.length > 0) {
    parts.push(
      `Acima de 110% da meta: ${digest.overloaded.map((member) => member.name).join(", ")}.`,
    );
  }

  return parts.join(" ");
}

export function writeDeterministicNarrative(digest: Digest): string {
  return digest.audience === "member"
    ? writeMemberFallback(digest)
    : writeManagerFallback(digest);
}

// ─── Public entry point ──────────────────────────────────────────────

export async function buildDigestNarrative(
  digest: Digest,
): Promise<DigestNarrative> {
  const facts =
    digest.audience === "member"
      ? buildMemberFacts(digest)
      : buildManagerFacts(digest);

  const audienceHint =
    digest.audience === "member"
      ? "Escreva para o próprio colaborador, em segunda pessoa (você)."
      : "Escreva para o gestor sobre a equipe dele, em segunda pessoa (você/sua equipe).";

  const result = await completeText({
    system: SYSTEM_PROMPT,
    prompt: `${audienceHint}\n\nFicha de dados (use apenas estes números):\n${facts}`,
    maxTokens: NARRATIVE_MAX_TOKENS,
    // Factual phrasing, not creative writing.
    temperature: 0.2,
    // Checked inside the provider loop so a derailed model is skipped and the
    // next one gets a turn, instead of dropping straight to the fallback.
    validate: (candidate) =>
      isNarrativeUsable(sanitizeNarrativeText(candidate)),
  });

  if (result) {
    const cleanedText = sanitizeNarrativeText(result.text);

    if (isNarrativeUsable(cleanedText)) {
      return { text: cleanedText, provider: result.provider };
    }

    console.warn(
      `[digest] narrative from ${result.provider} rejected; using deterministic text`,
    );
  }

  return {
    text: writeDeterministicNarrative(digest),
    provider: "deterministic",
  };
}
