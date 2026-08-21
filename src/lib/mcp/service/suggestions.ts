import { subDays } from "date-fns";
import { and, desc, eq, gte, isNull, lte } from "drizzle-orm";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { buildCommitAuthorCandidates } from "@/lib/azure-devops/commit-author";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { timeEntry } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import {
  buildDeterministicSuggestions,
  type NormalizedCommitActivity,
  type RecentEntryActivity,
} from "@/lib/time-assistant/engine";
import type { AgentPrincipal } from "../auth";
import { humanizeMinutes } from "../format";
import { getVisibleProjects } from "./projects";

/**
 * Smart daily suggestions for agents.
 *
 * Reuses the same deterministic engine that powers the in-app time assistant,
 * fed by Azure DevOps commits and the user's own recent entries. Outlook
 * meetings are intentionally absent: they require a delegated Microsoft token
 * that a personal access token cannot mint, and silently degrading is better
 * than failing the whole call.
 */

/** How many Azure projects to fan out to concurrently. */
const AZURE_FANOUT_LIMIT = 4;

/** Days of history used to learn the user's typical durations and projects. */
const HISTORY_WINDOW_DAYS = 14;

export interface AgentSuggestion {
  projectId: string | null;
  projectName: string | null;
  description: string;
  date: string;
  durationMinutes: number;
  durationLabel: string;
  billable: boolean;
  azureWorkItemId: number | null;
  confidence: "high" | "medium" | "low";
  reasons: string[];
  /** Commits behind the suggestion, so the agent can quote real evidence. */
  evidence: {
    commitCount: number;
    repositories: string[];
    firstCommitAt: string | null;
    lastCommitAt: string | null;
  } | null;
}

export interface SuggestDailyEntriesResult {
  date: string;
  suggestions: AgentSuggestion[];
  alreadyLoggedMinutes: number;
  alreadyLoggedLabel: string;
  sources: {
    commits: number;
    /** False when the Azure DevOps integration is not usable for this user. */
    azureDevOpsAvailable: boolean;
    outlookAvailable: false;
  };
  notes: string[];
}

function toEntryActivity(
  rows: Array<{
    date: string;
    projectId: string;
    duration: number;
    azureWorkItemId: number | null;
    description: string;
    project: { name: string };
  }>,
): RecentEntryActivity[] {
  return rows.map((row) => ({
    date: row.date,
    projectId: row.projectId,
    projectName: row.project.name,
    duration: row.duration,
    azureWorkItemId: row.azureWorkItemId,
    description: row.description,
  }));
}

/** Pulls the day's commits for every Azure-linked project in scope. */
async function fetchCommits(
  userId: string,
  date: string,
  projects: Array<{ name: string; azureProjectId: string | null }>,
): Promise<{
  commits: NormalizedCommitActivity[];
  available: boolean;
  note?: string;
}> {
  const config = await findAzureDevopsConfigByUserId(userId);

  if (!config) {
    return {
      commits: [],
      available: false,
      note: "Integração com Azure DevOps não configurada — as sugestões usam apenas o seu histórico de lançamentos.",
    };
  }

  if (!config.commitAuthor) {
    return {
      commits: [],
      available: false,
      note: "Autor de commits não configurado na integração do Azure DevOps — sem sinal de commits para hoje.",
    };
  }

  const pat = decrypt(config.pat);
  if (!pat) {
    return {
      commits: [],
      available: false,
      note: "Token do Azure DevOps inválido — atualize a integração para melhorar as sugestões.",
    };
  }

  try {
    const client = createAzureDevOpsClient(config.organizationUrl, pat);
    const authorCandidates = buildCommitAuthorCandidates({
      configuredAuthor: config.commitAuthor,
    });

    const buckets = await mapWithConcurrencyLimit(
      projects,
      AZURE_FANOUT_LIMIT,
      async (item) => {
        try {
          return await client.getRecentCommits(
            item.azureProjectId ?? item.name,
            {
              authorCandidates,
              fromDate: `${date}T00:00:00`,
              toDate: `${date}T23:59:59`,
              projectLabel: item.name,
            },
          );
        } catch {
          return [];
        }
      },
    );

    const commits = buckets
      .flat()
      .map((commit) => ({
        id: commit.id,
        projectName: commit.projectName,
        repositoryName: commit.repositoryName,
        commitId: commit.commitId,
        message: commit.message,
        comment: commit.comment,
        branch: commit.branch,
        authorEmail: commit.authorEmail,
        timestamp: commit.timestamp,
        workItemIds: commit.workItemIds,
        url: commit.url ?? null,
      }))
      .sort(
        (a, b) =>
          new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
      );

    return { commits, available: true };
  } catch (error: unknown) {
    console.warn("[mcp][suggestions] azure commits failed", {
      userId,
      date,
      error: error instanceof Error ? error.message : "unknown",
    });
    return {
      commits: [],
      available: false,
      note: "Não foi possível consultar os commits do Azure DevOps agora.",
    };
  }
}

