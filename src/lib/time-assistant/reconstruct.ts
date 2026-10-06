/**
 * Magic Timesheet Reconstructor ("Preencher meu dia").
 *
 * Rebuilds a full workday from four evidence layers:
 *   1. Outlook calendar meetings (exact durations),
 *   2. code work — commit sessions, each labelled with its pull request,
 *   3. Azure DevOps work items assigned to the user,
 *   4. the user's own historical patterns for that weekday.
 *
 * Layer 2 treats the *work session* as the atom, not the pull request. A day
 * is usually three or four distinct stretches of work; a PR merged at the end
 * of it is a label for one of them, not a container for all of them. Deriving
 * a duration from "first commit to last commit in this repository" turns a
 * morning push plus a late-evening fix into a twelve-hour block and hides
 * every session that never opened a PR.
 *
 * The composition is deterministic and auditable; an optional AI pass may only
 * polish descriptions and rebalance minutes — it can never invent items,
 * change projects or exceed the day target. When no provider is configured
 * (or the model answers garbage) the deterministic plan ships untouched.
 */

import { z } from "zod";
import { completeText } from "@/lib/ai/completion";
import { describeTeamCall } from "@/lib/collaboration/calls";
import {
  type AutofillProject,
  matchProjectForAzureProject,
} from "@/lib/time-assistant/autofill";
import {
  type CommitSession,
  estimateFromSessions,
  sessionsForPullRequest,
} from "@/lib/time-assistant/commit-sessions";
import { getAppTimeZone } from "@/lib/timezone";
import { formatDuration } from "@/lib/utils";
import type { AutofillProposal } from "@/types/autofill";
import type { AzureDevOpsPullRequest } from "@/types/azure-devops";
import type { TeamCallSignal } from "@/types/collaboration";
import type {
  DayPlan,
  DayPlanItem,
  ReconstructConfidence,
} from "@/types/reconstruct";

export type { CommitSession } from "@/lib/time-assistant/commit-sessions";
export type {
  DayPlan,
  DayPlanItem,
  ReconstructConfidence,
  ReconstructSourceKind,
} from "@/types/reconstruct";

export interface CalendarEventInput {
  subject: string;
  startIso: string;
  endIso: string;
  /**
   * Fields below are filled by the collaboration layer (lib/collaboration),
   * which already resolved cancellations, declines and double-booking. All
   * optional so a caller with a bare calendar row still works.
   */
  title?: string;
  /** Duration after overlap clipping — beats the raw start/end difference. */
  minutes?: number;
  /** Signed-in participant's actual attendance, when an artifact is available. */
  attendanceMinutes?: number;
  attendedFromIso?: string;
  summary?: string;
  confidence?: ReconstructConfidence;
  evidence?: string;
}

export interface WeekdayPattern {
  projectId: string;
  projectName: string;
  projectColor: string;
  billable: boolean;
  description: string;
  /** Occurrences in the lookback window — higher = stronger habit. */
  weight: number;
}

/** A file modification is a point-in-time clue, never a measured work span. */
export interface DocumentEventInput {
  id: string;
  name: string;
  path: string | null;
  modifiedAt: string;
}

export interface BuildDayPlanInput {
  date: string;
  targetMinutes: number;
  existingMinutes: number;
  existingDescriptions: string[];
  /** Work items already logged on this day — never proposed a second time. */
  existingWorkItemIds: number[];
  events: CalendarEventInput[];
  documents: DocumentEventInput[];
  /** Teams calls without a matching calendar event, already clipped to participation. */
  calls?: TeamCallSignal[];
  /** Commit clusters for the day, longest first. */
  commitSessions: CommitSession[];
  /** Pull requests touched that day, used to label the sessions. */
  pullRequests: AzureDevOpsPullRequest[];
  /**
   * Work-item nudges from the autofill radar. Pull-request and commit signals
   * are deliberately NOT taken from there: the radar answers "which day did
   * you forget entirely", which is a different question from "how was this
   * day actually spent".
   */
  workItemProposals: AutofillProposal[];
  /** Radar fingerprints the user dismissed, honoured for pull requests. */
  dismissedFingerprints: string[];
  patterns: WeekdayPattern[];
  projects: AutofillProject[];
  defaultBillable: boolean;
  warnings: string[];
  sources: DayPlan["sources"];
}

