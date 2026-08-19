/**
 * Predictive time-logging engine ("zero-friction logging").
 *
 * Cross-references Azure DevOps activity against what the user actually logged
 * over a multi-day window and proposes the missing entries. It is deliberately
 * deterministic and pure: every proposal carries the evidence and the reasoning
 * behind its estimated duration, so the user can audit the number before
 * accepting it.
 *
 * This complements the day-scoped engine in `engine.ts`, which suggests entries
 * for the day the user is already looking at. Here the job is the opposite:
 * finding the work the user forgot about entirely.
 */

import type {
  AutofillEvidence,
  AutofillProposal,
  AutofillSignal,
} from "@/types/autofill";
import type {
  AzureDevOpsAssignedWorkItem,
  AzureDevOpsPullRequest,
} from "@/types/azure-devops";
import type { SuggestionConfidence } from "@/types/time-suggestions";
import type { NormalizedCommitActivity } from "./engine";

/** Work-item states that count as "actively being worked on". */
const ACTIVE_WORK_ITEM_STATES = new Set([
  "active",
  "in progress",
  "doing",
  "committed",
  "em andamento",
  "desenvolvimento",
]);

const MIN_DURATION_MINUTES = 30;
const MAX_DURATION_MINUTES = 480;
/** Padding added to a commit span: work starts before the first commit. */
const COMMIT_SPAN_PADDING_MINUTES = 30;
/** Fallback estimate for a merged PR with no commit trail we can see. */
const PR_FALLBACK_MINUTES = 120;
const MAX_PROPOSALS = 6;

export interface AutofillProject {
  id: string;
  name: string;
  color: string;
  billable: boolean;
  azureProjectId: string | null;
}

export interface AutofillExistingEntry {
  date: string;
  projectId: string;
  duration: number;
  azureWorkItemId: number | null;
  description: string;
}

export interface AutofillDefaults {
  durationMinutes: number;
  billable: boolean;
  dailyTargetMinutes: number;
}

