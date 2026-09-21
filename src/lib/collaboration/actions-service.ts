/**
 * "Ações realizadas" — the Azure DevOps half of the activity timeline.
 *
 * Kept apart from `buildCollaborationPeriod` on purpose: Azure DevOps is the
 * slowest integration in the product (one request per repository, per project)
 * and the page has nothing to show while it runs. Loading it separately lets
 * Meu Tempo paint the calendar side immediately and fill the timeline in.
 *
 * Everything here is best-effort. A broken PAT, an archived project or a
 * rate-limited organisation degrades the timeline to the meetings the calendar
 * already provided — it never fails the request.
 */

import { and, eq, inArray } from "drizzle-orm";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { buildCommitAuthorCandidates } from "@/lib/azure-devops/commit-author";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import {
  type AzureDevOpsOutcome,
  buildAzureDevOpsStatus,
} from "@/lib/collaboration/source-status";
import { db } from "@/lib/db";
import { project, user } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import { dateOfInstantInAppTimeZone } from "@/lib/timezone";
import type { PeriodAction, PeriodActionsResult } from "@/types/collaboration";

/** Matches the reconstructor: enough parallelism without tripping throttling. */
const AZURE_CONCURRENCY = 4;
/** Per project, per status — a month of one person never reaches this. */
const PR_PAGE_SIZE = 40;
/** The timeline is a narrative, not an audit log. */
const MAX_ACTIONS = 160;

export interface BuildPeriodActionsInput {
  userId: string;
  /** YYYY-MM-DD, inclusive, in the app timezone. */
  from: string;
  to: string;
  /** Projects the caller is allowed to see; `null` means every active one. */
  accessibleProjectIds: string[] | null;
}

function isInRange(iso: string | null | undefined, from: string, to: string) {
  if (!iso) return false;
  const date = dateOfInstantInAppTimeZone(new Date(iso));
  return date >= from && date <= to;
}

/**
 * Reads everything the person did in Azure DevOps inside the window.
 *
 * Only timestamped facts become actions: a merged pull request, a commit, a
 * work item that changed state. An assigned work item that nobody touched in
 * the period is current state, not something that happened, and would make a
 * quiet week look busy.
 */
export async function buildPeriodActions({
  userId,
  from,
  to,
  accessibleProjectIds,
}: BuildPeriodActionsInput): Promise<PeriodActionsResult> {
  const warnings: string[] = [];

  function result(
    outcome: AzureDevOpsOutcome,
    actions: PeriodAction[] = [],
    configured = false,
  ): PeriodActionsResult {
    return {
      from,
      to,
      actions,
      sources: {
        azureDevOps: outcome === "ok",
        azureDevOpsConfigured: configured,
      },
      status: buildAzureDevOpsStatus(outcome),
      warnings,
    };
  }

  const [profile, azdoConfig] = await Promise.all([
    db.query.user.findFirst({
      where: eq(user.id, userId),
      columns: { name: true, email: true },
    }),
    findAzureDevopsConfigByUserId(userId),
  ]);

  const configured = Boolean(azdoConfig?.commitAuthor && azdoConfig?.pat);
  if (!configured || !azdoConfig) return result("not_configured");

  const pat = decrypt(azdoConfig.pat);
  if (!pat) {
    warnings.push(
      "Não foi possível ler o token do Azure DevOps. Reconfigure a integração.",
    );
    return result("bad_token", [], true);
  }

  const projectRows = await db.query.project.findMany({
    where:
      accessibleProjectIds === null
        ? eq(project.status, "active")
        : accessibleProjectIds.length > 0
          ? and(
              inArray(project.id, accessibleProjectIds),
              eq(project.status, "active"),
            )
          : eq(project.id, "__none__"),
    columns: { name: true, azureProjectId: true },
  });

  if (projectRows.length === 0) return result("no_projects", [], true);

  const client = createAzureDevOpsClient(azdoConfig.organizationUrl, pat);
  const authorCandidates = buildCommitAuthorCandidates({
    configuredAuthor: azdoConfig.commitAuthor,
    userEmail: profile?.email ?? null,
    userName: profile?.name ?? null,
  });

  const sinceIso = `${from}T00:00:00`;
  const untilIso = `${to}T23:59:59`;
  const actions: PeriodAction[] = [];
  let anySucceeded = false;

  const buckets = await mapWithConcurrencyLimit(
    projectRows,
    AZURE_CONCURRENCY,
    async (row) => {
      const ref = row.azureProjectId ?? row.name;

      const [pullRequests, commits, workItems] = await Promise.all([
        client
          .getPullRequests(ref, {
            authorCandidates,
            status: "completed",
            since: sinceIso,
            top: PR_PAGE_SIZE,
          })
          .catch(() => null),
        client
          .getRecentCommits(ref, {
            authorCandidates,
            fromDate: sinceIso,
            toDate: untilIso,
            projectLabel: row.name,
          })
          .catch(() => null),
        client.getAssignedWorkItems(ref, 30).catch(() => null),
      ]);

      return { pullRequests, commits, workItems, projectName: row.name };
    },
  );

  for (const bucket of buckets) {
    if (bucket.pullRequests) {
      anySucceeded = true;
      for (const pr of bucket.pullRequests) {
        const closedAt = pr.closedAt ?? pr.createdAt;
        if (!isInRange(closedAt, from, to)) continue;

        actions.push({
          id: `pr-${pr.id}`,
          kind: "pull_request",
          title: pr.title,
          date: dateOfInstantInAppTimeZone(new Date(closedAt)),
          timestampIso: closedAt,
          context: pr.repositoryName,
          minutes: null,
          url: pr.url,
        });
      }
    }

    if (bucket.commits) {
      anySucceeded = true;
      for (const commit of bucket.commits) {
        // Azure filters commits by a naive timestamp range, so a late-night
        // commit can arrive tagged with the neighbouring day. Trust the local
        // date, the same rule the reconstructor applies.
        if (!isInRange(commit.timestamp, from, to)) continue;

        actions.push({
          id: `commit-${commit.id}`,
          kind: "commit",
          title: commit.comment || commit.message,
          date: dateOfInstantInAppTimeZone(new Date(commit.timestamp)),
          timestampIso: commit.timestamp,
          context: commit.repositoryName,
          minutes: null,
          url: commit.url ?? null,
        });
      }
    }

    if (bucket.workItems) {
      anySucceeded = true;
      for (const item of bucket.workItems) {
        if (!isInRange(item.changedDate, from, to)) continue;
        const changedDate = item.changedDate as string;

        actions.push({
          id: `wi-${item.id}`,
          kind: "work_item",
          title: `#${item.id} ${item.title}`,
          date: dateOfInstantInAppTimeZone(new Date(changedDate)),
          timestampIso: changedDate,
          context: `${item.type} · ${item.state}`,
          minutes: null,
          url: item.url,
        });
      }
    }
  }

  if (!anySucceeded) {
    warnings.push("O Azure DevOps não respondeu agora.");
  }

  actions.sort((a, b) => b.timestampIso.localeCompare(a.timestampIso));

  return result(
    anySucceeded ? "ok" : "unavailable",
    actions.slice(0, MAX_ACTIONS),
    true,
  );
}