const MIN_ITEM_MINUTES = 15;
const MAX_MEETING_MINUTES = 240;
const MAX_MEASURED_CALL_MINUTES = 24 * 60;
const MAX_PLAN_ITEMS = 10;
/** Beyond this a day of commits reads as noise rather than as a plan. */
const MAX_COMMIT_SESSIONS = 6;
/** A merged PR with no commits of ours that day: review, merge, deploy. */
const PR_WITHOUT_COMMITS_MINUTES = 60;
/** Gaps smaller than this are not worth reconstructing. */
export const MIN_GAP_MINUTES = 15;

const CONFIDENCE_RANK: Record<ReconstructConfidence, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

const MEASURED_SOURCES = new Set<DayPlanItem["source"]>([
  "calendar",
  "teams_attendance",
  "teams_call",
]);

function roundToQuarter(minutes: number): number {
  return Math.max(
    MIN_ITEM_MINUTES,
    Math.round(minutes / MIN_ITEM_MINUTES) * MIN_ITEM_MINUTES,
  );
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function compactMatchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Keeps a generated description inside the entry field's comfortable range. */
function truncateDescription(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

/**
 * How much a commit session should be trusted. Volume is the signal: one
 * stray commit could be a typo fix, while a linked work item and a handful of
 * commits is a morning of work nobody would dispute.
 */
function commitSessionConfidence(
  session: CommitSession,
): ReconstructConfidence {
  const hasWorkItem = session.workItemIds.length > 0;

  if (
    session.substantiveCount >= 3 ||
    (session.substantiveCount >= 2 && hasWorkItem)
  ) {
    return "high";
  }
  if (session.substantiveCount >= 2 || hasWorkItem) return "medium";
  return "low";
}

/** Token boundaries prevent partial names/codes from silently claiming meetings. */
function meetingMatchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/**
 * Explicit name/code beats a unique name prefix or client; ties stay
 * unresolved. Shared with the Teams meeting nudge, so a meeting is never
 * attributed to a project without unique evidence anywhere in the product.
 */
export function matchProjectBySubject<
  T extends Pick<AutofillProject, "name" | "code" | "clientName">,
>(subject: string, projects: T[]): T | null {
  const needle = meetingMatchText(subject);
  if (!needle) return null;

  const mentions = (label: string | null | undefined): boolean => {
    if (!label) return false;
    const normalized = meetingMatchText(label);
    return normalized.length >= 3 && ` ${needle} `.includes(` ${normalized} `);
  };
  const explicit = projects.filter(
    (project) => mentions(project.name) || mentions(project.code),
  );
  if (explicit.length > 0) return explicit.length === 1 ? explicit[0] : null;
  // Client names may also be ordinary words (e.g. "Perfil"). Require them
  // as the meeting's leading label, not as a word somewhere in the prose.
  const meetingLabel = meetingMatchText(subject.split(/\s+[–—-]\s+|:\s*/)[0]);
  const isMeetingLabel = (label: string | null | undefined): boolean => {
    if (!label) return false;
    const normalized = meetingMatchText(label);
    return normalized.length >= 4 && normalized === meetingLabel;
  };
  const contextual = projects.filter((project) => {
    const prefix = project.name.split(/\s+[–—-]\s+/)[0];
    return isMeetingLabel(prefix) || isMeetingLabel(project.clientName);
  });
  return contextual.length === 1 ? contextual[0] : null;
}

/** HH:mm, so the evidence line says when the session actually happened. */
function clockOf(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: getAppTimeZone(),
  }).format(date);
}

