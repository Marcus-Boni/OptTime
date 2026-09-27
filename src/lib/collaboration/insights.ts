/**
 * The findings behind the Meu Tempo assistant.
 *
 * Every sentence produced here is derived from a number that is also on the
 * screen, so a user who distrusts the assistant can check it against the chart
 * beside it. Nothing is inferred, projected or estimated — the AI narrative
 * built on top of these is explicitly forbidden from adding anything new.
 *
 * Two rules of tone, both deliberate:
 *
 *  1. **Nothing here collects hours.** A period below target is reported as a
 *     fact with a shortcut, never as a debt in amber. The page that tells you
 *     where your week went cannot also be the page that scolds you for it.
 *  2. **`attention` is for the routine, not for the timesheet** — a week that
 *     was fragmented, invaded after hours or rewritten by cancellations.
 *
 * Pure by construction: the verify script drives the same function the page
 * renders.
 */

import { WEEKDAY_LABELS } from "@/lib/collaboration/period";
import { formatDuration } from "@/lib/utils";
import type {
  CollaborationPeriod,
  DeliveryCounts,
  PeriodInsight,
  WeekRhythm,
} from "@/types/collaboration";

/** Above this share of the working window, meetings are the job. */
const HEAVY_MEETING_LOAD_PERCENT = 50;
const NOTABLE_MEETING_LOAD_PERCENT = 30;
/** A day with this many stacked meetings has no recovery time. */
const BACK_TO_BACK_THRESHOLD = 4;
/** Two hours is the shortest block most people call "deep work". */
const DEEP_WORK_MINUTES = 120;
/** Four straight hours is a morning nobody interrupted — worth celebrating. */
const PROTECTED_FOCUS_MINUTES = 240;
/** Below this, an unregistered meeting gap is rounding, not a missing entry. */
const MIN_UNLOGGED_GAP_MINUTES = 30;
/** Churn beyond this share stops being noise and becomes the story. */
const CHURN_SHARE_PERCENT = 25;
/** External time beyond this share means the week belonged to the client. */
const EXTERNAL_SHARE_PERCENT = 30;
/** Organising most of your own agenda is a different job from attending it. */
const ORGANIZER_SHARE_PERCENT = 60;
/** More than this is a wall of cards nobody reads. */
const MAX_INSIGHTS = 5;

const TONE_WEIGHT: Record<PeriodInsight["tone"], number> = {
  action: 0,
  attention: 1,
  positive: 2,
  neutral: 3,
};

interface Draft extends PeriodInsight {
  /** Lower sorts first inside the same tone. */
  rank: number;
}

function percent(part: number, whole: number): number {
  if (whole <= 0) return 0;
  return Math.round((part / whole) * 100);
}

/** "2026-09-15" → "15/09". */
function shortDate(date: string): string {
  const [, month, day] = date.split("-");
  return `${day}/${month}`;
}

// ─── Rhythm ───────────────────────────────────────────────────────────

/**
 * The pill next to the page title: how the period was arranged, in two words.
 *
 * Ordered by what the person can act on. A heavy week is the loudest signal;
 * a fragmented one comes next because it is fixable by moving meetings, not by
 * having fewer; a protected week is worth naming out loud, since nobody
 * notices the weeks that went well.
 */
