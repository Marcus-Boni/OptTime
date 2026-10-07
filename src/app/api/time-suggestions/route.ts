import { subDays } from "date-fns";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import {
  getAccessibleProjectIds,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { buildCommitAuthorCandidates } from "@/lib/azure-devops/commit-author";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import { project, timeEntry, timeSuggestionFeedback } from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import {
  getCachedSuggestions,
  setCachedSuggestions,
} from "@/lib/time-assistant/cache";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import {
  buildDeterministicSuggestions,
  type NormalizedCommitActivity,
  type NormalizedOutlookActivity,
} from "@/lib/time-assistant/engine";
import { getTimeSuggestionsSchema } from "@/lib/validations/time-suggestion.schema";
import type { TeamCallSignal } from "@/types/collaboration";

function safeParseBreakdown(raw: string | null) {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      commits?: number;
      meetings?: number;
      recency?: number;
    };
    return {
      commits: parsed.commits ?? 0,
      meetings: parsed.meetings ?? 0,
      recency: parsed.recency ?? 0,
    };
  } catch {
    return null;
  }
}

function getWeightAdjustments(
  feedbackRows: Array<{
    action: string;
    sourceBreakdown: string | null;
  }>,
) {
  let acceptedCommitSignals = 0;
  let rejectedCommitSignals = 0;
  let acceptedMeetingSignals = 0;
  let rejectedMeetingSignals = 0;

  for (const row of feedbackRows) {
    const source = safeParseBreakdown(row.sourceBreakdown);
    if (!source) continue;

    if (source.commits > 0) {
      if (row.action === "accepted" || row.action === "edited") {
        acceptedCommitSignals += 1;
      }
      if (row.action === "rejected") {
        rejectedCommitSignals += 1;
      }
    }

    if (source.meetings > 0) {
      if (row.action === "accepted" || row.action === "edited") {
        acceptedMeetingSignals += 1;
      }
      if (row.action === "rejected") {
        rejectedMeetingSignals += 1;
      }
    }
  }

  const commitBoost =
    acceptedCommitSignals > rejectedCommitSignals
      ? 0.05
      : rejectedCommitSignals > acceptedCommitSignals
        ? -0.05
        : 0;

  const meetingBoost =
    acceptedMeetingSignals > rejectedMeetingSignals
      ? 0.05
      : rejectedMeetingSignals > acceptedMeetingSignals
        ? -0.05
        : 0;

  return {
    commitBoost,
    meetingBoost,
    recencyBoost: 0.02,
  };
}

