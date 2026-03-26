import { addMinutes, differenceInMinutes, max, min } from "date-fns";

export type SuggestionConfidence = "high" | "medium" | "low";

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

export interface CandidateSuggestion {
  fingerprint: string;
  projectId: string | null;
  projectName: string | null;
  description: string;
  date: string;
  duration: number;
  billable: boolean;
  azureWorkItemId: number | null;
  azureWorkItemTitle: string | null;
  score: number;
  confidence: SuggestionConfidence;
  reasons: string[];
  sourceBreakdown: {
    commits: number;
    meetings: number;
    recency: number;
  };
  payload: {
    projectId: string;
    description: string;
    date: string;
    duration: number;
    billable: boolean;
    azureWorkItemId?: number;
    azureWorkItemTitle?: string;
  } | null;
}

interface InternalProject {
  id: string;
  name: string;
  billable: boolean;
  azureProjectId: string | null;
}

interface BuildSuggestionsInput {
  date: string;
  commits: NormalizedCommitActivity[];
  meetings: NormalizedOutlookActivity[];
  projects: InternalProject[];
  recentEntries: RecentEntryActivity[];
  existingEntries: RecentEntryActivity[];
  weights?: {
    commitBoost?: number;
    meetingBoost?: number;
    recencyBoost?: number;
  };
}

function groupCommits(commits: NormalizedCommitActivity[]) {
  if (commits.length === 0) return [] as NormalizedCommitActivity[][];

  const sorted = [...commits].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
  );

  const groups: NormalizedCommitActivity[][] = [];
  let current: NormalizedCommitActivity[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const previous = sorted[i - 1];
    const next = sorted[i];
    const diffMinutes = Math.abs(
      differenceInMinutes(
        new Date(next.timestamp),
        new Date(previous.timestamp),
      ),
    );

    if (diffMinutes <= 90) {
      current.push(next);
      continue;
    }

    groups.push(current);
    current = [next];
  }

  groups.push(current);
  return groups;
}