export function resolveRhythm(period: CollaborationPeriod): WeekRhythm {
  const { shape, ledger, sources } = period;

  if (!sources.calendar) {
    return {
      kind: "unknown",
      label: "Agenda indisponível",
      description:
        "Não conseguimos ler sua agenda neste período, então não dá para avaliar o ritmo.",
    };
  }

  if (ledger.attended.count === 0) {
    return {
      kind: "protected",
      label: "Sem reuniões",
      description:
        "Nenhuma reunião na agenda neste período — o tempo todo foi seu.",
    };
  }

  if (shape.meetingLoadPercent >= HEAVY_MEETING_LOAD_PERCENT) {
    return {
      kind: "heavy",
      label: "Alta carga de reuniões",
      description: `Reuniões ocuparam ${shape.meetingLoadPercent}% do seu expediente no período.`,
    };
  }

  if (
    shape.backToBackCount >= BACK_TO_BACK_THRESHOLD ||
    shape.longestFocusBlockMinutes < DEEP_WORK_MINUTES
  ) {
    return {
      kind: "fragmented",
      label: "Semana fragmentada",
      description:
        shape.longestFocusBlockMinutes < DEEP_WORK_MINUTES
          ? "Nenhum dia teve um intervalo de 2h livre dentro do expediente."
          : `${shape.backToBackCount} reuniões começaram logo no fim da anterior.`,
    };
  }

  if (
    shape.longestFocusBlockMinutes >= PROTECTED_FOCUS_MINUTES &&
    shape.meetingLoadPercent < NOTABLE_MEETING_LOAD_PERCENT
  ) {
    return {
      kind: "protected",
      label: "Foco protegido",
      description: `Você manteve um bloco de ${formatDuration(shape.longestFocusBlockMinutes)} sem reunião e só ${shape.meetingLoadPercent}% do expediente em agenda.`,
    };
  }

  return {
    kind: "balanced",
    label: "Semana equilibrada",
    description: `${shape.meetingLoadPercent}% do seu expediente em reuniões, com janelas livres preservadas na agenda.`,
  };
}

// ─── Findings ─────────────────────────────────────────────────────────

export interface BuildPeriodInsightsInput {
  period: CollaborationPeriod;
  /**
   * What Azure DevOps reported for the same window, when it has answered.
   *
   * Counts rather than the whole timeline: the client already has them, and
   * the assistant route can accept them without paying for a second sweep of
   * every repository.
   */
  delivery?: DeliveryCounts | null;
}

/**
 * Ranks the findings worth showing, most actionable first.
 *
 * Actions lead because they are the only ones that change anything; within a
 * tone the order is fixed by `rank`, so the same week always produces the same
 * page.
 */
