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
import { getAccessibleProjectIds } from "@/lib/access-control";
import { createAzureDevOpsClient } from "@/lib/azure-devops/client";
import { buildCommitAuthorCandidates } from "@/lib/azure-devops/commit-author";
import { findAzureDevopsConfigByUserId } from "@/lib/azure-devops/config";
import { dailyTargetMinutes } from "@/lib/capacity";
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
  fetchMicrosoftObjectId,
  getMicrosoftAccountSnapshot,
} from "@/lib/microsoft-graph";
import {
  type FetchMeetingMemoryResult,
  fetchDocumentSignals,
  fetchMeetingMemory,
  type MicrosoftMemoryDocumentSignal,
} from "@/lib/microsoft-memory";
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
import type {
  AzureDevOpsAssignedWorkItem,
  AzureDevOpsPullRequest,
} from "@/types/azure-devops";
import type { DayPlan } from "@/types/reconstruct";

/**
 * The "Preencher meu dia" engine, detached from any transport.
 *
 * The web route and the agent API both call `buildDayPlanForUser`, so a person
 * sees the same proposal in the browser and through an assistant. Nothing here
 * reads a request or a session: the caller resolves the Microsoft token (the
 * browser from the session cookie, an agent from the stored account row) and
 * passes it in.
 */

const AZURE_CONCURRENCY = 4;
/** Days of history mined for the weekday-pattern layer. */
const PATTERN_LOOKBACK_DAYS = 60;
/** Reconstruction and manual entry share the same 30-day window. */
export const MAX_BACKFILL_DAYS = 30;
const WORKING_DAYS_PER_WEEK = 5;
const MAX_ENRICHED_MEETINGS = 3;

export type DayPlanRejection =
  | "future_date"
  | "out_of_window"
  | "period_locked";

/** The day cannot be planned; each reason maps to a distinct HTTP/agent error. */
export class DayPlanRejectedError extends Error {
  readonly reason: DayPlanRejection;

  constructor(reason: DayPlanRejection, message: string) {
    super(message);
    this.name = "DayPlanRejectedError";
    this.reason = reason;
  }
}

/**
 * Throws when `date` is outside the reconstruction window or sits in a week
 * that was already submitted or approved.
 *
 * @throws {DayPlanRejectedError}
 */
export async function assertDayPlannable(
  userId: string,
  date: string,
): Promise<void> {
  const today = todayInAppTimeZone();

  if (date > today) {
    throw new DayPlanRejectedError(
      "future_date",
      "Não é possível reconstruir um dia futuro.",
    );
  }

  if (date < shiftDay(today, -MAX_BACKFILL_DAYS)) {
    throw new DayPlanRejectedError(
      "out_of_window",
      "Reconstrução limitada aos últimos 30 dias.",
    );
  }

  const lockStatus = await getWeeklyTimesheetStatusForDate(userId, date);
  if (lockStatus.locked) {
    throw new DayPlanRejectedError(
      "period_locked",
      "Esse dia pertence a um timesheet já submetido ou aprovado.",
    );
  }
}

function hasMicrosoftScope(scopes: string | null, name: string): boolean {
  return (scopes ?? "")
    .split(/[\s,]+/)
    .some((scope) => scope.toLowerCase() === name.toLowerCase());
}

export interface BuildDayPlanForUserInput {
  userId: string;
  /** YYYY-MM-DD in the app timezone. */
  date: string;
  /**
   * Delegated Graph token. Null skips the calendar, Teams calls and Microsoft
   * 365 evidence; the plan still ships from Azure DevOps and the user's habits.
   */
  microsoftAccessToken: string | null;
  /**
   * Run the optional AI pass that rewrites descriptions. The web enables it;
   * agents write their own prose, so it defaults to off.
   */
  polish?: boolean;
}

/**
 * Builds the day plan for one user and date.
 *
 * Every source is best-effort: a missing integration degrades the plan, never
 * the request. Callers are expected to have validated the date with
 * `assertDayPlannable` first.
 */