/** Mirrors the autofill radar's key, so a dismissal there is honoured here. */
function buildRadarFingerprint(
  signal: AutofillProposal["signal"],
  date: string,
  projectId: string,
  reference: string,
): string {
  return `autofill:${signal}:${date}:${projectId}:${reference}`;
}

/**
 * Deterministic day composition. Pure — every input is passed in, so the
 * behavior is unit-testable and identical between preview and re-runs.
 */
export function buildDeterministicDayPlan(input: BuildDayPlanInput): DayPlan {
  const {
    date,
    targetMinutes,
    existingMinutes,
    existingDescriptions,
    existingWorkItemIds,
    events,
    documents,
    calls = [],
    commitSessions,
    pullRequests,
    workItemProposals,
    dismissedFingerprints,
    patterns,
    projects,
    defaultBillable,
    warnings,
    sources,
  } = input;

  const gapMinutes = Math.max(0, targetMinutes - existingMinutes);
  const items: DayPlanItem[] = [];

  const basePlan: Omit<DayPlan, "items" | "planMinutes"> = {
    projects: projects.map(({ id, name, color, billable }) => ({
      id,
      name,
      color,
      billable,
    })),
    defaultBillable,
    date,
    targetMinutes,
    existingMinutes,
    gapMinutes,
    refinedBy: null,
    narrative: null,
    sources,
    warnings,
    generatedAt: new Date().toISOString(),
  };

  if (gapMinutes < MIN_GAP_MINUTES || projects.length === 0) {
    return { ...basePlan, items: [], planMinutes: 0 };
  }

  const alreadyLogged = new Set(existingDescriptions.map(normalize));
  const fallbackProject =
    patterns[0] != null
      ? projects.find((project) => project.id === patterns[0]?.projectId)
      : undefined;
  const defaultProject = fallbackProject ?? projects[0];

  // ── 1. Calendar meetings: exact durations, strongest evidence ──
  for (const event of events) {
    const start = new Date(event.startIso).getTime();
    const end = new Date(event.endIso).getTime();
    if (Number.isNaN(start) || Number.isNaN(end) || end <= start) continue;

    // A collaboration-built title already reads like a description
    // ("Reunião com Marcus Boni"); a bare subject still needs the prefix.
    const description = (
      event.summary?.trim() ||
      event.title?.trim() ||
      `Reunião: ${event.subject.trim()}`
    ).slice(0, 180);

    // An entry may exist under the generated title, the bare subject or the
    // prefixed form — any of the three means the meeting is already logged.
    if (
      alreadyLogged.has(normalize(description)) ||
      alreadyLogged.has(normalize(event.subject)) ||
      alreadyLogged.has(normalize(`Reunião: ${event.subject}`))
    ) {
      continue;
    }

    const actualAttendance = event.attendanceMinutes;
    const minutes = Math.min(
      actualAttendance && actualAttendance > 0
        ? Math.round(actualAttendance)
        : roundToQuarter(event.minutes ?? (end - start) / 60_000),
      MAX_MEETING_MINUTES,
    );

    const matched = matchProjectBySubject(event.subject, projects);
    const project = matched;

    const baseEvidence = matched
      ? `Evento de ${formatDuration(minutes)} no seu calendário, associado a ${matched.name}.`
      : `Evento de ${formatDuration(minutes)} no seu calendário. Selecione o projeto antes de lançar.`;

    items.push({
      id: crypto.randomUUID(),
      projectId: project?.id ?? null,
      projectName: project?.name ?? "Projeto não identificado",
      projectColor: project?.color ?? "",
      description,
      minutes,
      estimatedMinutes: minutes,
      startsAt: event.attendedFromIso ?? event.startIso,
      billable: (project?.billable ?? false) && defaultBillable,
      azureWorkItemId: null,
      azureWorkItemTitle: null,
      source:
        actualAttendance && actualAttendance > 0
          ? "teams_attendance"
          : "calendar",
      // The calendar layer's own read of the invitation (declined, tentative,
      // clipped) is more informative than "did the subject match a project".
      confidence: event.confidence ?? (matched ? "high" : "medium"),
      evidence: event.evidence
        ? `${actualAttendance && actualAttendance > 0 ? `Presença real no Teams: ${formatDuration(minutes)}. ` : ""}${event.evidence} ${event.summary ? "Descrição sugerida a partir da transcrição. " : ""}${matched ? `Associado a ${matched.name}.` : "Selecione o projeto antes de lançar."}`
        : baseEvidence,
    });
  }

  // ── 1b. Teams calls: exact participation, no calendar inflation ──
  for (const call of calls) {
    const start = new Date(call.startIso).getTime();
    const end = new Date(call.endIso).getTime();
    if (
      Number.isNaN(start) ||
      Number.isNaN(end) ||
      end <= start ||
      call.minutes < 1
    ) {
      continue;
    }

    const description = truncateDescription(describeTeamCall(call));
    if (alreadyLogged.has(normalize(description))) continue;

    const minutes = Math.min(call.minutes, MAX_MEASURED_CALL_MINUTES);
    const participant =
      call.callType === "groupCall"
        ? "chamada em grupo"
        : call.otherParticipantName.trim();

    items.push({
      id: crypto.randomUUID(),
      projectId: null,
      projectName: "Projeto não identificado",
      projectColor: "",
      description,
      minutes,
      estimatedMinutes: minutes,
      startsAt: call.startIso,
      billable: false,
      azureWorkItemId: null,
      azureWorkItemTitle: null,
      source: "teams_call",
      sourceId: call.id,
      confidence: "high",
      evidence: `Participação registrada no Teams: ${formatDuration(minutes)} com ${participant}. Selecione o projeto antes de lançar.`,
    });
  }

  // ── 2. Code work: one item per work session, labelled by its PR ──
  const seenDocuments = new Set<string>();
  for (const document of documents) {
    if (seenDocuments.size >= 3) break;
    if (seenDocuments.has(document.id)) continue;
    const haystack = compactMatchText(
      `${document.name} ${document.path ?? ""}`,
    );
    const matches = projects.filter((project) =>
      [project.name, project.code, project.clientName]
        .filter((label): label is string =>
          Boolean(label && compactMatchText(label).length >= 4),
        )
        .some((label) => haystack.includes(compactMatchText(label))),
    );
    if (matches.length !== 1) continue;
    const project = matches[0];
    if (!project) continue;
    const description = truncateDescription(
      `Trabalho no documento ${document.name}`,
    );
    if (alreadyLogged.has(normalize(description))) continue;
    seenDocuments.add(document.id);
    items.push({
      id: crypto.randomUUID(),
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      description,
      minutes: MIN_ITEM_MINUTES,
      estimatedMinutes: MIN_ITEM_MINUTES,
      startsAt: document.modifiedAt,
      billable: project.billable && defaultBillable,
      azureWorkItemId: null,
      azureWorkItemTitle: null,
      source: "document",
      confidence: "low",
      evidence: `Arquivo modificado às ${clockOf(document.modifiedAt)}. 15 min são apenas um ponto de partida; confirme a duração antes de lançar.`,
    });
  }

  const coveredWorkItemIds = new Set<number>(existingWorkItemIds);
  const dismissed = new Set(dismissedFingerprints);

  // A pull request labels the sessions it can be held responsible for. Any
  // session it cannot claim stands on its own — that is the work that used to
  // disappear behind whichever PR happened to merge that day.
  const pullRequestBySession = new Map<string, AzureDevOpsPullRequest>();
  const sessionsByPullRequest = new Map<number, CommitSession[]>();

  for (const pullRequest of pullRequests) {
    const matched = sessionsForPullRequest(commitSessions, pullRequest);
    sessionsByPullRequest.set(pullRequest.id, matched);

    for (const session of matched) {
      if (!pullRequestBySession.has(session.id)) {
        pullRequestBySession.set(session.id, pullRequest);
      }
    }
  }

  const claimedSessionIds = new Set<string>();
  let sessionItems = 0;

  for (const session of commitSessions) {
    if (sessionItems >= MAX_COMMIT_SESSIONS) break;

    const project = matchProjectForAzureProject(projects, session.projectName);
    if (!project) continue;

    const pullRequest = pullRequestBySession.get(session.id) ?? null;
    const workItemId =
      pullRequest?.workItemIds[0] ?? session.workItemIds[0] ?? null;

    // Already on the day, logged by hand or claimed by an earlier item.
    if (workItemId !== null && coveredWorkItemIds.has(workItemId)) continue;

    if (
      pullRequest &&
      dismissed.has(
        buildRadarFingerprint(
          "pr_completed",
          date,
          project.id,
          `pr${pullRequest.id}`,
        ),
      )
    ) {
      continue;
    }

    const headline =
      session.substantiveCount > 1
        ? `${session.headline} (+${session.substantiveCount - 1} commits)`
        : session.headline;

    const description = truncateDescription(
      pullRequest ? `${session.headline} — PR #${pullRequest.id}` : headline,
    );

    if (
      alreadyLogged.has(normalize(description)) ||
      alreadyLogged.has(normalize(session.headline))
    ) {
      continue;
    }

    const window = `${clockOf(session.startIso)}–${clockOf(session.endIso)}`;
    const branch = session.branches[0] ? ` (${session.branches[0]})` : "";
    const evidence = pullRequest
      ? `${session.substantiveCount} commit(s) entre ${window} em ${session.repositoryName}${branch}, entregues no PR #${pullRequest.id}.`
      : `${session.substantiveCount} commit(s) entre ${window} em ${session.repositoryName}${branch}. ${session.basis}`;

    items.push({
      id: crypto.randomUUID(),
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      description,
      minutes: roundToQuarter(session.minutes),
      estimatedMinutes: roundToQuarter(session.minutes),
      startsAt: session.startIso,
      billable: project.billable && defaultBillable,
      azureWorkItemId: workItemId,
      azureWorkItemTitle: null,
      source: pullRequest ? "pull_request" : "commits",
      confidence: commitSessionConfidence(session),
      evidence,
    });

    sessionItems += 1;
    claimedSessionIds.add(session.id);
    if (workItemId !== null) coveredWorkItemIds.add(workItemId);
  }

  // A pull request merged today whose commits landed on other days still cost
  // review, merge and deploy time.
  for (const pullRequest of pullRequests) {
    if (pullRequest.status !== "completed") continue;

    const matched = sessionsByPullRequest.get(pullRequest.id) ?? [];
    if (matched.some((session) => claimedSessionIds.has(session.id))) continue;

    const project = matchProjectForAzureProject(
      projects,
      pullRequest.projectName,
    );
    if (!project) continue;

    const workItemId = pullRequest.workItemIds[0] ?? null;
    if (workItemId !== null && coveredWorkItemIds.has(workItemId)) continue;

    if (
      dismissed.has(
        buildRadarFingerprint(
          "pr_completed",
          date,
          project.id,
          `pr${pullRequest.id}`,
        ),
      )
    ) {
      continue;
    }

    const description = truncateDescription(
      `PR #${pullRequest.id} — ${pullRequest.title}`,
    );
    if (alreadyLogged.has(normalize(description))) continue;

    const estimate = estimateFromSessions(matched);

    items.push({
      id: crypto.randomUUID(),
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      description,
      minutes: roundToQuarter(estimate?.minutes ?? PR_WITHOUT_COMMITS_MINUTES),
      estimatedMinutes: roundToQuarter(
        estimate?.minutes ?? PR_WITHOUT_COMMITS_MINUTES,
      ),
      startsAt: pullRequest.closedAt,
      billable: project.billable && defaultBillable,
      azureWorkItemId: workItemId,
      azureWorkItemTitle: null,
      source: "pull_request",
      confidence: estimate ? "medium" : "low",
      evidence: estimate
        ? `PR #${pullRequest.id} concluído. ${estimate.basis}`
        : `PR #${pullRequest.id} concluído, sem commits seus neste dia — revisão, merge e deploy. Ajuste se o trabalho foi em outro dia.`,
    });

    if (workItemId !== null) coveredWorkItemIds.add(workItemId);
  }

  // ── 3. Work items assigned to you, as a lighter nudge ──
  for (const proposal of workItemProposals) {
    if (proposal.date !== date) continue;
    if (
      proposal.azureWorkItemId !== null &&
      coveredWorkItemIds.has(proposal.azureWorkItemId)
    ) {
      continue;
    }
    if (alreadyLogged.has(normalize(proposal.description))) continue;

    items.push({
      id: crypto.randomUUID(),
      projectId: proposal.projectId,
      projectName: proposal.projectName,
      projectColor: proposal.projectColor,
      description: proposal.description,
      minutes: roundToQuarter(proposal.durationMinutes),
      estimatedMinutes: roundToQuarter(proposal.durationMinutes),
      startsAt: null,
      billable: proposal.billable,
      azureWorkItemId: proposal.azureWorkItemId,
      azureWorkItemTitle: proposal.azureWorkItemTitle,
      source: "work_item",
      confidence: proposal.confidence,
      evidence: proposal.reasons[0] ?? proposal.durationBasis,
    });

    if (proposal.azureWorkItemId !== null) {
      coveredWorkItemIds.add(proposal.azureWorkItemId);
    }
  }

  // ── 4. Pattern fill: close the remaining gap with the weekday habit ──
  const committed = items.reduce((sum, item) => sum + item.minutes, 0);
  const remainder = gapMinutes - committed;

  if (remainder >= 30) {
    const pattern = patterns[0];
    const project = pattern
      ? projects.find((item) => item.id === pattern.projectId)
      : defaultProject;

    if (project) {
      items.push({
        id: crypto.randomUUID(),
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        description:
          pattern?.description ?? "Desenvolvimento e atividades do dia",
        minutes: roundToQuarter(remainder),
        estimatedMinutes: roundToQuarter(remainder),
        startsAt: null,
        billable: project.billable && defaultBillable,
        azureWorkItemId: null,
        azureWorkItemTitle: null,
        source: "pattern",
        confidence: "low",
        evidence: pattern
          ? `Seu padrão neste dia da semana: ${pattern.weight}× "${pattern.description.slice(0, 60)}" em ${project.name}.`
          : `Bloco para completar o dia em ${project.name} — ajuste como preferir.`,
      });
    }
  }

  // ── 5. Fit the plan to the day ──
  const ranked = [...items].sort(
    (a, b) =>
      CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
      Number(a.source === "pattern") - Number(b.source === "pattern") ||
      b.minutes - a.minutes,
  );

  const finalItems = orderChronologically(
    fitToGap(ranked.slice(0, MAX_PLAN_ITEMS), gapMinutes),
  );

  return {
    ...basePlan,
    items: finalItems,
    planMinutes: finalItems.reduce((sum, item) => sum + item.minutes, 0),
  };
}

