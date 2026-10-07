import { differenceInMinutes } from "date-fns";
import { describeTeamCall } from "@/lib/collaboration/calls";
import type { TeamCallSignal } from "@/types/collaboration";
import type {
  SuggestionConfidence,
  TimeSuggestion,
  TimeSuggestionActivitySummary,
  TimeSuggestionKind,
  TimeSuggestionWorkItem,
} from "@/types/time-suggestions";

export interface NormalizedCommitActivity {
  id: string;
  projectName: string;
  repositoryName: string;
  commitId: string;
  message: string;
  comment: string;
  branch: string | null;
  authorEmail: string | null;
  timestamp: string;
  workItemIds: number[];
  url?: string | null;
}

export interface NormalizedOutlookActivity {
  id: string;
  subject: string;
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
}

export interface RecentEntryActivity {
  date: string;
  projectId: string;
  projectName: string;
  duration: number;
  azureWorkItemId: number | null;
  description: string;
}

/** Title/type/state of a referenced Azure DevOps task, when it could be read. */
export interface WorkItemDetails {
  title: string;
  type?: string | null;
  state?: string | null;
}

export type CandidateSuggestion = TimeSuggestion;

interface InternalProject {
  id: string;
  name: string;
  billable: boolean;
  azureProjectId: string | null;
  color?: string | null;
}

interface BuildSuggestionsInput {
  date: string;
  commits: NormalizedCommitActivity[];
  meetings: NormalizedOutlookActivity[];
  calls?: TeamCallSignal[];
  projects: InternalProject[];
  recentEntries: RecentEntryActivity[];
  existingEntries: RecentEntryActivity[];
  organizationUrl?: string | null;
  /** Resolved Azure DevOps tasks keyed by id; missing ids fall back to commit text. */
  workItems?: ReadonlyMap<number, WorkItemDetails>;
  weights?: {
    commitBoost?: number;
    meetingBoost?: number;
    recencyBoost?: number;
  };
}

/** Commits further apart than this start a new work session. */
const SESSION_GAP_MINUTES = 90;
/** Lead time credited before the first commit of every session. */
const SESSION_LEAD_MINUTES = 15;
/** Upper bound of suggestions returned for a single day. */
const MAX_SUGGESTIONS = 24;

const MERGE_COMMIT_PATTERN =
  /^(merge (branch|pull request|remote-tracking branch|commit|tag)\b|merged pr \d+)/i;

interface CommitGroup {
  kind: Extract<TimeSuggestionKind, "work_item" | "work_session">;
  project: InternalProject | null;
  projectLabel: string;
  workItemId: number | null;
  commits: NormalizedCommitActivity[];
}

export function isMergeCommitMessage(message: string): boolean {
  return MERGE_COMMIT_PATTERN.test(message.trim());
}