export function buildPeriodInsights({
  period,
  delivery,
}: BuildPeriodInsightsInput): PeriodInsight[] {
  const drafts: Draft[] = [];
  const { totals, shape, ledger, rituals, collaborators } = period;

  const unloggedMeetings = period.meetings.filter(
    (meeting) => !meeting.alreadyLogged,
  );
  const unloggedMinutes = unloggedMeetings.reduce(
    (sum, meeting) => sum + meeting.minutes,
    0,
  );

  // ── The one thing this page can do for you ──
  if (
    unloggedMeetings.length > 0 &&
    unloggedMinutes >= MIN_UNLOGGED_GAP_MINUTES
  ) {
    drafts.push({
      id: "unlogged-meetings",
      tone: "action",
      icon: "CalendarClock",
      rank: 0,
      title: `${unloggedMeetings.length} reunião(ões) ainda sem apontamento`,
      description: `São ${formatDuration(unloggedMinutes)} que já aconteceram na sua agenda. Escolha o projeto e lance todas de uma vez.`,
      actionLabel: "Apontar em 1 clique",
      actionHref: null,
      quickAction: "log-meetings",
    });
  }

  // ── Routine health ──
  if (shape.backToBackCount >= BACK_TO_BACK_THRESHOLD) {
    drafts.push({
      id: "back-to-back",
      tone: "attention",
      icon: "Layers",
      rank: 1,
      title: `${shape.backToBackCount} reuniões emendadas sem intervalo`,
      description:
        "Começaram a menos de 5 minutos do fim da anterior. Alguns minutos entre elas costumam bastar para anotar o que ficou decidido.",
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  const churnMinutes =
    ledger.cancelled.minutes +
    ledger.declined.minutes +
    ledger.overlapped.minutes;
  const churnShare = percent(
    churnMinutes,
    churnMinutes + ledger.attended.minutes,
  );

  if (churnShare >= CHURN_SHARE_PERCENT) {
    const pieces: string[] = [];
    if (ledger.cancelled.count > 0) {
      pieces.push(`${ledger.cancelled.count} cancelada(s)`);
    }
    if (ledger.rescheduled.count > 0) {
      pieces.push(`${ledger.rescheduled.count} remarcada(s)`);
    }
    if (ledger.declined.count > 0) {
      pieces.push(`${ledger.declined.count} recusada(s)`);
    }
    if (ledger.overlapped.count > 0) {
      pieces.push(`${ledger.overlapped.count} sobreposta(s)`);
    }

    drafts.push({
      id: "agenda-churn",
      tone: "attention",
      icon: "RefreshCw",
      rank: 2,
      title: `${churnShare}% da sua agenda mudou depois de marcada`,
      description: `${pieces.join(", ")}. Reorganizar agenda custa tempo mesmo quando a reunião não acontece — e isso não aparece em nenhum relatório de horas.`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  if (shape.afterHoursMinutes >= 60 || shape.weekendMinutes > 0) {
    const parts: string[] = [];
    if (shape.afterHoursMinutes >= 60) {
      parts.push(`${formatDuration(shape.afterHoursMinutes)} fora do horário`);
    }
    if (shape.weekendMinutes > 0) {
      parts.push(
        `${formatDuration(shape.weekendMinutes)} em dia não útil para você`,
      );
    }

    drafts.push({
      id: "after-hours",
      tone: "attention",
      icon: "Moon",
      rank: 3,
      title: "Reuniões invadiram seu tempo pessoal",
      description: `${parts.join(" e ")}, considerando o horário configurado no seu Outlook.`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  if (
    shape.longestFocusBlockMinutes < DEEP_WORK_MINUTES &&
    ledger.attended.count > 0
  ) {
    drafts.push({
      id: "no-focus-block",
      tone: "attention",
      icon: "Focus",
      rank: 4,
      title: "Nenhuma janela de 2h livre no período",
      description:
        "Em nenhum dia sobrou um intervalo longo sem reunião dentro do expediente. Agrupar as reuniões num mesmo turno costuma devolver uma manhã inteira.",
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  // ── What went well ──
  if (shape.longestFocusBlockMinutes >= PROTECTED_FOCUS_MINUTES) {
    drafts.push({
      id: "focus-block",
      tone: "positive",
      icon: "Focus",
      rank: 10,
      title: `${formatDuration(shape.longestFocusBlockMinutes)} seguidos sem reunião`,
      description: shape.longestFocusBlockDate
        ? `Sua maior janela livre do período foi em ${shortDate(shape.longestFocusBlockDate)}.`
        : "Sua maior janela livre do período, dentro do horário de trabalho.",
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  if (delivery && (delivery.pullRequests > 0 || delivery.commits > 0)) {
    const parts: string[] = [];
    if (delivery.pullRequests > 0) {
      parts.push(`${delivery.pullRequests} pull request(s) concluído(s)`);
    }
    if (delivery.commits > 0) parts.push(`${delivery.commits} commit(s)`);
    if (delivery.workItems > 0) {
      parts.push(`${delivery.workItems} work item(s) movimentado(s)`);
    }

    drafts.push({
      id: "delivery",
      tone: "positive",
      icon: "GitPullRequest",
      rank: 11,
      title: "O que saiu no Azure DevOps",
      description: `${parts.join(", ")} no período, além das reuniões.`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  if (
    totals.targetMinutes > 0 &&
    totals.loggedMinutes >= totals.targetMinutes
  ) {
    drafts.push({
      id: "target",
      tone: "positive",
      icon: "CircleCheck",
      rank: 12,
      title: "Período todo apontado",
      description: `${formatDuration(totals.loggedMinutes)} registradas para ${formatDuration(totals.targetMinutes)} previstas.`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  // ── Context, for whoever wants it ──
  if (shape.meetingLoadPercent >= NOTABLE_MEETING_LOAD_PERCENT) {
    drafts.push({
      id: "meeting-load",
      tone: "neutral",
      icon: "Users",
      rank: 20,
      title: `${shape.meetingLoadPercent}% do expediente em reuniões`,
      description: `${ledger.attended.count} reuniões somaram ${formatDuration(totals.meetingMinutes)} dentro do seu horário de trabalho.`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  const topRitual = rituals.find((ritual) => ritual.occurrences >= 2);
  if (topRitual) {
    const extra =
      topRitual.rescheduled > 0
        ? ` ${topRitual.rescheduled} ocorrência(s) mudaram de horário.`
        : "";
    drafts.push({
      id: "top-ritual",
      tone: "neutral",
      icon: "Repeat",
      rank: 21,
      title: `"${topRitual.title}" custa ${formatDuration(topRitual.minutes)} no período`,
      description: `${topRitual.occurrences} ocorrências, com ${topRitual.averageParticipants} participante(s) em média.${extra}`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  const topPerson = collaborators[0];
  if (topPerson && topPerson.minutes > 0) {
    drafts.push({
      id: "top-collaborator",
      tone: "neutral",
      icon: "UserRound",
      rank: 22,
      title: `${formatDuration(topPerson.minutes)} com ${topPerson.name}`,
      description:
        topPerson.oneOnOnes > 0
          ? `${topPerson.meetings} reuniões, sendo ${topPerson.oneOnOnes} conversa(s) individual(is).`
          : `${topPerson.meetings} reuniões no período.`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  const externalShare = percent(shape.externalMinutes, totals.meetingMinutes);
  if (externalShare >= EXTERNAL_SHARE_PERCENT) {
    drafts.push({
      id: "external-time",
      tone: "neutral",
      icon: "Building2",
      rank: 23,
      title: `${externalShare}% do tempo de reunião foi com gente de fora`,
      description: `${formatDuration(shape.externalMinutes)} em reuniões com pelo menos um participante externo à empresa.`,
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  if (
    shape.organizerPercent >= ORGANIZER_SHARE_PERCENT &&
    ledger.attended.count >= 3
  ) {
    drafts.push({
      id: "organizer",
      tone: "neutral",
      icon: "CalendarPlus",
      rank: 24,
      title: `Você organizou ${shape.organizerPercent}% das reuniões`,
      description:
        "A maior parte da sua agenda foi criada por você — o que significa que boa parte dela também pode ser encurtada por você.",
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  if (shape.heaviestWeekday !== null && ledger.attended.count >= 4) {
    drafts.push({
      id: "heaviest-weekday",
      tone: "neutral",
      icon: "CalendarRange",
      rank: 25,
      title: `${WEEKDAY_LABELS[shape.heaviestWeekday] ?? ""} concentrou mais reuniões`,
      description:
        "É o dia da semana que mais acumulou minutos de agenda no período.",
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  const callMinutes = totals.callMinutes ?? 0;
  if (callMinutes >= 20) {
    drafts.push({
      id: "teams-calls",
      tone: "neutral",
      icon: "PhoneCall",
      rank: 26,
      title: `${formatDuration(callMinutes)} em chamadas no Teams`,
      description:
        (period.calls?.length ?? 0) > 0
          ? "Participação registrada fora dos intervalos da agenda. Revise as chamadas e escolha o projeto antes de lançar horas."
          : "Resumo de chamadas informado pelo Viva Insights. Esse total não identifica chamadas individuais nem equivale a horas já lançadas.",
      actionLabel: null,
      actionHref: null,
      quickAction: null,
    });
  }

  return drafts
    .sort(
      (a, b) => TONE_WEIGHT[a.tone] - TONE_WEIGHT[b.tone] || a.rank - b.rank,
    )
    .slice(0, MAX_INSIGHTS)
    .map(({ rank: _rank, ...insight }) => insight);
}