function confidenceFromScore(score: number): SuggestionConfidence {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

function parseProjectFromCommit(
  commit: NormalizedCommitActivity,
  projects: InternalProject[],
) {
  return (
    projects.find(
      (project) =>
        project.name.toLocaleLowerCase("pt-BR") ===
        commit.projectName.toLocaleLowerCase("pt-BR"),
    ) ?? null
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

function mostFrequentWorkItem(commits: NormalizedCommitActivity[]) {
  const counts = new Map<number, number>();

  for (const commit of commits) {
    for (const workItemId of commit.workItemIds) {
      counts.set(workItemId, (counts.get(workItemId) ?? 0) + 1);
    }
  }

  let winner: number | null = null;
  let winnerScore = 0;

  for (const [workItemId, count] of counts) {
    if (count > winnerScore) {
      winner = workItemId;
      winnerScore = count;
    }
  }

  return winner;
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

export function buildDeterministicSuggestions({
  date,
  commits,
  meetings,
  projects,
  recentEntries,
  existingEntries,
  weights,
}: BuildSuggestionsInput): CandidateSuggestion[] {
  const commitGroups = groupCommits(commits);
  const recencyByProject = getRecencyProjectMap(recentEntries);
  const defaultDuration = getTopRecentDuration(recentEntries);
  const commitBoost = weights?.commitBoost ?? 0;
  const meetingBoost = weights?.meetingBoost ?? 0;
  const recencyBoost = weights?.recencyBoost ?? 0;

  const candidates: CandidateSuggestion[] = [];

  for (const meeting of meetings) {
    const start = new Date(meeting.startDateTime);
    const end = new Date(meeting.endDateTime);

    const overlappingCommits = commits.filter((commit) => {
      const commitTime = new Date(commit.timestamp);
      const windowStart = addMinutes(start, -30);
      const windowEnd = addMinutes(end, 30);
      return commitTime >= windowStart && commitTime <= windowEnd;
    });

    const linkedProject = overlappingCommits
      .map((commit) => parseProjectFromCommit(commit, projects))
      .find(Boolean);

    const linkedWorkItemId = mostFrequentWorkItem(overlappingCommits);

    let score = 0.78 + meetingBoost;
    const reasons: string[] = [
      "Evento do Outlook considerado sinal de alta confianca.",
    ];

    if (overlappingCommits.length > 0) {
      score += 0.2 + commitBoost;
      reasons.push(
        `${overlappingCommits.length} commit(s) aconteceram durante ou perto da reuniao.`,
      );
    }

    if (linkedWorkItemId) {
      score += 0.2;
      reasons.push(`Commit(s) referenciaram Work Item #${linkedWorkItemId}.`);
    }

    if (linkedProject) {
      score += 0.1;
      reasons.push(`Projeto inferido pelos commits: ${linkedProject.name}.`);
    }

    if (linkedProject && (recencyByProject.get(linkedProject.id) ?? 0) > 0) {
      score += 0.05 + recencyBoost;
      reasons.push("Projeto usado recentemente pelo usuario.");
    }

    score = Math.min(1, Math.max(0.78, score));

    const suggestion = {
      projectId: linkedProject?.id ?? null,
      azureWorkItemId: linkedWorkItemId,
      description: meeting.subject || "Reuniao",
      duration: Math.max(15, meeting.durationMinutes),
      date,
    };

    if (hasVerySimilarEntry(existingEntries, suggestion)) {
      continue;
    }

    const confidence = confidenceFromScore(score);

    candidates.push({
      fingerprint: buildFingerprint([
        date,
        "meeting",
        meeting.id,
        linkedProject?.id,
        linkedWorkItemId,
        meeting.subject,
      ]),
      projectId: linkedProject?.id ?? null,
      projectName: linkedProject?.name ?? null,
      description: suggestion.description,
      date,
      duration: suggestion.duration,
      billable: linkedProject?.billable ?? true,
      azureWorkItemId: linkedWorkItemId,
      azureWorkItemTitle: linkedWorkItemId
        ? `Work Item #${linkedWorkItemId}`
        : null,
      score,
      confidence,
      reasons,
      sourceBreakdown: {
        commits: overlappingCommits.length,
        meetings: 1,
        recency: linkedProject
          ? (recencyByProject.get(linkedProject.id) ?? 0)
          : 0,
      },
      payload: linkedProject
        ? {
            projectId: linkedProject.id,
            description: suggestion.description,
            date,
            duration: suggestion.duration,
            billable: linkedProject.billable,
            azureWorkItemId: linkedWorkItemId ?? undefined,
            azureWorkItemTitle: linkedWorkItemId
              ? `Work Item #${linkedWorkItemId}`
              : undefined,
          }
        : null,
    });
  }

  for (const group of commitGroups) {
    const first = new Date(group[0].timestamp);
    const last = new Date(group[group.length - 1].timestamp);
    const windowMinutes = Math.max(15, differenceInMinutes(last, first) + 15);

    const mainCommit = group[group.length - 1];
    const linkedProject = parseProjectFromCommit(mainCommit, projects);
    const linkedWorkItemId = mostFrequentWorkItem(group);

    const overlapsMeeting = meetings.some((meeting) => {
      const meetingStart = new Date(meeting.startDateTime);
      const meetingEnd = new Date(meeting.endDateTime);
      const overlapStart = max([meetingStart, first]);
      const overlapEnd = min([meetingEnd, last]);
      return differenceInMinutes(overlapEnd, overlapStart) > 0;
    });

    let score = 0.35 + commitBoost;
    const reasons: string[] = [
      `${group.length} commit(s) proximos no tempo formaram um bloco de trabalho.`,
    ];

    if (linkedWorkItemId) {
      score += 0.25;
      reasons.push(`Commit(s) referenciaram Work Item #${linkedWorkItemId}.`);
    }

    if (linkedProject) {
      score += 0.15;
      reasons.push(
        `Projeto inferido por repositorio/projeto do commit: ${linkedProject.name}.`,
      );
    }

    if (overlapsMeeting) {
      score += 0.1 + meetingBoost;
      reasons.push(
        "Bloco de commits coincide com horario de reuniao relevante.",
      );
    }

    if (linkedProject && (recencyByProject.get(linkedProject.id) ?? 0) > 0) {
      score += 0.1 + recencyBoost;
      reasons.push("Projeto aparece no historico recente do usuario.");
    }

    score = Math.min(1, Math.max(0, score));

    const description =
      mainCommit.message?.trim() ||
      (linkedWorkItemId
        ? `Trabalho no item #${linkedWorkItemId}`
        : "Bloco de desenvolvimento");

    let rawDuration = Math.max(defaultDuration, windowMinutes);

    if (group.length === 1) {
      // A single commit can represent a short checkpoint, so keep estimate conservative.
      rawDuration = Math.max(windowMinutes, Math.min(defaultDuration, 45));
      reasons.push(
        "Bloco com 1 commit usa estimativa conservadora em blocos padronizados.",
      );
    }

    const duration = roundToStandardDuration(rawDuration);

    const suggestion = {
      projectId: linkedProject?.id ?? null,
      azureWorkItemId: linkedWorkItemId,
      description,
      duration,
      date,
    };

    if (hasVerySimilarEntry(existingEntries, suggestion)) {
      continue;
    }

    const confidence = confidenceFromScore(score);

    candidates.push({
      fingerprint: buildFingerprint([
        date,
        "commit",
        group.map((commit) => commit.id).join("-"),
        linkedProject?.id,
        linkedWorkItemId,
      ]),
      projectId: linkedProject?.id ?? null,
      projectName: linkedProject?.name ?? null,
      description,
      date,
      duration,
      billable: linkedProject?.billable ?? true,
      azureWorkItemId: linkedWorkItemId,
      azureWorkItemTitle: linkedWorkItemId
        ? `Work Item #${linkedWorkItemId}`
        : null,
      score,
      confidence,
      reasons,
      sourceBreakdown: {
        commits: group.length,
        meetings: overlapsMeeting ? 1 : 0,
        recency: linkedProject
          ? (recencyByProject.get(linkedProject.id) ?? 0)
          : 0,
      },
      payload: linkedProject
        ? {
            projectId: linkedProject.id,
            description,
            date,
            duration,
            billable: linkedProject.billable,
            azureWorkItemId: linkedWorkItemId ?? undefined,
            azureWorkItemTitle: linkedWorkItemId
              ? `Work Item #${linkedWorkItemId}`
              : undefined,
          }
        : null,
    });
  }

  // First render should show high confidence suggestions.
  const deduped = new Map<string, CandidateSuggestion>();

  for (const candidate of candidates) {
    const dedupeKey = buildFingerprint([
      candidate.date,
      candidate.projectId,
      candidate.azureWorkItemId,
      candidate.description.slice(0, 80),
    ]);

    const current = deduped.get(dedupeKey);
    if (!current || current.score < candidate.score) {
      deduped.set(dedupeKey, candidate);
    }
  }

  return [...deduped.values()].sort((a, b) => b.score - a.score).slice(0, 8);
}