function toIsoDayBounds(date: string) {
  return {
    start: `${date}T00:00:00`,
    end: `${date}T23:59:59`,
  };
}

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parseResult = getTimeSuggestionsSchema.safeParse({
    date: searchParams.get("date"),
    timezone: searchParams.get("timezone") ?? "UTC",
  });

  if (!parseResult.success) {
    return Response.json(
      { error: "Parametros invalidos", details: parseResult.error.flatten() },
      { status: 400 },
    );
  }

  const { date, timezone } = parseResult.data;
  const cacheKey = `${session.user.id}:${date}:${timezone}`;
  const cached = getCachedSuggestions<unknown>(cacheKey);

  if (cached) {
    return Response.json(cached);
  }

  try {
    const actor = getActorContext(session.user);
    const accessibleProjectIds = await getAccessibleProjectIds(actor);

    let projects: Array<{
      id: string;
      name: string;
      billable: boolean;
      azureProjectId: string | null;
      color: string | null;
    }> = [];

    if (accessibleProjectIds === null) {
      projects = await db.query.project.findMany({
        where: eq(project.status, "active"),
        columns: {
          id: true,
          name: true,
          billable: true,
          azureProjectId: true,
          color: true,
        },
      });
    } else if (accessibleProjectIds.length > 0) {
      projects = await db.query.project.findMany({
        where: and(
          inArray(project.id, accessibleProjectIds),
          eq(project.status, "active"),
        ),
        columns: {
          id: true,
          name: true,
          billable: true,
          azureProjectId: true,
          color: true,
        },
      });
    }

    const dayEntries = await db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.userId, session.user.id),
        eq(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
      ),
      with: {
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(timeEntry.createdAt)],
    });

    const twoWeeksAgo = subDays(new Date(`${date}T12:00:00`), 14)
      .toISOString()
      .slice(0, 10);

    const recentEntries = await db.query.timeEntry.findMany({
      where: and(
        eq(timeEntry.userId, session.user.id),
        gte(timeEntry.date, twoWeeksAgo),
        lte(timeEntry.date, date),
        isNull(timeEntry.deletedAt),
      ),
      with: {
        project: {
          columns: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: [desc(timeEntry.date)],
      limit: 120,
    });

    const recentFeedback = await db.query.timeSuggestionFeedback.findMany({
      where: eq(timeSuggestionFeedback.userId, session.user.id),
      columns: {
        action: true,
        sourceBreakdown: true,
      },
      orderBy: [desc(timeSuggestionFeedback.createdAt)],
      limit: 50,
    });

    const weightAdjustments = getWeightAdjustments(recentFeedback);

    const meetings: NormalizedOutlookActivity[] = [];
    const calls: TeamCallSignal[] = [];

    let commits: NormalizedCommitActivity[] = [];
    const workItemsMap = new Map<
      number,
      { title: string; type?: string | null; state?: string | null }
    >();
    const config = await findAzureDevopsConfigByUserId(session.user.id);

    if (config?.commitAuthor) {
      try {
        const pat = decrypt(config.pat);
        if (pat) {
          const client = createAzureDevOpsClient(config.organizationUrl, pat);
          const dayBounds = toIsoDayBounds(date);
          const authorCandidates = buildCommitAuthorCandidates({
            configuredAuthor: config.commitAuthor,
          });

          // Keep the Azure fan-out bounded while still fetching every
          // accessible project's commits for the selected day.
          const commitBuckets = await mapWithConcurrencyLimit(
            projects,
            4,
            async (internalProject) => {
              try {
                return await client.getRecentCommits(
                  internalProject.azureProjectId ?? internalProject.name,
                  {
                    authorCandidates,
                    fromDate: dayBounds.start,
                    toDate: dayBounds.end,
                    projectLabel: internalProject.name,
                  },
                );
              } catch {
                return [];
              }
            },
          );

          commits = commitBuckets
            .flat()
            .map((c) => ({
              id: c.id,
              projectName: c.projectName,
              repositoryName: c.repositoryName,
              commitId: c.commitId,
              message: c.message,
              comment: c.comment,
              branch: c.branch,
              authorEmail: c.authorEmail,
              timestamp: c.timestamp,
              workItemIds: c.workItemIds,
              url: c.url ?? null,
            }))
            .sort(
              (a, b) =>
                new Date(b.timestamp).getTime() -
                new Date(a.timestamp).getTime(),
            );

          // Resolve task titles for Work Items referenced in commits
          const uniqueWorkItemIds = Array.from(
            new Set(commits.flatMap((c) => c.workItemIds)),
          ).slice(0, 20);

          if (uniqueWorkItemIds.length > 0) {
            await mapWithConcurrencyLimit(
              uniqueWorkItemIds,
              4,
              async (workItemId) => {
                try {
                  const wi = await client.getWorkItem(workItemId);
                  workItemsMap.set(workItemId, {
                    title: wi.title,
                    type: wi.type,
                    state: wi.state,
                  });
                } catch {
                  // non-blocking
                }
              },
            );
          }
        }
      } catch (error) {
        console.warn("[time_suggestions][azure_commits_failed]", {
          userId: session.user.id,
          date,
          error: error instanceof Error ? error.message : "unknown",
        });
        commits = [];
      }
    }

    const suggestions = buildDeterministicSuggestions({
      date,
      commits,
      meetings,
      calls,
      projects,
      organizationUrl: config?.organizationUrl,
      workItems: workItemsMap,
      recentEntries: recentEntries.map((entry) => ({
        date: entry.date,
        projectId: entry.projectId,
        projectName: entry.project.name,
        duration: entry.duration,
        azureWorkItemId: entry.azureWorkItemId,
        description: entry.description,
      })),
      existingEntries: dayEntries.map((entry) => ({
        date: entry.date,
        projectId: entry.projectId,
        projectName: entry.project.name,
        duration: entry.duration,
        azureWorkItemId: entry.azureWorkItemId,
        description: entry.description,
      })),
      weights: weightAdjustments,
    });

    const responsePayload = {
      date,
      timezone,
      generatedAt: new Date().toISOString(),
      suggestions,
    };

    console.info("[time_suggestions]", {
      userId: session.user.id,
      date,
      commits: commits.length,
      meetings: meetings.length,
      calls: calls.length,
      suggestions: suggestions.length,
    });

    setCachedSuggestions(cacheKey, responsePayload, 90_000);

    return Response.json(responsePayload);
  } catch (error) {
    console.error("[GET /api/time-suggestions]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