export interface BuildAutofillInput {
  /** Dates to inspect, oldest first, already excluding the future. */
  dates: string[];
  projects: AutofillProject[];
  pullRequests: AzureDevOpsPullRequest[];
  workItems: AzureDevOpsAssignedWorkItem[];
  commits: NormalizedCommitActivity[];
  existingEntries: AutofillExistingEntry[];
  /** Dates inside a submitted/approved timesheet — never proposable. */
  lockedDates: string[];
  /** Fingerprints the user already dismissed. */
  dismissedFingerprints: string[];
  defaults: AutofillDefaults;
  /** Today in the user's timezone, for "only nudge about today" rules. */
  today: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Local calendar date of an ISO timestamp, in YYYY-MM-DD. */
function toLocalDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function clampDuration(minutes: number): number {
  const bounded = Math.min(
    Math.max(minutes, MIN_DURATION_MINUTES),
    MAX_DURATION_MINUTES,
  );
  // Half-hour granularity keeps proposals believable and easy to eyeball.
  return Math.round(bounded / 30) * 30;
}

function matchProjectForAzureProject(
  projects: AutofillProject[],
  azureProjectName: string,
): AutofillProject | null {
  const needle = azureProjectName.trim().toLowerCase();
  if (!needle) return null;

  return (
    projects.find((item) => item.azureProjectId === azureProjectName) ??
    projects.find((item) => item.name.toLowerCase() === needle) ??
    projects.find(
      (item) =>
        item.name.toLowerCase().includes(needle) ||
        needle.includes(item.name.toLowerCase()),
    ) ??
    null
  );
}

/** Minutes between the first and last commit of a set, plus padding. */
function estimateFromCommitSpan(commits: NormalizedCommitActivity[]): {
  minutes: number;
  basis: string;
} | null {
  if (commits.length === 0) return null;

  const times = commits
    .map((commit) => new Date(commit.timestamp).getTime())
    .filter((time) => !Number.isNaN(time))
    .sort((a, b) => a - b);

  const first = times[0];
  const last = times.at(-1);

  if (first === undefined || last === undefined) return null;

  const spanMinutes = Math.round((last - first) / 60_000);
  const minutes = clampDuration(spanMinutes + COMMIT_SPAN_PADDING_MINUTES);

  return {
    minutes,
    basis:
      commits.length === 1
        ? "Estimado a partir de 1 commit, com 30min de preparação."
        : `Estimado pelo intervalo entre o primeiro e o último de ${commits.length} commits, + 30min.`,
  };
}

function scoreFor(
  signal: AutofillSignal,
  hasWorkItem: boolean,
  commitCount: number,
): { score: number; confidence: SuggestionConfidence } {
  let score: number;

  switch (signal) {
    case "pr_completed":
      score = 78;
      break;
    case "commits_unlogged":
      score = 62;
      break;
    case "pr_active":
      score = 48;
      break;
    default:
      score = 34;
      break;
  }

  if (hasWorkItem) score += 8;
  if (commitCount > 0) score += Math.min(commitCount * 3, 12);

  score = Math.min(score, 100);

  const confidence: SuggestionConfidence =
    score >= 75 ? "high" : score >= 50 ? "medium" : "low";

  return { score, confidence };
}

function buildFingerprint(
  signal: AutofillSignal,
  date: string,
  projectId: string,
  reference: string,
): string {
  return `autofill:${signal}:${date}:${projectId}:${reference}`;
}

/** Trims a title so descriptions stay within the 500-char entry limit. */
function truncate(value: string, max = 180): string {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1)}…`;
}

// ─── Engine ──────────────────────────────────────────────────────────

export function buildAutofillProposals(
  input: BuildAutofillInput,
): AutofillProposal[] {
  const {
    dates,
    projects,
    pullRequests,
    workItems,
    commits,
    existingEntries,
    lockedDates,
    dismissedFingerprints,
    defaults,
    today,
  } = input;

  if (projects.length === 0) return [];

  const allowedDates = new Set(dates);
  const locked = new Set(lockedDates);
  const dismissed = new Set(dismissedFingerprints);

  // Indexes of what is already logged, so nothing is proposed twice.
  const minutesByDate = new Map<string, number>();
  const workItemsByDate = new Map<string, Set<number>>();
  const minutesByDateProject = new Map<string, number>();

  for (const entry of existingEntries) {
    minutesByDate.set(
      entry.date,
      (minutesByDate.get(entry.date) ?? 0) + entry.duration,
    );

    const projectKey = `${entry.date}:${entry.projectId}`;
    minutesByDateProject.set(
      projectKey,
      (minutesByDateProject.get(projectKey) ?? 0) + entry.duration,
    );

    if (entry.azureWorkItemId !== null) {
      const bucket = workItemsByDate.get(entry.date) ?? new Set<number>();
      bucket.add(entry.azureWorkItemId);
      workItemsByDate.set(entry.date, bucket);
    }
  }

  const commitsByDate = new Map<string, NormalizedCommitActivity[]>();
  for (const commit of commits) {
    const date = toLocalDate(commit.timestamp);
    if (!allowedDates.has(date)) continue;

    const bucket = commitsByDate.get(date) ?? [];
    bucket.push(commit);
    commitsByDate.set(date, bucket);
  }

  const proposals: AutofillProposal[] = [];
  /** One proposal per date+project keeps the card from repeating itself. */
  const claimed = new Set<string>();

  function canPropose(date: string, projectId: string): boolean {
    if (!allowedDates.has(date)) return false;
    if (locked.has(date)) return false;
    if (claimed.has(`${date}:${projectId}`)) return false;

    // A day already at target needs no help.
    const logged = minutesByDate.get(date) ?? 0;
    return logged < defaults.dailyTargetMinutes;
  }

  function push(proposal: AutofillProposal): void {
    if (dismissed.has(proposal.fingerprint)) return;

    claimed.add(`${proposal.date}:${proposal.projectId}`);
    proposals.push(proposal);
  }

  // ── 1. Completed pull requests: the strongest evidence of finished work ──
  for (const pullRequest of pullRequests) {
    if (pullRequest.status !== "completed" || !pullRequest.closedAt) continue;

    const date = toLocalDate(pullRequest.closedAt);
    const project = matchProjectForAzureProject(
      projects,
      pullRequest.projectName,
    );

    if (!project || !canPropose(date, project.id)) continue;

    // Already logged against one of this PR's work items on that day.
    const loggedWorkItems = workItemsByDate.get(date);
    const alreadyCovered = pullRequest.workItemIds.some((id) =>
      loggedWorkItems?.has(id),
    );
    if (alreadyCovered) continue;

    const dayCommits = (commitsByDate.get(date) ?? []).filter(
      (commit) => commit.repositoryName === pullRequest.repositoryName,
    );

    const estimate = estimateFromCommitSpan(dayCommits) ?? {
      minutes: PR_FALLBACK_MINUTES,
      basis:
        "Estimativa padrão para um PR concluído — ajuste se levou mais ou menos tempo.",
    };

    const workItemId = pullRequest.workItemIds[0] ?? null;
    const { score, confidence } = scoreFor(
      "pr_completed",
      workItemId !== null,
      dayCommits.length,
    );

    const evidence: AutofillEvidence[] = [
      {
        kind: "pull_request",
        label: `PR #${pullRequest.id} — ${truncate(pullRequest.title, 80)}`,
        detail: `${pullRequest.repositoryName} · concluído em ${date}`,
        url: pullRequest.url,
      },
    ];

    if (dayCommits.length > 0) {
      evidence.push({
        kind: "commits",
        label: `${dayCommits.length} commit(s) no mesmo dia`,
        detail: dayCommits[0]?.repositoryName ?? null,
        url: null,
      });
    }

    const reasons = [
      `Você concluiu o PR #${pullRequest.id} no Azure DevOps.`,
      ...(dayCommits.length > 0
        ? [`${dayCommits.length} commit(s) seus nesse repositório no dia.`]
        : []),
      "Nenhum lançamento cobre esse trabalho ainda.",
    ];

    push({
      fingerprint: buildFingerprint(
        "pr_completed",
        date,
        project.id,
        `pr${pullRequest.id}`,
      ),
      signal: "pr_completed",
      date,
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      description: truncate(`PR #${pullRequest.id} — ${pullRequest.title}`),
      durationMinutes: estimate.minutes,
      billable: project.billable && defaults.billable,
      azureWorkItemId: workItemId,
      azureWorkItemTitle: null,
      confidence,
      score,
      reasons,
      evidence,
      loggedMinutesOnDate: minutesByDate.get(date) ?? 0,
      durationBasis: estimate.basis,
    });
  }

  // ── 2. Days with commits but nothing logged at all ──
  for (const date of dates) {
    if (locked.has(date)) continue;
    if ((minutesByDate.get(date) ?? 0) > 0) continue;

    const dayCommits = commitsByDate.get(date) ?? [];
    if (dayCommits.length === 0) continue;

    // Group the day's commits by the project they belong to.
    const byProject = new Map<string, NormalizedCommitActivity[]>();
    for (const commit of dayCommits) {
      const project = matchProjectForAzureProject(projects, commit.projectName);
      if (!project) continue;

      const bucket = byProject.get(project.id) ?? [];
      bucket.push(commit);
      byProject.set(project.id, bucket);
    }

    for (const [projectId, projectCommits] of byProject) {
      const project = projects.find((item) => item.id === projectId);
      if (!project || !canPropose(date, projectId)) continue;

      const estimate = estimateFromCommitSpan(projectCommits);
      if (!estimate) continue;

      const workItemId =
        projectCommits.flatMap((commit) => commit.workItemIds)[0] ?? null;
      const { score, confidence } = scoreFor(
        "commits_unlogged",
        workItemId !== null,
        projectCommits.length,
      );

      const headline = projectCommits[0]?.message ?? "Desenvolvimento";

      push({
        fingerprint: buildFingerprint(
          "commits_unlogged",
          date,
          projectId,
          `c${projectCommits.length}`,
        ),
        signal: "commits_unlogged",
        date,
        projectId,
        projectName: project.name,
        projectColor: project.color,
        description: truncate(headline),
        durationMinutes: estimate.minutes,
        billable: project.billable && defaults.billable,
        azureWorkItemId: workItemId,
        azureWorkItemTitle: null,
        confidence,
        score,
        reasons: [
          `${projectCommits.length} commit(s) seus em ${date}, sem nenhuma hora registrada nesse dia.`,
        ],
        evidence: [
          {
            kind: "commits",
            label: `${projectCommits.length} commit(s) — ${truncate(headline, 60)}`,
            detail: projectCommits[0]?.repositoryName ?? null,
            url: projectCommits[0]?.url ?? null,
          },
        ],
        loggedMinutesOnDate: 0,
        durationBasis: estimate.basis,
      });
    }
  }

  // ── 3. Open pull requests, as a lighter signal ──
  for (const pullRequest of pullRequests) {
    if (pullRequest.status !== "active") continue;

    const project = matchProjectForAzureProject(
      projects,
      pullRequest.projectName,
    );
    if (!project || !canPropose(today, project.id)) continue;

    const dayCommits = (commitsByDate.get(today) ?? []).filter(
      (commit) => commit.repositoryName === pullRequest.repositoryName,
    );
    if (dayCommits.length === 0) continue;

    const estimate = estimateFromCommitSpan(dayCommits);
    if (!estimate) continue;

    const workItemId = pullRequest.workItemIds[0] ?? null;
    const { score, confidence } = scoreFor(
      "pr_active",
      workItemId !== null,
      dayCommits.length,
    );

    push({
      fingerprint: buildFingerprint(
        "pr_active",
        today,
        project.id,
        `pr${pullRequest.id}`,
      ),
      signal: "pr_active",
      date: today,
      projectId: project.id,
      projectName: project.name,
      projectColor: project.color,
      description: truncate(`PR #${pullRequest.id} — ${pullRequest.title}`),
      durationMinutes: estimate.minutes,
      billable: project.billable && defaults.billable,
      azureWorkItemId: workItemId,
      azureWorkItemTitle: null,
      confidence,
      score,
      reasons: [
        `PR #${pullRequest.id} está aberto e você commitou nele hoje.`,
        "As horas de hoje nesse projeto ainda não cobrem esse trabalho.",
      ],
      evidence: [
        {
          kind: "pull_request",
          label: `PR #${pullRequest.id} — ${truncate(pullRequest.title, 80)}`,
          detail: `${pullRequest.repositoryName} · em revisão`,
          url: pullRequest.url,
        },
      ],
      loggedMinutesOnDate: minutesByDate.get(today) ?? 0,
      durationBasis: estimate.basis,
    });
  }

  // ── 4. Work items in progress with nothing logged today ──
  // A nudge rather than evidence, so it is limited to today and ranks last.
  if (!locked.has(today) && (minutesByDate.get(today) ?? 0) === 0) {
    for (const workItem of workItems) {
      if (!ACTIVE_WORK_ITEM_STATES.has(workItem.state.trim().toLowerCase())) {
        continue;
      }

      const project = matchProjectForAzureProject(
        projects,
        workItem.projectName,
      );
      if (!project || !canPropose(today, project.id)) continue;

      const remaining =
        typeof workItem.remainingWork === "number" && workItem.remainingWork > 0
          ? Math.round(workItem.remainingWork * 60)
          : null;

      const minutes = clampDuration(
        remaining !== null
          ? Math.min(remaining, defaults.dailyTargetMinutes)
          : defaults.durationMinutes,
      );

      const { score, confidence } = scoreFor("work_item_active", true, 0);

      push({
        fingerprint: buildFingerprint(
          "work_item_active",
          today,
          project.id,
          `wi${workItem.id}`,
        ),
        signal: "work_item_active",
        date: today,
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        description: truncate(`#${workItem.id} — ${workItem.title}`),
        durationMinutes: minutes,
        billable: project.billable && defaults.billable,
        azureWorkItemId: workItem.id,
        azureWorkItemTitle: workItem.title,
        confidence,
        score,
        reasons: [
          `A task #${workItem.id} está em "${workItem.state}" atribuída a você.`,
          "Você ainda não registrou horas hoje.",
        ],
        evidence: [
          {
            kind: "work_item",
            label: `#${workItem.id} — ${truncate(workItem.title, 80)}`,
            detail: `${workItem.type} · ${workItem.state}`,
            url: workItem.url,
          },
        ],
        loggedMinutesOnDate: 0,
        durationBasis:
          remaining !== null
            ? `Baseado nas ${workItem.remainingWork}h restantes estimadas na task.`
            : "Sua duração padrão de lançamento — ajuste conforme o dia.",
      });
    }
  }

  return proposals
    .sort((a, b) => b.score - a.score || a.date.localeCompare(b.date))
    .slice(0, MAX_PROPOSALS);
}
