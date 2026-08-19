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
import type {
  Digest,
  DigestNarrative,
  ManagerDigest,
  MemberDigest,
} from "./types";

const SYSTEM_PROMPT = `Você escreve o resumo semanal do **OptSolv Time Tracker**, o sistema de apontamento de horas da OptSolv.

Regras absolutas:
- Use **somente** os números da ficha de dados recebida. Nunca invente, arredonde de forma diferente, projete ou estime nada.
- Escreva em português do Brasil, 2 a 3 parágrafos curtos (máximo 90 palavras no total).
- Tom profissional e direto, como um colega competente — sem "Olá!", sem "Espero que esteja bem", sem emojis.
- Destaque o que importa: onde o tempo foi, o que mudou em relação à semana anterior e o único ponto de atenção mais relevante (se houver).
- Não repita a ficha inteira em formato de lista. Escreva prosa.
- Não use Markdown, títulos nem bullets.
- Se a semana não teve horas registradas, diga isso em uma frase e não invente motivos.`;

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
  const lines = [
    `Colaborador: ${digest.userName}`,
    `Semana: ${digest.period.label} (${digest.period.from} a ${digest.period.to})`,
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
  const lines = [
    `Gestor: ${digest.userName}`,
    `Semana: ${digest.period.label} (${digest.period.from} a ${digest.period.to})`,
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

// ─── Deterministic fallback ──────────────────────────────────────────

function writeMemberFallback(digest: MemberDigest): string {
  if (digest.totalMinutes === 0) {
    return `Você não registrou horas em ${digest.period.label}. Se trabalhou nesse período, vale lançar as horas retroativamente — o sistema aceita até 30 dias.`;
  }

  const parts: string[] = [];

  parts.push(
    `Em ${digest.period.label} você registrou ${formatDuration(digest.totalMinutes)} de uma meta de ${formatDuration(digest.targetMinutes)}, em ${digest.entryCount} lançamento(s).`,
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
    `Em ${digest.period.label} sua equipe registrou ${formatDuration(digest.teamTotalMinutes)} distribuídas em ${digest.projects.length} projeto(s), com ${digest.activeMemberCount} de ${digest.memberCount} pessoa(s) apontando horas.`,
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
  });

  if (result) {
    return { text: result.text, provider: result.provider };
  }

  return {
    text: writeDeterministicNarrative(digest),
    provider: "deterministic",
  };
}
