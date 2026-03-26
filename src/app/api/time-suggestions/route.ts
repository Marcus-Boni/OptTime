import { subDays } from "date-fns";
import { and, desc, eq, gte, inArray, isNull, lte } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { db } from "@/lib/db";
import {
  azureDevopsConfig,
  project,
  projectMember,
  timeEntry,
  timeSuggestionFeedback,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import { fetchOutlookEvents } from "@/lib/microsoft-graph";
import {
  getCachedSuggestions,
  setCachedSuggestions,
} from "@/lib/time-assistant/cache";
import {
  buildDeterministicSuggestions,
  type NormalizedCommitActivity,
  type NormalizedOutlookActivity,
} from "@/lib/time-assistant/engine";
import { getTimeSuggestionsSchema } from "@/lib/validations/time-suggestion.schema";

type AccessTokenResult = {
  accessToken?: string;
};

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
  const session = await auth.api.getSession({ headers: req.headers });
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
      { error: "Parâmetros inválidos", details: parseResult.error.flatten() },
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
    const isPrivileged =
      session.user.role === "manager" || session.user.role === "admin";

    let projects: Array<{
      id: string;
      name: string;
      billable: boolean;
      azureProjectId: string | null;
    }> = [];

    if (isPrivileged) {
      projects = await db.query.project.findMany({
        where: eq(project.status, "active"),
        columns: {
          id: true,
          name: true,
          billable: true,
          azureProjectId: true,
        },
      });
    } else {
      const memberships = await db.query.projectMember.findMany({
        where: eq(projectMember.userId, session.user.id),
        columns: { projectId: true },
      });
      const projectIds = memberships.map((membership) => membership.projectId);
      if (projectIds.length > 0) {
        projects = await db.query.project.findMany({
          where: and(
            inArray(project.id, projectIds),
            eq(project.status, "active"),
          ),
          columns: {
            id: true,
            name: true,
            billable: true,
            azureProjectId: true,
          },
        });
      }
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

    let meetings: NormalizedOutlookActivity[] = [];
    try {
      const tokenResponse = (await auth.api.getAccessToken({
        body: {
          providerId: "microsoft",
        },
        headers: req.headers,
      })) as AccessTokenResult;

      if (tokenResponse.accessToken) {
        const dayBounds = toIsoDayBounds(date);
        const events = await fetchOutlookEvents(
          tokenResponse.accessToken,
          dayBounds.start,
          dayBounds.end,
        );

        meetings = events.map((event) => {
          const start = new Date(
            event.start.dateTime.endsWith("Z")
              ? event.start.dateTime
              : `${event.start.dateTime}Z`,
          );
          const end = new Date(
            event.end.dateTime.endsWith("Z")
              ? event.end.dateTime
              : `${event.end.dateTime}Z`,
          );

          return {
            id: event.id,
            subject: event.subject,
            startDateTime: start.toISOString(),
            endDateTime: end.toISOString(),
            durationMinutes: Math.max(
              1,
              Math.round((end.getTime() - start.getTime()) / 60000),
            ),
          };
        });
      }
    } catch (error) {
      console.warn("[time_suggestions][outlook_fetch_failed]", {
        userId: session.user.id,
        date,
        error: error instanceof Error ? error.message : "unknown",
      });
      meetings = [];
    }

    let commits: NormalizedCommitActivity[] = [];
    const config = await db.query.azureDevopsConfig.findFirst({
      where: eq(azureDevopsConfig.userId, session.user.id),
    });

    if (config) {
      try {
        const pat = decrypt(config.pat);
        if (pat) {
          const client = createAzureDevOpsClient(config.organizationUrl, pat);
          const dayBounds = toIsoDayBounds(date);

          const commitBuckets = await Promise.all(
            projects.slice(0, 8).map(async (internalProject) => {
              try {
                return await client.getRecentCommits(
                  internalProject.azureProjectId ?? internalProject.name,
                  {
                    author: session.user.email,
                    authorAliases: [session.user.name],
                    fromDate: dayBounds.start,
                    toDate: dayBounds.end,
                    top: 20,
                    projectLabel: internalProject.name,
                  },
                );
              } catch {
                return [];
              }
            }),
          );

          commits = commitBuckets.flat();
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
      projects,
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
      suggestions: suggestions.length,
    });

    setCachedSuggestions(cacheKey, responsePayload, 90_000);

    return Response.json(responsePayload);
  } catch (error) {
    console.error("[GET /api/time-suggestions]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