export async function suggestDailyEntries(
  principal: AgentPrincipal,
  date: string,
): Promise<SuggestDailyEntriesResult> {
  const projects = await getVisibleProjects(principal);

  const historyFloor = subDays(
    new Date(`${date}T12:00:00`),
    HISTORY_WINDOW_DAYS,
  )
    .toISOString()
    .slice(0, 10);

  const [dayEntries, recentEntries, commitResult] = await Promise.all([
    db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.userId, principal.userId),
        eq(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
      ),
      with: { project: { columns: { id: true, name: true } } },
      orderBy: [desc(timeEntry.createdAt)],
    }),
    db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.userId, principal.userId),
        gte(timeEntry.date, historyFloor),
        lte(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
      ),
      with: { project: { columns: { id: true, name: true } } },
      orderBy: [desc(timeEntry.date)],
      limit: 120,
    }),
    fetchCommits(principal.userId, date, projects),
  ]);

  const config = await findAzureDevopsConfigByUserId(principal.userId);

  const raw = buildDeterministicSuggestions({
    date,
    commits: commitResult.commits,
    meetings: [],
    projects: projects.map((item) => ({
      id: item.id,
      name: item.name,
      billable: item.billable,
      azureProjectId: item.azureProjectId,
    })),
    organizationUrl: config?.organizationUrl,
    recentEntries: toEntryActivity(recentEntries),
    existingEntries: toEntryActivity(dayEntries),
  });

  const alreadyLoggedMinutes = dayEntries.reduce(
    (total, row) => total + row.duration,
    0,
  );

  const notes: string[] = [];
  if (commitResult.note) notes.push(commitResult.note);
  if (raw.length === 0) {
    notes.push(
      "Nenhuma sugestão automática para este dia. Pergunte ao usuário o que foi feito e use opt_time_log_time.",
    );
  }

  return {
    date,
    alreadyLoggedMinutes,
    alreadyLoggedLabel: humanizeMinutes(alreadyLoggedMinutes),
    sources: {
      commits: commitResult.commits.length,
      azureDevOpsAvailable: commitResult.available,
      outlookAvailable: false,
    },
    notes,
    suggestions: raw.map((item) => ({
      projectId: item.projectId,
      projectName: item.projectName,
      description: item.description,
      date: item.date,
      durationMinutes: item.duration,
      durationLabel: humanizeMinutes(item.duration),
      billable: item.billable,
      azureWorkItemId: item.azureWorkItemId,
      confidence: item.confidence,
      reasons: item.reasons,
      evidence: item.activitySummary
        ? {
            commitCount: item.activitySummary.totalCommits,
            repositories: item.activitySummary.repositories,
            firstCommitAt: item.activitySummary.startedAt,
            lastCommitAt: item.activitySummary.endedAt,
          }
        : null,
    })),
  };
}
