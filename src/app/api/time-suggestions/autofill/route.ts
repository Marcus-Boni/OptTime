import { subDays } from "date-fns";
import { and, desc, eq, gte, inArray, isNull, like, lte } from "drizzle-orm";
import {
  getAccessibleProjectIds,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { resolveTodayInTimeZone } from "@/lib/ai/context";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { buildCommitAuthorCandidates } from "@/lib/azure-devops/commit-author";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { db } from "@/lib/db";
import {
  project,
  timeEntry,
  timeSuggestionFeedback,
  user,
} from "@/lib/db/schema";
import { decrypt } from "@/lib/encryption";
import {
  type AutofillProject,
  buildAutofillProposals,
} from "@/lib/time-assistant/autofill";
import {
  getCachedSuggestions,
  setCachedSuggestions,
} from "@/lib/time-assistant/cache";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import type { NormalizedCommitActivity } from "@/lib/time-assistant/engine";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { formatLocalDate, getWeekPeriod, parseLocalDate } from "@/lib/utils";
import {
  dismissAutofillSchema,
  getAutofillSchema,
} from "@/lib/validations/autofill.schema";
import type { AutofillRadarResponse } from "@/types/autofill";
import type {
  AzureDevOpsAssignedWorkItem,
  AzureDevOpsPullRequest,
} from "@/types/azure-devops";

/** Azure fan-out plus scoring is slow enough to warrant a short cache. */
const CACHE_TTL_MS = 120_000;
const AZURE_CONCURRENCY = 4;

/** Every date in the window, oldest first, never in the future. */
function buildDateWindow(today: string, days: number): string[] {
  const end = parseLocalDate(today);
  const dates: string[] = [];

  for (let offset = days - 1; offset >= 0; offset--) {
    dates.push(formatLocalDate(subDays(end, offset)));
  }

  return dates;
}

/**
 * Dates sitting inside a submitted or approved timesheet. Resolved one week at
 * a time, since the lock is a weekly property.
 */
async function resolveLockedDates(
  userId: string,
  dates: string[],
): Promise<string[]> {
  const byPeriod = new Map<string, string[]>();

  for (const date of dates) {
    const period = getWeekPeriod(date);
    const bucket = byPeriod.get(period) ?? [];
    bucket.push(date);
    byPeriod.set(period, bucket);
  }

  const locked: string[] = [];

  await Promise.all(
    [...byPeriod.values()].map(async (periodDates) => {
      const probe = periodDates[0];
      if (!probe) return;

      const status = await getWeeklyTimesheetStatusForDate(userId, probe);
      if (status.locked) locked.push(...periodDates);
    }),
  );

  return locked;
}

/**
 * GET - Predictive time-logging proposals.
 *
 * Reads Azure DevOps activity (merged and open pull requests, assigned work
 * items, commits) across a multi-day window, subtracts whatever the user has
 * already logged, and returns the gaps as one-click proposals.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = getAutofillSchema.safeParse({
    days: searchParams.get("days") ?? undefined,
    timezone:
      searchParams.get("timezone") ??
      req.headers.get("x-timezone") ??
      undefined,
  });

  if (!parsed.success) {
    return Response.json(
      { error: "Parâmetros inválidos", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const { days, timezone } = parsed.data;
  const today = resolveTodayInTimeZone(timezone);
  const cacheKey = `autofill:${session.user.id}:${today}:${days}`;

  const cached = getCachedSuggestions<AutofillRadarResponse>(cacheKey);
  if (cached) {
    return Response.json(cached);
  }

  try {
    const actor = getActorContext(session.user);
    const dates = buildDateWindow(today, days);
    const from = dates[0] ?? today;
    const warnings: string[] = [];

    const [accessibleProjectIds, profile, config] = await Promise.all([
      getAccessibleProjectIds(actor),
      db.query.user.findFirst({
        where: eq(user.id, session.user.id),
        columns: {
          name: true,
          email: true,
          weeklyCapacity: true,
          timeDefaultDuration: true,
          timeDefaultBillable: true,
        },
      }),
      findAzureDevopsConfigByUserId(session.user.id),
    ]);

    const projectRows = await db.query.project.findMany({
      where:
        accessibleProjectIds === null
          ? eq(project.status, "active")
          : accessibleProjectIds.length > 0
            ? and(
                inArray(project.id, accessibleProjectIds),
                eq(project.status, "active"),
              )
            : // No accessible project: short-circuit with an impossible filter.
              eq(project.id, "__none__"),
      columns: {
        id: true,
        name: true,
        color: true,
        billable: true,
        azureProjectId: true,
      },
    });

    const projects: AutofillProject[] = projectRows.map((row) => ({
      id: row.id,
      name: row.name,
      color: row.color,
      billable: row.billable,
      azureProjectId: row.azureProjectId,
    }));

    const [existingEntries, dismissals, lockedDates] = await Promise.all([
      db.query.timeEntry.findMany({
        where: and(
          eq(timeEntry.userId, session.user.id),
          gte(timeEntry.date, from),
          lte(timeEntry.date, today),
          isNull(timeEntry.deletedAt),
        ),
        columns: {
          date: true,
          projectId: true,
          duration: true,
          azureWorkItemId: true,
          description: true,
        },
      }),
      db.query.timeSuggestionFeedback.findMany({
        where: and(
          eq(timeSuggestionFeedback.userId, session.user.id),
          eq(timeSuggestionFeedback.action, "rejected"),
          like(timeSuggestionFeedback.suggestionFingerprint, "autofill:%"),
        ),
        columns: { suggestionFingerprint: true },
        orderBy: [desc(timeSuggestionFeedback.createdAt)],
        limit: 200,
      }),
      resolveLockedDates(session.user.id, dates),
    ]);

    // ── Azure DevOps signals ──
    const pullRequests: AzureDevOpsPullRequest[] = [];
    const workItems: AzureDevOpsAssignedWorkItem[] = [];
    const commits: NormalizedCommitActivity[] = [];
    const integrationReady = Boolean(config?.commitAuthor && config?.pat);

    if (integrationReady && config && projects.length > 0) {
      const pat = decrypt(config.pat);

      if (pat) {
        const client = createAzureDevOpsClient(config.organizationUrl, pat);
        const authorCandidates = buildCommitAuthorCandidates({
          configuredAuthor: config.commitAuthor,
          userEmail: profile?.email ?? null,
          userName: profile?.name ?? null,
        });

        const sinceIso = `${from}T00:00:00`;
        const untilIso = `${today}T23:59:59`;

        const buckets = await mapWithConcurrencyLimit(
          projects,
          AZURE_CONCURRENCY,
          async (item) => {
            const ref = item.azureProjectId ?? item.name;

            // Each source fails independently: a project without repos should
            // not cost us its work items.
            const [completedPrs, activePrs, assigned, projectCommits] =
              await Promise.all([
                client
                  .getPullRequests(ref, {
                    authorCandidates,
                    status: "completed",
                    since: sinceIso,
                    top: 15,
                  })
                  .catch(() => [] as AzureDevOpsPullRequest[]),
                client
                  .getPullRequests(ref, {
                    authorCandidates,
                    status: "active",
                    top: 10,
                  })
                  .catch(() => [] as AzureDevOpsPullRequest[]),
                client
                  .getAssignedWorkItems(ref, 25)
                  .catch(() => [] as AzureDevOpsAssignedWorkItem[]),
                client
                  .getRecentCommits(ref, {
                    authorCandidates,
                    fromDate: sinceIso,
                    toDate: untilIso,
                    projectLabel: item.name,
                  })
                  .catch(() => []),
              ]);

            return { completedPrs, activePrs, assigned, projectCommits };
          },
        );

        for (const bucket of buckets) {
          pullRequests.push(...bucket.completedPrs, ...bucket.activePrs);
          workItems.push(...bucket.assigned);
          commits.push(
            ...bucket.projectCommits.map((commit) => ({
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
            })),
          );
        }

        if (
          pullRequests.length === 0 &&
          commits.length === 0 &&
          workItems.length === 0
        ) {
          warnings.push(
            "Nenhuma atividade encontrada no Azure DevOps nesse período.",
          );
        }
      } else {
        warnings.push(
          "Não foi possível ler o token do Azure DevOps. Reconfigure a integração.",
        );
      }
    }

    const dailyTargetMinutes = Math.round(
      ((profile?.weeklyCapacity ?? 40) / 5) * 60,
    );

    const proposals = buildAutofillProposals({
      dates,
      today,
      projects,
      pullRequests,
      workItems,
      commits,
      existingEntries,
      lockedDates,
      dismissedFingerprints: dismissals.map((row) => row.suggestionFingerprint),
      defaults: {
        durationMinutes: profile?.timeDefaultDuration ?? 60,
        billable: profile?.timeDefaultBillable ?? true,
        dailyTargetMinutes,
      },
    });

    const payload: AutofillRadarResponse = {
      generatedAt: new Date().toISOString(),
      from,
      to: today,
      proposals,
      integrationReady,
      warnings,
    };

    console.info("[autofill_radar]", {
      userId: session.user.id,
      days,
      pullRequests: pullRequests.length,
      workItems: workItems.length,
      commits: commits.length,
      proposals: proposals.length,
    });

    setCachedSuggestions(cacheKey, payload, CACHE_TTL_MS);

    return Response.json(payload);
  } catch (error) {
    console.error("[GET /api/time-suggestions/autofill]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST - Dismisses a proposal.
 *
 * Recorded in `time_suggestion_feedback` so it both stays hidden and feeds the
 * existing weight-learning loop that tunes future suggestions.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = dismissAutofillSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { fingerprint, date, signal, score } = parsed.data;

    await db.insert(timeSuggestionFeedback).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      date,
      suggestionFingerprint: fingerprint,
      action: "rejected",
      editedFields: null,
      sourceBreakdown: JSON.stringify({ signal, autofill: true }),
      score: score ?? null,
    });

    return Response.json({ dismissed: true }, { status: 201 });
  } catch (error) {
    console.error("[POST /api/time-suggestions/autofill]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
