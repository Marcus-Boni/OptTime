/**
 * Standup Squad Digest — yesterday's consolidated hours in the team channel.
 *
 * Runs from /api/cron/teams-standup on weekday mornings. Idempotent per day
 * through the (kind, targetKey, dateKey) unique index: a retried cron sees the
 * existing row and skips. "Yesterday" is the previous BUSINESS day, so Monday
 * reports Friday instead of an empty Sunday.
 */

import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { and, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import {
  project,
  teamsNotificationLog,
  timeEntry,
  user,
} from "@/lib/db/schema";
import { shiftDay, todayInAppTimeZone } from "@/lib/timezone";
import { parseLocalDate } from "@/lib/utils";
import { buildStandupCard, type StandupRow } from "./cards";
import { postTeamsCard } from "./client";
import { getTeamsSettings } from "./settings";

export interface StandupRunResult {
  status: "sent" | "skipped" | "failed";
  reason: string | null;
  referenceDate: string | null;
  people: number;
}

/** Previous business day in YYYY-MM-DD (Mon → Fri, weekend → Fri). */
export function previousBusinessDay(today: string): string {
  const weekday = parseLocalDate(today).getDay();
  if (weekday === 1) return shiftDay(today, -3); // Monday → Friday
  if (weekday === 0) return shiftDay(today, -2); // Sunday → Friday
  return shiftDay(today, -1);
}

async function alreadyDelivered(dateKey: string): Promise<boolean> {
  const existing = await db.query.teamsNotificationLog.findFirst({
    where: and(
      eq(teamsNotificationLog.kind, "standup"),
      eq(teamsNotificationLog.targetKey, "channel"),
      eq(teamsNotificationLog.dateKey, dateKey),
    ),
    columns: { id: true },
  });
  return Boolean(existing);
}

async function writeLog(
  dateKey: string,
  status: "sent" | "skipped" | "failed",
  detail: string | null,
): Promise<void> {
  try {
    await db
      .insert(teamsNotificationLog)
      .values({
        id: crypto.randomUUID(),
        kind: "standup",
        targetKey: "channel",
        dateKey,
        status,
        channel: status === "sent" ? "teams" : "none",
        detail,
      })
      .onConflictDoNothing();
  } catch (error: unknown) {
    console.error("[teams-standup] log write failed:", error);
  }
}

export async function runStandupDigest(): Promise<StandupRunResult> {
  const today = todayInAppTimeZone();

  const settings = await getTeamsSettings();
  if (!settings.enabled || !settings.standupEnabled) {
    return {
      status: "skipped",
      reason: "Integração Teams desabilitada.",
      referenceDate: null,
      people: 0,
    };
  }

  if (!settings.channelWebhookUrl) {
    return {
      status: "skipped",
      reason: "Webhook do canal não configurado.",
      referenceDate: null,
      people: 0,
    };
  }

  if (await alreadyDelivered(today)) {
    return {
      status: "skipped",
      reason: "Digest de hoje já enviado.",
      referenceDate: null,
      people: 0,
    };
  }

  const referenceDate = previousBusinessDay(today);

  const activeUsers = await db.query.user.findMany({
    where: eq(user.isActive, true),
    columns: { id: true, name: true },
    orderBy: (fields, { asc }) => [asc(fields.name)],
  });

  if (activeUsers.length === 0) {
    await writeLog(today, "skipped", "Nenhum usuário ativo.");
    return {
      status: "skipped",
      reason: "Nenhum usuário ativo.",
      referenceDate,
      people: 0,
    };
  }

  const userIds = activeUsers.map((item) => item.id);

  const perProject = await db
    .select({
      userId: timeEntry.userId,
      projectName: project.name,
      minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
    })
    .from(timeEntry)
    .innerJoin(project, eq(timeEntry.projectId, project.id))
    .where(
      and(
        inArray(timeEntry.userId, userIds),
        gte(timeEntry.date, referenceDate),
        lte(timeEntry.date, referenceDate),
        isNull(timeEntry.deletedAt),
      ),
    )
    .groupBy(timeEntry.userId, project.name);

  const byUser = new Map<
    string,
    { minutes: number; topProject: string | null; topMinutes: number }
  >();
  for (const row of perProject) {
    const bucket = byUser.get(row.userId) ?? {
      minutes: 0,
      topProject: null,
      topMinutes: 0,
    };
    const minutes = Number(row.minutes);
    bucket.minutes += minutes;
    if (minutes > bucket.topMinutes) {
      bucket.topMinutes = minutes;
      bucket.topProject = row.projectName;
    }
    byUser.set(row.userId, bucket);
  }

  const rows: StandupRow[] = activeUsers
    .map((item) => ({
      name: item.name,
      minutes: byUser.get(item.id)?.minutes ?? 0,
      topProject: byUser.get(item.id)?.topProject ?? null,
    }))
    .sort((a, b) => b.minutes - a.minutes);

  const totalMinutes = rows.reduce((sum, row) => sum + row.minutes, 0);
  const dateLabel = format(parseLocalDate(referenceDate), "EEEE, dd/MM", {
    locale: ptBR,
  });

  const card = buildStandupCard({
    dateLabel,
    rows,
    totalMinutes,
    appUrl: getServerAppUrl(),
  });

  const result = await postTeamsCard(settings.channelWebhookUrl, card);

  if (!result.ok) {
    await writeLog(today, "failed", result.error);
    return {
      status: "failed",
      reason: result.error,
      referenceDate,
      people: rows.length,
    };
  }

  await writeLog(today, "sent", `ref=${referenceDate} pessoas=${rows.length}`);

  console.info("[teams_standup_sent]", {
    referenceDate,
    people: rows.length,
    totalMinutes,
  });

  return { status: "sent", reason: null, referenceDate, people: rows.length };
}