function toTime(timestamp: string): number {
  const time = new Date(timestamp).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function sortAscending(
  commits: NormalizedCommitActivity[],
): NormalizedCommitActivity[] {
  return [...commits].sort((a, b) => toTime(a.timestamp) - toTime(b.timestamp));
}

/** The same commit can arrive twice when two projects share an Azure project. */
function dedupeCommits(
  commits: NormalizedCommitActivity[],
): NormalizedCommitActivity[] {
  const byId = new Map<string, NormalizedCommitActivity>();
  for (const commit of commits) {
    if (!byId.has(commit.id)) byId.set(commit.id, commit);
  }
  return [...byId.values()];
}

/** Splits chronologically sorted commits wherever the gap exceeds the session limit. */
function splitIntoSessions(
  commits: NormalizedCommitActivity[],
): NormalizedCommitActivity[][] {
  const sorted = sortAscending(commits);
  if (sorted.length === 0) return [];

  const sessions: NormalizedCommitActivity[][] = [];
  let current: NormalizedCommitActivity[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const next = sorted[i];
    const gap = Math.abs(
      differenceInMinutes(
        new Date(next.timestamp),
        new Date(previous.timestamp),
      ),
    );

    if (gap <= SESSION_GAP_MINUTES) {
      current.push(next);
      continue;
    }

    sessions.push(current);
    current = [next];
  }

  sessions.push(current);
  return sessions;
}

function confidenceFromScore(score: number): SuggestionConfidence {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function normalizeName(value: string): string {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function parseProjectFromCommit(
  commit: NormalizedCommitActivity,
  projects: InternalProject[],
): InternalProject | null {
  const target = normalizeName(commit.projectName);
  return (
    projects.find((project) => normalizeName(project.name) === target) ?? null
  );
}

function buildFingerprint(parts: Array<string | number | null | undefined>) {
  return parts
    .map((part) => String(part ?? ""))
    .join("|")
    .toLocaleLowerCase("pt-BR")
    .slice(0, 240);
}

function hasVerySimilarEntry(
  existingEntries: RecentEntryActivity[],
  suggestion: {
    projectId: string | null;
    azureWorkItemId: number | null;
    description: string;
    duration: number;
    date: string;
  },
) {
  return existingEntries.some((entry) => {
    if (entry.date !== suggestion.date) return false;

    const sameProject = suggestion.projectId
      ? entry.projectId === suggestion.projectId
      : true;
    const sameWorkItem = suggestion.azureWorkItemId
      ? entry.azureWorkItemId === suggestion.azureWorkItemId
      : true;

    const normalizedEntryDescription = entry.description
      .trim()
      .toLocaleLowerCase("pt-BR");
    const normalizedSuggestionDescription = suggestion.description
      .trim()
      .toLocaleLowerCase("pt-BR");

    const similarDescription =
      normalizedSuggestionDescription.length > 0 &&
      (normalizedEntryDescription.includes(normalizedSuggestionDescription) ||
        normalizedSuggestionDescription.includes(normalizedEntryDescription));

    // Do not require close duration here: heuristics may round durations differently
    // while still referring to an already registered activity.
    return sameProject && sameWorkItem && similarDescription;
  });
}

function getRecencyProjectMap(entries: RecentEntryActivity[]) {
  const scoreByProject = new Map<string, number>();

  for (const entry of entries) {
    const current = scoreByProject.get(entry.projectId) ?? 0;
    scoreByProject.set(entry.projectId, current + 1);
  }

  return scoreByProject;
}

function roundToStandardDuration(minutes: number): number {
  const clamped = Math.max(15, Math.min(8 * 60, minutes));
  return Math.max(15, Math.round(clamped / 15) * 15);
}

function getMedian(values: number[]): number {
  if (values.length === 0) return 60;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }

  return sorted[mid];
}

function getTopRecentDuration(entries: RecentEntryActivity[]): number {
  if (entries.length === 0) return 60;
  const durations = entries
    .map((entry) => entry.duration)
    .filter((duration) => duration >= 15 && duration <= 8 * 60)
    .slice(0, 20);

  if (durations.length === 0) return 60;

  return roundToStandardDuration(getMedian(durations));
}

function buildWorkItemUrl(
  organizationUrl: string | null | undefined,
  commits: NormalizedCommitActivity[],
  workItemId: number | null,
): string | null {
  if (!workItemId) return null;
  if (organizationUrl) {
    const base = organizationUrl.replace(/\/$/, "");
    return `${base}/_workitems/edit/${workItemId}`;
  }
  for (const c of commits) {
    if (c.url) {
      try {
        const urlObj = new URL(c.url);
        const parts = urlObj.pathname.split("/_git/");
        if (parts.length > 1) {
          return `${urlObj.origin}${parts[0]}/_workitems/edit/${workItemId}`;
        }
      } catch {
        // A malformed commit URL only costs the deep link.
      }
    }
  }
  return null;
}

function buildActivitySummary(
  commits: NormalizedCommitActivity[],
): TimeSuggestionActivitySummary | null {
  if (commits.length === 0) {
    return null;
  }

  const orderedCommits = [...commits].sort(
    (a, b) => toTime(b.timestamp) - toTime(a.timestamp),
  );
  const repositories = Array.from(
    new Set(orderedCommits.map((commit) => commit.repositoryName)),
  );

  return {
    totalCommits: orderedCommits.length,
    repositoryCount: repositories.length,
    repositories,
    startedAt: orderedCommits[orderedCommits.length - 1]?.timestamp ?? null,
    endedAt: orderedCommits[0]?.timestamp ?? null,
    commits: orderedCommits.map((commit) => ({
      id: commit.id,
      commitId: commit.commitId,
      repositoryName: commit.repositoryName,
      projectName: commit.projectName,
      message: commit.message,
      branch: commit.branch,
      timestamp: commit.timestamp,
      workItemIds: commit.workItemIds,
      url: commit.url ?? null,
      isMerge: isMergeCommitMessage(commit.message),
    })),
  };
}

/** Latest meaningful commit message: merges never name a block of work. */
function pickHeadline(commits: NormalizedCommitActivity[]): string | null {
  const newestFirst = [...commits].sort(
    (a, b) => toTime(b.timestamp) - toTime(a.timestamp),
  );
  const meaningful = newestFirst.find(
    (commit) => commit.message.trim() && !isMergeCommitMessage(commit.message),
  );
  return (meaningful ?? newestFirst[0])?.message.trim() || null;
}

/**
 * Sum of the active windows of each session, so a task touched in the morning
 * and again in the afternoon does not get credited for the idle gap between.
 */
function estimateGroupMinutes(
  commits: NormalizedCommitActivity[],
  defaultDuration: number,
): number {
  const sessions = splitIntoSessions(commits);
  const activeMinutes = sessions.reduce((total, session) => {
    const first = new Date(session[0].timestamp);
    const last = new Date(session[session.length - 1].timestamp);
    return (
      total +
      Math.max(0, differenceInMinutes(last, first)) +
      SESSION_LEAD_MINUTES
    );
  }, 0);

  const floor =
    commits.length === 1
      ? Math.min(defaultDuration, 45)
      : Math.min(defaultDuration, 60);

  return roundToStandardDuration(Math.max(activeMinutes, floor));
}

function minutesBetween(
  commit: NormalizedCommitActivity,
  group: CommitGroup,
): number {
  const time = toTime(commit.timestamp);
  return Math.min(
    ...group.commits.map(
      (candidate) => Math.abs(toTime(candidate.timestamp) - time) / 60_000,
    ),
  );
}

/**
 * Groups one project's commits: by referenced task first, then the remaining
 * commits by work session. Merge commits without a task join the closest group
 * of the same project instead of becoming a suggestion of their own.
 */
function groupProjectCommits(
  project: InternalProject | null,
  projectLabel: string,
  commits: NormalizedCommitActivity[],
): CommitGroup[] {
  const byWorkItem = new Map<number, NormalizedCommitActivity[]>();
  const loose: NormalizedCommitActivity[] = [];
  const looseMerges: NormalizedCommitActivity[] = [];

  for (const commit of sortAscending(commits)) {
    const workItemId = commit.workItemIds[0];
    if (workItemId !== undefined) {
      const bucket = byWorkItem.get(workItemId) ?? [];
      bucket.push(commit);
      byWorkItem.set(workItemId, bucket);
    } else if (isMergeCommitMessage(commit.message)) {
      looseMerges.push(commit);
    } else {
      loose.push(commit);
    }
  }

  const groups: CommitGroup[] = [
    ...[...byWorkItem.entries()].map(
      ([workItemId, items]): CommitGroup => ({
        kind: "work_item",
        project,
        projectLabel,
        workItemId,
        commits: items,
      }),
    ),
    ...splitIntoSessions(loose).map(
      (items): CommitGroup => ({
        kind: "work_session",
        project,
        projectLabel,
        workItemId: null,
        commits: items,
      }),
    ),
  ];

  const orphanMerges: NormalizedCommitActivity[] = [];
  for (const merge of looseMerges) {
    let closest: CommitGroup | null = null;
    let closestDistance = Number.POSITIVE_INFINITY;

    for (const group of groups) {
      const distance = minutesBetween(merge, group);
      if (distance < closestDistance) {
        closest = group;
        closestDistance = distance;
      }
    }

    if (closest && closestDistance <= SESSION_GAP_MINUTES) {
      closest.commits.push(merge);
    } else {
      orphanMerges.push(merge);
    }
  }

  for (const items of splitIntoSessions(orphanMerges)) {
    groups.push({
      kind: "work_session",
      project,
      projectLabel,
      workItemId: null,
      commits: items,
    });
  }

  return groups;
}

interface CommitSuggestionContext {
  date: string;
  defaultDuration: number;
  existingEntries: RecentEntryActivity[];
  organizationUrl?: string | null;
  recencyByProject: Map<string, number>;
  workItems?: ReadonlyMap<number, WorkItemDetails>;
  commitBoost: number;
  recencyBoost: number;
}

function buildCommitSuggestion(
  group: CommitGroup,
  context: CommitSuggestionContext,
): CandidateSuggestion | null {
  const { date, workItems } = context;
  const commits = sortAscending(group.commits);
  const linkedProject = group.project;
  const workItemId = group.workItemId;
  const details = workItemId ? workItems?.get(workItemId) : undefined;
  const workItemTitle = details?.title?.trim() || null;
  const headline = pickHeadline(commits);
  const onlyMerges = commits.every((commit) =>
    isMergeCommitMessage(commit.message),
  );
  const recency = linkedProject
    ? (context.recencyByProject.get(linkedProject.id) ?? 0)
    : 0;

  let score = 0.4 + context.commitBoost;
  const reasons: string[] = [];

  if (group.kind === "work_item" && workItemId) {
    score += 0.25;
    reasons.push(
      `${commits.length} commit${commits.length === 1 ? "" : "s"} referencia${commits.length === 1 ? "" : "m"} a tarefa #${workItemId}.`,
    );
    if (workItemTitle) score += 0.05;
  } else if (onlyMerges) {
    score -= 0.15;
    reasons.push("Apenas integrações de branch, sem tarefa vinculada.");
  } else {
    reasons.push(
      commits.length === 1
        ? "Commit sem tarefa vinculada."
        : `${commits.length} commits próximos no tempo, sem tarefa vinculada.`,
    );
  }

  if (linkedProject) {
    score += 0.15;
    reasons.push(
      `Projeto identificado pelo repositório: ${linkedProject.name}.`,
    );
  }

  if (commits.length > 1) {
    score += 0.05;
  }

  if (recency > 0) {
    score += 0.1 + context.recencyBoost;
    reasons.push("Projeto presente no seu histórico recente.");
  }

  if (commits.length === 1) {
    reasons.push("Commit único: estimativa conservadora de duração.");
  }

  score = Math.min(1, Math.max(0, score));

  const newestFirst = [...commits].sort(
    (a, b) => toTime(b.timestamp) - toTime(a.timestamp),
  );
  const description =
    group.kind === "work_item"
      ? (workItemTitle ?? headline ?? `Trabalho na tarefa #${workItemId}`)
      : newestFirst[0]?.message?.trim() || "Bloco de desenvolvimento";

  const title =
    group.kind === "work_item"
      ? workItemTitle
        ? `Tarefa #${workItemId} — ${workItemTitle}`
        : headline
          ? `Tarefa #${workItemId} — ${headline}`
          : `Tarefa #${workItemId} — ${linkedProject?.name ?? group.projectLabel}`
      : commits.length > 1
        ? `Bloco de desenvolvimento — ${linkedProject?.name ?? group.projectLabel}`
        : `Commit: ${description}`;

  const duration = estimateGroupMinutes(commits, context.defaultDuration);

  if (
    hasVerySimilarEntry(context.existingEntries, {
      projectId: linkedProject?.id ?? null,
      azureWorkItemId: workItemId,
      description,
      duration,
      date,
    })
  ) {
    return null;
  }

  const loggedMinutes =
    workItemId && linkedProject
      ? context.existingEntries
          .filter(
            (entry) =>
              entry.date === date &&
              entry.projectId === linkedProject.id &&
              entry.azureWorkItemId === workItemId,
          )
          .reduce((total, entry) => total + entry.duration, 0)
      : 0;

  const workItemUrl = buildWorkItemUrl(
    context.organizationUrl,
    commits,
    workItemId,
  );
  const azureWorkItemTitle = workItemId
    ? (workItemTitle ?? `Work Item #${workItemId}`)
    : null;
  const workItem: TimeSuggestionWorkItem | null = workItemId
    ? {
        id: workItemId,
        title: workItemTitle,
        type: details?.type ?? null,
        state: details?.state ?? null,
        url: workItemUrl,
      }
    : null;

  return {
    fingerprint: buildFingerprint([
      date,
      "commit",
      group.kind,
      linkedProject?.id ?? group.projectLabel,
      workItemId ?? commits[0]?.id,
    ]),
    kind: group.kind,
    projectId: linkedProject?.id ?? null,
    projectName: linkedProject?.name ?? group.projectLabel,
    projectColor: linkedProject?.color ?? null,
    title,
    description,
    date,
    duration,
    billable: linkedProject?.billable ?? true,
    azureWorkItemId: workItemId,
    azureWorkItemTitle,
    azureWorkItemUrl: workItemUrl,
    workItem,
    loggedMinutes,
    score,
    confidence: confidenceFromScore(score),
    reasons,
    sourceBreakdown: {
      commits: commits.length,
      meetings: 0,
      recency,
    },
    activitySummary: buildActivitySummary(commits),
    payload: linkedProject
      ? {
          projectId: linkedProject.id,
          description,
          date,
          duration,
          billable: linkedProject.billable,
          azureWorkItemId: workItemId ?? undefined,
          azureWorkItemTitle: azureWorkItemTitle ?? undefined,
        }
      : null,
  };
}

export function buildDeterministicSuggestions({
  date,
  commits,
  meetings,
  calls = [],
  projects,
  recentEntries,
  existingEntries,
  organizationUrl,
  workItems,
  weights,
}: BuildSuggestionsInput): CandidateSuggestion[] {
  const recencyByProject = getRecencyProjectMap(recentEntries);
  const defaultDuration = getTopRecentDuration(recentEntries);
  const commitBoost = weights?.commitBoost ?? 0;
  const meetingBoost = weights?.meetingBoost ?? 0;
  const recencyBoost = weights?.recencyBoost ?? 0;

  const candidates: CandidateSuggestion[] = [];

  for (const call of calls) {
    if (call.alreadyLogged || call.minutes < 1) continue;

    const description = describeTeamCall(call);
    const suggestion = {
      projectId: null,
      azureWorkItemId: null,
      description,
      duration: call.minutes,
      date,
    };

    if (hasVerySimilarEntry(existingEntries, suggestion)) {
      continue;
    }

    candidates.push({
      fingerprint: `teams_call:${call.id}`,
      kind: "call",
      projectId: null,
      projectName: null,
      description,
      date,
      duration: call.minutes,
      billable: true,
      azureWorkItemId: null,
      azureWorkItemTitle: null,
      azureWorkItemUrl: null,
      score: 0.82,
      confidence: "high",
      reasons: [
        `Participação medida no Teams por ${call.minutes} minuto${call.minutes === 1 ? "" : "s"}.`,
        "Escolha o projeto antes de lançar; o sistema não infere projeto pela outra pessoa da chamada.",
      ],
      sourceBreakdown: {
        commits: 0,
        meetings: 0,
        calls: 1,
        recency: 0,
      },
      activitySummary: null,
      payload: null,
    });
  }

  // Meetings never absorb commits: coding during a meeting says nothing about
  // which project the meeting belongs to, so the project is left for the user.
  for (const meeting of meetings) {
    const score = Math.min(1, Math.max(0.5, 0.78 + meetingBoost));
    const description = meeting.subject || "Reunião";
    const duration = Math.max(15, meeting.durationMinutes);

    if (
      hasVerySimilarEntry(existingEntries, {
        projectId: null,
        azureWorkItemId: null,
        description,
        duration,
        date,
      })
    ) {
      continue;
    }

    candidates.push({
      fingerprint: buildFingerprint([
        date,
        "meeting",
        meeting.id,
        meeting.subject,
      ]),
      kind: "meeting",
      projectId: null,
      projectName: null,
      description,
      date,
      duration,
      billable: true,
      azureWorkItemId: null,
      azureWorkItemTitle: null,
      azureWorkItemUrl: null,
      score,
      confidence: confidenceFromScore(score),
      reasons: [
        "Evento do Outlook considerado sinal de alta confiança.",
        "Escolha o projeto antes de lançar; commits feitos durante a reunião não definem o projeto dela.",
      ],
      sourceBreakdown: {
        commits: 0,
        meetings: 1,
        recency: 0,
      },
      activitySummary: null,
      payload: null,
    });
  }

  const commitsByProject = new Map<
    string,
    {
      project: InternalProject | null;
      label: string;
      commits: NormalizedCommitActivity[];
    }
  >();

  for (const commit of dedupeCommits(commits)) {
    const project = parseProjectFromCommit(commit, projects);
    const key = project?.id ?? `azure:${normalizeName(commit.projectName)}`;
    const bucket = commitsByProject.get(key) ?? {
      project,
      label: project?.name ?? commit.projectName,
      commits: [],
    };
    bucket.commits.push(commit);
    commitsByProject.set(key, bucket);
  }

  const context: CommitSuggestionContext = {
    date,
    defaultDuration,
    existingEntries,
    organizationUrl,
    recencyByProject,
    workItems,
    commitBoost,
    recencyBoost,
  };

  for (const bucket of commitsByProject.values()) {
    for (const group of groupProjectCommits(
      bucket.project,
      bucket.label,
      bucket.commits,
    )) {
      const suggestion = buildCommitSuggestion(group, context);
      if (suggestion) candidates.push(suggestion);
    }
  }

  const deduped = new Map<string, CandidateSuggestion>();

  for (const candidate of candidates) {
    const dedupeKey =
      candidate.kind === "meeting"
        ? buildFingerprint([candidate.date, candidate.description.slice(0, 80)])
        : candidate.fingerprint;

    const current = deduped.get(dedupeKey);
    if (!current || current.score < candidate.score) {
      deduped.set(dedupeKey, candidate);
    }
  }

  return [...deduped.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_SUGGESTIONS);
}