// ─── Fitting ──────────────────────────────────────────

function totalMinutes(items: DayPlanItem[]): number {
  return items.reduce((sum, item) => sum + item.minutes, 0);
}

/**
 * Shrinks a set of estimates to a budget, keeping their relative weight.
 *
 * Quarter-hour granularity is preserved by flooring every share and handing
 * the leftover quarters to whoever lost the most in the rounding — so the
 * shares still add up to the budget exactly.
 */
function scaleToBudget(items: DayPlanItem[], budget: number): DayPlanItem[] {
  const current = totalMinutes(items);
  if (current <= 0) return items;

  const ratio = budget / current;
  const shares = items.map((item) =>
    Math.max(MIN_ITEM_MINUTES, item.minutes * ratio),
  );

  const minutes = shares.map((share) =>
    Math.max(
      MIN_ITEM_MINUTES,
      Math.floor(share / MIN_ITEM_MINUTES) * MIN_ITEM_MINUTES,
    ),
  );

  // Hand out whatever the flooring left over, biggest loser first.
  const byRemainder = shares
    .map((share, index) => ({ index, lost: share - (minutes[index] ?? 0) }))
    .sort((a, b) => b.lost - a.lost);

  let spare = budget - minutes.reduce((sum, value) => sum + value, 0);

  for (const { index } of byRemainder) {
    if (spare < MIN_ITEM_MINUTES) break;
    minutes[index] = (minutes[index] ?? 0) + MIN_ITEM_MINUTES;
    spare -= MIN_ITEM_MINUTES;
  }

  // The MIN_ITEM_MINUTES floor can push the total back over the budget; take
  // it out of the largest shares, which can afford it.
  while (spare < 0) {
    const candidates = minutes
      .map((value, index) => ({ index, value }))
      .filter((entry) => entry.value > MIN_ITEM_MINUTES)
      .sort((a, b) => b.value - a.value);

    const biggest = candidates[0];
    if (!biggest) break;

    minutes[biggest.index] = biggest.value - MIN_ITEM_MINUTES;
    spare += MIN_ITEM_MINUTES;
  }

  return items.map((item, index) => ({
    ...item,
    minutes: minutes[index] ?? item.minutes,
  }));
}

