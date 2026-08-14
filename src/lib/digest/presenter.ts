/**
 * Turns a digest into the exact figures shown to the user.
 *
 * Shared by the e-mail template and the in-app preview so the two can never
 * drift: what the preview shows is literally what gets mailed.
 */

import { formatDuration } from "@/lib/utils";
import type {
  Digest,
  ManagerDigest,
  MemberDigest,
  WorkCategory,
} from "./types";

export interface DigestBar {
  label: string;
  value: string;
  /** 0–100. */
  percentage: number;
  color: string;
}

export interface DigestMetric {
  label: string;
  value: string;
  hint?: string;
}

export interface DigestPresentation {
  subject: string;
  headline: string;
  periodLabel: string;
  metrics: DigestMetric[];
  bars: DigestBar[];
  /** Title above the bar chart. */
  barsTitle: string;
  attention: string | null;
  /** Shown as a caption wherever the bars are estimated rather than measured. */
  barsCaption: string | null;
}

const CATEGORY_COLORS: Record<WorkCategory, string> = {
  feature: "#f97316",
  bugfix: "#ef4444",
  refactor: "#8b5cf6",
  meeting: "#3b82f6",
  docs: "#14b8a6",
  support: "#f59e0b",
  other: "#737373",
};

const MAX_BARS = 5;

function formatSignedDuration(minutes: number): string {
  const sign = minutes >= 0 ? "+" : "−";
  return `${sign}${formatDuration(Math.abs(minutes))}`;
}

function presentMember(digest: MemberDigest): DigestPresentation {
  const metrics: DigestMetric[] = [
    {
      label: "Total registrado",
      value: formatDuration(digest.totalMinutes),
      hint: `Meta: ${formatDuration(digest.targetMinutes)}`,
    },
    {
      label: "vs. semana anterior",
      value:
        digest.previousTotalMinutes > 0
          ? formatSignedDuration(digest.deltaMinutes)
          : "—",
      hint:
        digest.deltaPercentage !== null
          ? `${digest.deltaPercentage > 0 ? "+" : ""}${digest.deltaPercentage}%`
          : "sem base de comparação",
    },
    {
      label: "Faturável",
      value: formatDuration(digest.billableMinutes),
      hint:
        digest.totalMinutes > 0
          ? `${Math.round((digest.billableMinutes / digest.totalMinutes) * 100)}% do total`
          : undefined,
    },
    {
      label: "Dia mais produtivo",
      value: digest.mostProductiveDay
        ? formatDuration(digest.mostProductiveDay.minutes)
        : "—",
      hint: digest.mostProductiveDay?.weekday,
    },
  ];

  const bars: DigestBar[] = digest.categories
    .slice(0, MAX_BARS)
    .map((slice) => ({
      label: `${slice.label} · ${slice.percentage}%`,
      value: formatDuration(slice.minutes),
      percentage: slice.percentage,
      color: CATEGORY_COLORS[slice.category],
    }));

  let attention: string | null = null;

  if (digest.totalMinutes === 0) {
    attention =
      "Nenhuma hora registrada nessa semana. É possível lançar retroativamente por até 30 dias.";
  } else if (digest.timesheetStatus === "rejected") {
    attention =
      "Seu timesheet dessa semana foi rejeitado. Revise os lançamentos e submeta novamente.";
  } else if (digest.timesheetStatus === "open") {
    attention =
      "O timesheet dessa semana ainda não foi submetido para aprovação.";
  } else if (digest.incompleteDays > 0) {
    attention = `${digest.incompleteDays} dia(s) útil(eis) ficaram abaixo de 6h registradas.`;
  }

  return {
    subject: `Seu resumo semanal — ${digest.period.label}`,
    headline: "Seu resumo da semana",
    periodLabel: `${digest.period.label} · ${digest.period.from} a ${digest.period.to}`,
    metrics,
    bars,
    barsTitle: "Distribuição por tipo de trabalho",
    barsCaption:
      bars.length > 0
        ? "Tipos estimados a partir das descrições dos seus lançamentos."
        : null,
    attention,
  };
}

function presentManager(digest: ManagerDigest): DigestPresentation {
  const utilization =
    digest.teamTargetMinutes > 0
      ? Math.round((digest.teamTotalMinutes / digest.teamTargetMinutes) * 100)
      : null;

  const metrics: DigestMetric[] = [
    {
      label: "Total da equipe",
      value: formatDuration(digest.teamTotalMinutes),
      hint:
        utilization !== null
          ? `${utilization}% da capacidade`
          : `${digest.memberCount} pessoa(s)`,
    },
    {
      label: "Pessoas apontando",
      value: `${digest.activeMemberCount}/${digest.memberCount}`,
      hint:
        digest.activeMemberCount < digest.memberCount
          ? `${digest.memberCount - digest.activeMemberCount} sem registros`
          : "todos registraram",
    },
    {
      label: "Timesheets aprovados",
      value: `${digest.approvals.approved}/${digest.memberCount}`,
      hint:
        digest.approvals.submitted > 0
          ? `${digest.approvals.submitted} aguardando você`
          : undefined,
    },
    {
      label: "Projetos ativos",
      value: String(digest.projects.length),
      hint: digest.projects[0]?.name,
    },
  ];

  const bars: DigestBar[] = digest.projects.slice(0, MAX_BARS).map((slice) => ({
    label: `${slice.name} · ${slice.percentage}%`,
    value: formatDuration(slice.minutes),
    percentage: slice.percentage,
    color: slice.color,
  }));

  let attention: string | null = null;

  if (digest.approvals.submitted > 0) {
    attention = `${digest.approvals.submitted} timesheet(s) aguardando sua aprovação.`;
  } else if (digest.approvals.notSubmitted > 0) {
    attention = `${digest.approvals.notSubmitted} pessoa(s) ainda não submeteram o timesheet da semana.`;
  } else if (digest.underloaded.length > 0) {
    attention = `Abaixo de 60% da meta: ${digest.underloaded
      .map((member) => member.name)
      .join(", ")}.`;
  }

  return {
    subject: `Resumo da equipe — ${digest.period.label}`,
    headline: "Resumo da sua equipe",
    periodLabel: `${digest.period.label} · ${digest.period.from} a ${digest.period.to}`,
    metrics,
    bars,
    barsTitle: "Horas por projeto",
    barsCaption: null,
    attention,
  };
}

export function presentDigest(digest: Digest): DigestPresentation {
  return digest.audience === "member"
    ? presentMember(digest)
    : presentManager(digest);
}