export async function buildDayPlanForUser({
  userId,
  date,
  microsoftAccessToken,
  polish = false,
}: BuildDayPlanForUserInput): Promise<DayPlan> {
  const today = todayInAppTimeZone();
  const warnings: string[] = [];

  const profile = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: {
      name: true,
      email: true,
      role: true,
      azureId: true,
      weeklyCapacity: true,
      timeDefaultBillable: true,
    },
  });

  const role =
    profile?.role === "admin" || profile?.role === "manager"
      ? profile.role
      : "member";

  const [accessibleProjectIds, azdoConfig] = await Promise.all([
    getAccessibleProjectIds({ role, userId }),
    findAzureDevopsConfigByUserId(userId),
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
      code: true,
      clientName: true,
      color: true,
      billable: true,
      azureProjectId: true,
    },
  });

  const projects: AutofillProject[] = projectRows.map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    clientName: row.clientName,
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
        eq(timeEntry.userId, userId),
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
          eq(timeEntry.userId, userId),
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
    accessToken: microsoftAccessToken,
    userId,
    userEmail: profile?.email ?? null,
    date,
    skipPortrait: true,
  });

  warnings.push(...collaboration.warnings);
  const calendarAvailable = collaboration.sources.calendar;

  const memoryPromise = (async () => {
    const snapshot = await getMicrosoftAccountSnapshot(userId);
    const scopes = snapshot?.scope ?? null;
    const documentScope =
      hasMicrosoftScope(scopes, "Sites.Read.All") ||
      hasMicrosoftScope(scopes, "Files.Read.All");
    const attendanceScope =
      hasMicrosoftScope(scopes, "OnlineMeetings.Read") &&
      hasMicrosoftScope(scopes, "OnlineMeetingArtifact.Read.All");
    const transcriptScope = false;
    const token =
      documentScope || attendanceScope || transcriptScope
        ? microsoftAccessToken
        : null;

    const eligibleMeetings = collaboration.meetings
      .flatMap((meeting) =>
        meeting.isOnline && meeting.isOrganizer && meeting.joinWebUrl
          ? [
              {
                id: meeting.id,
                joinWebUrl: meeting.joinWebUrl,
                startIso: meeting.startIso,
              },
            ]
          : [],
      )
      .slice(0, MAX_ENRICHED_MEETINGS);

    const userObjectId =
      token && documentScope
        ? (profile?.azureId ?? (await fetchMicrosoftObjectId(token)))
        : null;

    const [documents, meetings] = await Promise.all([
      token && documentScope && profile?.email
        ? fetchDocumentSignals(token, date, profile.email, { userObjectId })
        : Promise.resolve(null),
      token && attendanceScope && profile?.email
        ? mapWithConcurrencyLimit(eligibleMeetings, 3, async (meeting) => ({
            id: meeting.id,
            result: await fetchMeetingMemory(
              token,
              meeting.joinWebUrl,
              profile.email ?? "",
              { summarize: transcriptScope, eventStartIso: meeting.startIso },
            ),
          }))
        : Promise.resolve([]),
    ]);

    return {
      documents:
        documents?.documents ?? ([] as MicrosoftMemoryDocumentSignal[]),
      meetings: new Map<string, FetchMeetingMemoryResult>(
        meetings.map((meeting) => [meeting.id, meeting.result]),
      ),
      warnings: [
        ...(documents?.source.availability === "unavailable"
          ? ["Documentos do Microsoft 365 indisponíveis no momento."]
          : []),
        ...(meetings.some(
          (meeting) =>
            meeting.result.sources.attendance.availability === "unavailable",
        )
          ? ["Relatórios de presença do Teams indisponíveis no momento."]
          : []),
        ...(meetings.some((meeting) =>
          meeting.result.sources.transcript.message?.includes("desabilitou"),
        )
          ? ["O tenant Microsoft desabilitou o acesso a transcrições."]
          : []),
      ],
      sources: {
        documents: Boolean(
          documentScope && token && documents?.source.availability === "ok",
        ),
        attendance: Boolean(
          attendanceScope &&
            token &&
            !meetings.some(
              (meeting) =>
                meeting.result.sources.attendance.availability ===
                "missing_scope",
            ),
        ),
        transcripts: Boolean(
          transcriptScope &&
            token &&
            !meetings.some(
              (meeting) =>
                meeting.result.sources.transcript.availability ===
                "missing_scope",
            ),
        ),
        documentsNeedsConsent:
          !documentScope || documents?.source.availability === "missing_scope",
        attendanceNeedsConsent: false,
        transcriptsNeedsConsent: false,
      },
    };
  })().catch((error: unknown) => {
    console.error("[day-plan] Microsoft memory unavailable:", error);
    return {
      documents: [] as MicrosoftMemoryDocumentSignal[],
      meetings: new Map<string, FetchMeetingMemoryResult>(),
      warnings: ["A memória do Microsoft 365 não respondeu agora."],
      sources: {
        documents: false,
        attendance: false,
        transcripts: false,
        documentsNeedsConsent: false,
        attendanceNeedsConsent: false,
        transcriptsNeedsConsent: false,
      },
    };
  });

  // ── Azure DevOps signals for the single day (best-effort) ──
  const pullRequests: AzureDevOpsPullRequest[] = [];
  const workItems: AzureDevOpsAssignedWorkItem[] = [];
  const commits: NormalizedCommitActivity[] = [];
  const integrationReady = Boolean(azdoConfig?.commitAuthor && azdoConfig?.pat);

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
      eq(timeSuggestionFeedback.userId, userId),
      eq(timeSuggestionFeedback.action, "rejected"),
      like(timeSuggestionFeedback.suggestionFingerprint, "autofill:%"),
    ),
    columns: { suggestionFingerprint: true },
    orderBy: [desc(timeSuggestionFeedback.createdAt)],
    limit: 200,
  });

  const targetMinutes = dailyTargetMinutes(
    profile?.weeklyCapacity,
    WORKING_DAYS_PER_WEEK,
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

  const memory = await memoryPromise;
  warnings.push(...memory.warnings);
  const events: CalendarEventInput[] = collaboration.meetings.flatMap(
    (meeting) => {
      const evidence = memory.meetings.get(meeting.id);
      const attendance = evidence?.attendance;
      const transcript = evidence?.transcriptSummary;
      if (
        attendance &&
        attendance.totalMinutes > 0 &&
        attendance.totalMinutes < 5
      ) {
        return [];
      }
      return [
        {
          id: meeting.id,
          subject: meeting.subject || meeting.title,
          title: meeting.title,
          startIso: meeting.startIso,
          endIso: meeting.endIso,
          minutes: meeting.minutes,
          attendanceMinutes: attendance?.totalMinutes || undefined,
          attendedFromIso: attendance?.intervals[0]?.joinedAt,
          summary: transcript?.text,
          confidence: meeting.confidence,
          evidence: meeting.evidence,
        },
      ];
    },
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
    documents: memory.documents.map((document) => ({
      id: document.id,
      name: document.name,
      path: document.webUrl,
      modifiedAt: document.lastModifiedDateTime,
    })),
    calls: collaboration.calls ?? [],
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
      calls: collaboration.sources.calls,
      documents: memory.sources.documents,
      attendance: memory.sources.attendance,
      transcripts: memory.sources.transcripts,
      documentsNeedsConsent: memory.sources.documentsNeedsConsent,
      attendanceNeedsConsent: memory.sources.attendanceNeedsConsent,
      transcriptsNeedsConsent: memory.sources.transcriptsNeedsConsent,
      azureDevops: integrationReady,
      commits: commits.length > 0,
      patterns: patterns.length > 0,
    },
  });

  const plan = polish
    ? await refineDayPlanWithAI(deterministic)
    : deterministic;

  console.info("[reconstruct_day]", {
    userId,
    date,
    events: events.length,
    pullRequests: pullRequests.length,
    workItemProposals: workItemProposals.length,
    commits: commits.length,
    calls: collaboration.calls?.length ?? 0,
    commitSessions: commitSessions.length,
    patterns: patterns.length,
    items: plan.items.length,
    itemsBySource: plan.items.reduce<Record<string, number>>((tally, item) => {
      tally[item.source] = (tally[item.source] ?? 0) + 1;
      return tally;
    }, {}),
    refinedBy: plan.refinedBy,
  });

  return plan;
}