/**
 * Fits the day plan into the hours still missing.
 *
 * Meetings are measured, not estimated — a 45-minute call was 45 minutes, and
 * shrinking it would be a lie. Everything else is inferred from evidence, so
 * the inferences absorb the difference together and in proportion: a day whose
 * activity adds up to nine hours becomes the same day at six, with every
 * stretch of work still on screen. Dropping the smallest items instead would
 * hide real work — exactly what this plan exists to surface.
 */
function fitToGap(items: DayPlanItem[], gapMinutes: number): DayPlanItem[] {
  const measured = items.filter((item) => MEASURED_SOURCES.has(item.source));
  const estimated = items.filter((item) => !MEASURED_SOURCES.has(item.source));

  if (estimated.length === 0) return items;

  const budget = Math.max(0, gapMinutes - totalMinutes(measured));
  if (budget < MIN_ITEM_MINUTES) return measured;
  if (totalMinutes(estimated) <= budget) return items;

  // Below one quarter-hour each there is nothing left to scale: the least
  // confident estimates step aside so the rest stay readable.
  const kept = [...estimated];
  while (kept.length > 1 && kept.length * MIN_ITEM_MINUTES > budget) {
    kept.pop();
  }

  const scaled = new Map(
    scaleToBudget(kept, budget).map((item) => [item.id, item]),
  );

  return items.flatMap((item) => {
    if (MEASURED_SOURCES.has(item.source)) return [item];

    const match = scaled.get(item.id);
    return match ? [match] : [];
  });
}

