import {
  and,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  like,
  lte,
  sql,
} from "drizzle-orm";
import {
  getAccessibleProjectIds,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { buildCommitAuthorCandidates } from "@/lib/azure-devops/commit-author";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { buildCollaborationDay } from "@/lib/collaboration/service";
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
import { buildCommitSessions } from "@/lib/time-assistant/commit-sessions";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import type { NormalizedCommitActivity } from "@/lib/time-assistant/engine";
import {
  buildDeterministicDayPlan,
  type CalendarEventInput,
  MIN_GAP_MINUTES,
  refineDayPlanWithAI,
  type WeekdayPattern,
} from "@/lib/time-assistant/reconstruct";
import { getWeeklyTimesheetStatusForDate } from "@/lib/time-entry-locks";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";
import { formatLocalDate, parseLocalDate } from "@/lib/utils";
import { reconstructDaySchema } from "@/lib/validations/reconstruct.schema";
import type {
  AzureDevOpsAssignedWorkItem,
  AzureDevOpsPullRequest,
} from "@/types/azure-devops";

export const maxDuration = 60;

const AZURE_CONCURRENCY = 4;
/** Days of history mined for the weekday-pattern layer. */
const PATTERN_LOOKBACK_DAYS = 60;
const MAX_BACKFILL_DAYS = 30;
const WORKING_DAYS_PER_WEEK = 5;

/**
 * POST - Builds the "Preencher meu dia" plan for one date.
 *
 * Crosses Outlook calendar events, Azure DevOps activity and the user's own
 * weekday patterns into an editable full-day proposal. Every source is
 * best-effort: a missing integration degrades the plan, never the request.
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
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = reconstructDaySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { date } = parsed.data;
    const today = todayInAppTimeZone();

    if (date > today) {
      return Response.json(
        { error: "Não é possível reconstruir um dia futuro." },
        { status: 400 },
      );
    }

    if (date < shiftDay(today, -MAX_BACKFILL_DAYS)) {
      return Response.json(
        { error: "Reconstrução limitada aos últimos 30 dias." },
        { status: 400 },
      );
    }

    const lockStatus = await getWeeklyTimesheetStatusForDate(
      session.user.id,
      date,
    );
    if (lockStatus.locked) {
      return Response.json(
        { error: "Esse dia pertence a um timesheet já submetido ou aprovado." },
        { status: 409 },
      );
    }

    const actor = getActorContext(session.user);
    const warnings: string[] = [];

    const [accessibleProjectIds, profile, azdoConfig] = await Promise.all([
      getAccessibleProjectIds(actor),
      db.query.user.findFirst({
        where: eq(user.id, session.user.id),
        columns: {
          name: true,
          email: true,
          weeklyCapacity: true,
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
            : eq(project.id, "__none__"),
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

    // ── Existing entries + weekday patterns ──
    const weekday = parseLocalDate(date).getDay();
    const patternWindowStart = shiftDay(today, -PATTERN_LOOKBACK_DAYS);

    const [existingEntries, historyRows] = await Promise.all([
      db.query.timeEntry.findMany({
        where: and(
          eq(timeEntry.userId, session.user.id),
          eq(timeEntry.date, date),
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
      db
        .select({
          projectId: timeEntry.projectId,
          description: timeEntry.description,
          date: timeEntry.date,
          occurrences: sql<number>`COUNT(*)::int`,
        })
        .from(timeEntry)
        .where(
          and(
            eq(timeEntry.userId, session.user.id),
            gte(timeEntry.date, patternWindowStart),
            lte(timeEntry.date, today),
            isNull(timeEntry.deletedAt),
          ),
        )
        .groupBy(timeEntry.projectId, timeEntry.description, timeEntry.date),
    ]);

    const projectById = new Map(projects.map((item) => [item.id, item]));

    const patternWeight = new Map<
      string,
      { projectId: string; description: string; weight: number }
    >();
    for (const row of historyRows) {
      if (parseLocalDate(row.date).getDay() !== weekday) continue;
      if (!projectById.has(row.projectId)) continue;

      const key = `${row.projectId}|${row.description.trim().toLowerCase()}`;
      const bucket = patternWeight.get(key) ?? {
        projectId: row.projectId,
        description: row.description,
        weight: 0,
      };
      bucket.weight += Number(row.occurrences);
      patternWeight.set(key, bucket);
    }

    const patterns: WeekdayPattern[] = [...patternWeight.values()]
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 5)
      .flatMap((item) => {
        const patternProject = projectById.get(item.projectId);
        if (!patternProject) return [];
        return [
          {
            projectId: patternProject.id,
            projectName: patternProject.name,
            projectColor: patternProject.color,
            billable: patternProject.billable,
            description: item.description,
            weight: item.weight,
          },
        ];
      });

    // ── Calendar via the collaboration layer (best-effort) ──
    // Cancellations, declined invitations, placeholder blocks and
    // double-booking are all resolved there, so the plan never proposes a
    // meeting that did not happen.
    const collaboration = await buildCollaborationDay({
      headers: req.headers,
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      date,
      skipPortrait: true,
    });

    warnings.push(...collaboration.warnings);
    const calendarAvailable = collaboration.sources.calendar;

    const events: CalendarEventInput[] = collaboration.meetings.map(
      (meeting) => ({
        subject: meeting.subject || meeting.title,
        title: meeting.title,
        startIso: meeting.startIso,
        endIso: meeting.endIso,
        minutes: meeting.minutes,
        confidence: meeting.confidence,
        evidence: meeting.evidence,
      }),
    );

    // ── Azure DevOps signals for the single day (best-effort) ──
    const pullRequests: AzureDevOpsPullRequest[] = [];
    const workItems: AzureDevOpsAssignedWorkItem[] = [];
    const commits: NormalizedCommitActivity[] = [];
    const integrationReady = Boolean(
      azdoConfig?.commitAuthor && azdoConfig?.pat,
    );

    if (integrationReady && azdoConfig && projects.length > 0) {
      const pat = decrypt(azdoConfig.pat);

      if (pat) {
        const client = createAzureDevOpsClient(azdoConfig.organizationUrl, pat);
        const authorCandidates = buildCommitAuthorCandidates({
          configuredAuthor: azdoConfig.commitAuthor,
          userEmail: profile?.email ?? null,
          userName: profile?.name ?? null,
        });

        const sinceIso = `${date}T00:00:00`;
        const untilIso = `${date}T23:59:59`;

        const buckets = await mapWithConcurrencyLimit(
          projects,
          AZURE_CONCURRENCY,
          async (item) => {
            const ref = item.azureProjectId ?? item.name;

            const [completedPrs, activePrs, assigned, projectCommits] =
              await Promise.all([
                client
                  .getPullRequests(ref, {
                    authorCandidates,
                    status: "completed",
                    since: sinceIso,
                    top: 10,
                  })
                  .catch(() => [] as AzureDevOpsPullRequest[]),
                client
                  .getPullRequests(ref, {
                    authorCandidates,
                    status: "active",
                    top: 5,
                  })
                  .catch(() => [] as AzureDevOpsPullRequest[]),
                client
                  .getAssignedWorkItems(ref, 15)
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
      } else {
        warnings.push(
          "Não foi possível ler o token do Azure DevOps. Reconfigure a integração.",
        );
      }
    }

    // ── Dismissed fingerprints keep rejected ideas away ──
    const dismissals = await db.query.timeSuggestionFeedback.findMany({
      where: and(
        eq(timeSuggestionFeedback.userId, session.user.id),
        eq(timeSuggestionFeedback.action, "rejected"),
        like(timeSuggestionFeedback.suggestionFingerprint, "autofill:%"),
      ),
      columns: { suggestionFingerprint: true },
      orderBy: [desc(timeSuggestionFeedback.createdAt)],
      limit: 200,
    });

    const weeklyCapacityMinutes = (profile?.weeklyCapacity ?? 40) * 60;
    const targetMinutes = Math.round(
      weeklyCapacityMinutes / WORKING_DAYS_PER_WEEK,
    );
    const existingMinutes = existingEntries.reduce(
      (sum, entry) => sum + entry.duration,
      0,
    );

    const dismissedFingerprints = dismissals.map(
      (row) => row.suggestionFingerprint,
    );

    // Only the work-item nudge is taken from the radar. Its pull-request and
    // commit signals answer a different question — "which day did you forget
    // entirely?" — and collapse a day of distinct sessions into one block.
    const workItemProposals =
      targetMinutes - existingMinutes >= MIN_GAP_MINUTES
        ? buildAutofillProposals({
            dates: [date],
            today,
            projects,
            pullRequests: [],
            workItems,
            commits: [],
            existingEntries,
            lockedDates: [],
            dismissedFingerprints,
            defaults: {
              durationMinutes: 60,
              billable: profile?.timeDefaultBillable ?? true,
              dailyTargetMinutes: targetMinutes,
            },
          }).filter((proposal) => proposal.signal === "work_item_active")
        : [];

    // Azure filters commits by a naive timestamp range, so a late-night commit
    // can arrive tagged with the neighbouring day. Trust the local date.
    const commitSessions = buildCommitSessions(
      commits.filter(
        (commit) => formatLocalDate(new Date(commit.timestamp)) === date,
      ),
    );

    const deterministic = buildDeterministicDayPlan({
      date,
      targetMinutes,
      existingMinutes,
      existingDescriptions: existingEntries.map((entry) => entry.description),
      existingWorkItemIds: existingEntries
        .map((entry) => entry.azureWorkItemId)
        .filter((id): id is number => id != null),
      events,
      commitSessions,
      pullRequests,
      workItemProposals,
      dismissedFingerprints,
      patterns,
      projects,
      defaultBillable: profile?.timeDefaultBillable ?? true,
      warnings,
      sources: {
        calendar: calendarAvailable,
        azureDevops: integrationReady,
        commits: commits.length > 0,
        patterns: patterns.length > 0,
      },
    });

    const plan = await refineDayPlanWithAI(deterministic);

    console.info("[reconstruct_day]", {
      userId: session.user.id,
      date,
      events: events.length,
      pullRequests: pullRequests.length,
      workItemProposals: workItemProposals.length,
      commits: commits.length,
      commitSessions: commitSessions.length,
      patterns: patterns.length,
      items: plan.items.length,
      itemsBySource: plan.items.reduce<Record<string, number>>(
        (tally, item) => {
          tally[item.source] = (tally[item.source] ?? 0) + 1;
          return tally;
        },
        {},
      ),
      refinedBy: plan.refinedBy,
    });

    return Response.json({ plan });
  } catch (error) {
    console.error("[POST /api/time-suggestions/reconstruct]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