/** Reads as a timeline: anchored items in order, the rest after them. */
function orderChronologically(items: DayPlanItem[]): DayPlanItem[] {
  return [...items].sort((a, b) => {
    if (a.startsAt && b.startsAt) return a.startsAt.localeCompare(b.startsAt);
    if (a.startsAt) return -1;
    if (b.startsAt) return 1;
    return 0;
  });
}

// ─── AI refinement ────────────────────────────────────────────────────

const refinementSchema = z.object({
  note: z.string().max(240).optional(),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        description: z.string().min(3).max(200),
        minutes: z.number().int().min(1).max(480),
      }),
    )
    .max(MAX_PLAN_ITEMS),
});

const REFINE_SYSTEM_PROMPT = `Você é o revisor de lançamentos de horas do OptSolv Time Tracker.
Recebe um plano de dia proposto (JSON) e devolve APENAS um JSON válido, sem markdown, no formato:
{"note": "frase curta sobre o dia", "items": [{"id": "...", "description": "...", "minutes": 60}]}

Regras invioláveis:
- Mantenha exatamente os mesmos itens (mesmos "id") — nunca adicione ou remova itens.
- Ajuste apenas "description" (português profissional, específica, máx. 140 caracteres, sem emojis) e "minutes" (múltiplos de 15).
- A soma de "minutes" não pode ultrapassar o limite informado.
- Não invente detalhes que não estejam nas evidências.
- Para "teams_call", mantenha exatamente a descrição e os minutos recebidos.

Como ler o campo "origem":
- "calendar": reunião real da agenda — descreva o encontro, não a tarefa.
- "teams_attendance": duração da presença real na sala; não altere os minutos medidos.
- "teams_call": chamada direta/ad-hoc do Teams; participação medida, projeto apenas sugerido.
- "document": modificação pontual de arquivo; nunca afirme duração contínua de edição.
- "pull_request": PR concluído ou em revisão — cite o que foi entregue.
- "commits": código versionado sem PR (branch de trabalho, correções, spikes) — descreva o que foi implementado.
- "work_item": task atribuída no Azure DevOps.
- "pattern": bloco do hábito da pessoa naquele dia da semana — mantenha genérico e honesto.`;

/** Extracts the first JSON object from a possibly noisy model answer. */
function extractJson(text: string): string | null {
  const cleaned = text.replace(/```(?:json)?/gi, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  return cleaned.slice(start, end + 1);
}

/**
 * Optional AI pass: better prose, balanced minutes — same items, same
 * projects, same evidence. Returns the original plan on ANY failure.
 */
export async function refineDayPlanWithAI(plan: DayPlan): Promise<DayPlan> {
  if (plan.items.length === 0) return plan;

  const payload = {
    data: plan.date,
    limiteMinutos: plan.planMinutes,
    itens: plan.items.map((item) => ({
      id: item.id,
      projeto: item.projectName,
      description: item.description,
      minutes: item.minutes,
      origem: item.source,
      evidencia: item.evidence,
    })),
  };

  const completion = await completeText({
    system: REFINE_SYSTEM_PROMPT,
    prompt: JSON.stringify(payload),
    timeoutMs: 15_000,
  });

  if (!completion) return plan;

  try {
    const raw = extractJson(completion.text);
    if (!raw) return plan;

    const parsed = refinementSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return plan;

    const byId = new Map(plan.items.map((item) => [item.id, item]));
    if (parsed.data.items.length !== plan.items.length) return plan;

    let total = 0;
    const refinedItems: DayPlanItem[] = [];

    for (const refined of parsed.data.items) {
      const original = byId.get(refined.id);
      if (!original) return plan;

      const minutes = MEASURED_SOURCES.has(original.source)
        ? original.minutes
        : Math.round(refined.minutes / MIN_ITEM_MINUTES) * MIN_ITEM_MINUTES;
      total += minutes;

      refinedItems.push({
        ...original,
        description:
          original.source === "teams_call"
            ? original.description
            : refined.description.trim(),
        minutes,
      });
    }

    // The model rebalances inside what the deterministic plan already fitted
    // to the day; it never gets to grow the total. One slot of drift is fine.
    if (total > plan.planMinutes + MIN_ITEM_MINUTES) return plan;

    return {
      ...plan,
      items: refinedItems,
      planMinutes: total,
      refinedBy: completion.provider,
      narrative: parsed.data.note?.trim() || null,
    };
  } catch {
    return plan;
  }
}
