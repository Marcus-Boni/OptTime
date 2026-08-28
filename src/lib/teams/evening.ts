/**
 * Lembrete Vespertino Interativo — the 17h30 personal end-of-day digest.
 *
 * For each opted-in user: how much was logged today, the gap to the daily
 * target, and 1-click actions (open the AI day reconstructor, open the time
 * page). Delivery prefers the user's personal Teams webhook (Power Automate
 * "notify me" flow) and falls back to e-mail. One log row per user per day
 * makes cron retries harmless.
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
import { sendEmail } from "@/lib/email";
import { decrypt } from "@/lib/encryption";
import { mapWithConcurrencyLimit } from "@/lib/time-assistant/concurrency";
import { todayInAppTimeZone } from "@/lib/timezone";
import { formatDuration, parseLocalDate } from "@/lib/utils";
import { buildEveningCard } from "./cards";
import { postTeamsCard } from "./client";
import { getTeamsSettings } from "./settings";

const DELIVERY_CONCURRENCY = 4;
/** Below this gap the day counts as closed — no nudge. */
const MIN_GAP_MINUTES = 20;
const WORKING_DAYS_PER_WEEK = 5;

export interface EveningRunResult {
  status: "completed" | "skipped";
  reason: string | null;
  sent: number;
  skipped: number;
  failed: number;
}

interface EveningCandidate {
  id: string;
  name: string;
  email: string;
  weeklyCapacity: number;
  teamsWebhookUrl: string | null;
}

function buildEveningEmailHtml(input: {
  firstName: string;
  dateLabel: string;
  loggedMinutes: number;
  targetMinutes: number;
  topProjectName: string | null;
  appUrl: string;
}): string {
  const gap = Math.max(0, input.targetMinutes - input.loggedMinutes);
  const summary =
    input.loggedMinutes > 0
      ? `Você registrou <strong>${formatDuration(input.loggedMinutes)}</strong> hoje${input.topProjectName ? `, a maior parte em <strong>${input.topProjectName}</strong>` : ""}.`
      : "Você ainda não registrou horas hoje.";
  const nudge =
    gap > 0
      ? `Faltam <strong>${formatDuration(gap)}</strong> para fechar o dia de ${formatDuration(input.targetMinutes)}.`
      : "Meta do dia batida — bom descanso. ✅";

  return `
  <div style="background:#0a0a0a;padding:32px 16px;font-family:'Segoe UI',Arial,sans-serif;">
    <div style="max-width:520px;margin:0 auto;background:#171717;border:1px solid rgba(255,255,255,0.1);border-radius:16px;overflow:hidden;">
      <div style="padding:24px 28px;background:linear-gradient(135deg,rgba(249,115,22,0.18),rgba(249,115,22,0.04));">
        <p style="margin:0;color:#fb923c;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;font-weight:600;">OptSolv Time · ${input.dateLabel}</p>
        <h1 style="margin:8px 0 0;color:#fafafa;font-size:20px;">🌆 Fim de dia, ${input.firstName}</h1>
      </div>
      <div style="padding:24px 28px;color:#d4d4d4;font-size:14px;line-height:1.6;">
        <p style="margin:0 0 8px;">${summary}</p>
        <p style="margin:0 0 20px;">${nudge}</p>
        <a href="${input.appUrl}/dashboard/time?reconstruct=1"
           style="display:inline-block;background:#f97316;color:#ffffff;text-decoration:none;font-weight:600;padding:12px 20px;border-radius:10px;margin-right:8px;">✨ Preencher meu dia com IA</a>
        <a href="${input.appUrl}/dashboard/time"
           style="display:inline-block;color:#fb923c;text-decoration:none;font-weight:600;padding:12px 8px;">Abrir registro de tempo →</a>
      </div>
      <div style="padding:16px 28px;border-top:1px solid rgba(255,255,255,0.06);color:#737373;font-size:12px;">
        Você recebe este lembrete porque o digest vespertino está ativo no seu perfil.
      </div>
    </div>
  </div>`;
}

async function alreadyNotified(
  userId: string,
  dateKey: string,
): Promise<boolean> {
  const existing = await db.query.teamsNotificationLog.findFirst({
    where: and(
      eq(teamsNotificationLog.kind, "evening"),
      eq(teamsNotificationLog.targetKey, userId),
      eq(teamsNotificationLog.dateKey, dateKey),
    ),
    columns: { id: true },
  });
  return Boolean(existing);
}

async function writeLog(
  userId: string,
  dateKey: string,
  status: "sent" | "skipped" | "failed",
  channel: "teams" | "email" | "none",
  detail: string | null,
): Promise<void> {
  try {
    await db
      .insert(teamsNotificationLog)
      .values({
        id: crypto.randomUUID(),
        kind: "evening",
        targetKey: userId,
        dateKey,
        status,
        channel,
        detail,
      })
      .onConflictDoNothing();
  } catch (error: unknown) {
    console.error("[teams-evening] log write failed:", error);
  }
}

export async function runEveningDigest(): Promise<EveningRunResult> {
  const today = todayInAppTimeZone();
  const weekday = parseLocalDate(today).getDay();

  if (weekday === 0 || weekday === 6) {
    return {
      status: "skipped",
      reason: "Fim de semana — sem lembrete.",
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const settings = await getTeamsSettings();
  if (!settings.enabled || !settings.eveningEnabled) {
    return {
      status: "skipped",
      reason: "Digest vespertino desabilitado nas configurações do Teams.",
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const candidates = (await db.query.user.findMany({
    where: and(eq(user.isActive, true), eq(user.eveningDigestEnabled, true)),
    columns: {
      id: true,
      name: true,
      email: true,
      weeklyCapacity: true,
      teamsWebhookUrl: true,
    },
  })) as EveningCandidate[];

  if (candidates.length === 0) {
    return {
      status: "completed",
      reason: "Nenhum usuário com digest vespertino ativo.",
      sent: 0,
      skipped: 0,
      failed: 0,
    };
  }

  const userIds = candidates.map((item) => item.id);

  const todayRows = await db
    .select({
      userId: timeEntry.userId,
      projectName: project.name,
      minutes: sql<number>`COALESCE(SUM(${timeEntry.duration}), 0)::int`,
    })
    .from(timeEntry)
    .innerJoin(project, eq(timeEntry.projectId, project.id))
    .where(
      and(
        gte(timeEntry.date, today),
        lte(timeEntry.date, today),
        isNull(timeEntry.deletedAt),
        inArray(timeEntry.userId, userIds),
      ),
    )
    .groupBy(timeEntry.userId, project.name);

  const byUser = new Map<
    string,
    { minutes: number; topProject: string | null; topMinutes: number }
  >();
  for (const row of todayRows) {
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

  const appUrl = getServerAppUrl();
  const dateLabel = format(parseLocalDate(today), "EEEE, dd/MM", {
    locale: ptBR,
  });

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  await mapWithConcurrencyLimit(
    candidates,
    DELIVERY_CONCURRENCY,
    async (candidate) => {
      try {
        if (await alreadyNotified(candidate.id, today)) {
          skipped += 1;
          return;
        }

        const stats = byUser.get(candidate.id) ?? {
          minutes: 0,
          topProject: null,
          topMinutes: 0,
        };
        const targetMinutes = Math.round(
          ((candidate.weeklyCapacity ?? 40) * 60) / WORKING_DAYS_PER_WEEK,
        );
        const gap = targetMinutes - stats.minutes;

        if (gap < MIN_GAP_MINUTES) {
          skipped += 1;
          await writeLog(
            candidate.id,
            today,
            "skipped",
            "none",
            "Meta do dia atingida.",
          );
          return;
        }

        const firstName = candidate.name.split(" ")[0] ?? candidate.name;

        const personalWebhook = candidate.teamsWebhookUrl
          ? decrypt(candidate.teamsWebhookUrl) || null
          : null;

        if (personalWebhook) {
          const card = buildEveningCard({
            firstName,
            dateLabel,
            loggedMinutes: stats.minutes,
            targetMinutes,
            topProjectName: stats.topProject,
            suggestions: [
              {
                label: "✨ Preencher meu dia com IA",
                url: `${appUrl}/dashboard/time?reconstruct=1`,
              },
            ],
            appUrl,
          });

          const result = await postTeamsCard(personalWebhook, card);
          if (result.ok) {
            sent += 1;
            await writeLog(candidate.id, today, "sent", "teams", null);
            return;
          }

          console.error(
            "[teams-evening] webhook failed, falling back to email",
            {
              userId: candidate.id,
              error: result.error,
            },
          );
        }

        await sendEmail({
          to: candidate.email,
          subject: `🌆 Feche seu dia — faltam ${formatDuration(gap)}`,
          html: buildEveningEmailHtml({
            firstName,
            dateLabel,
            loggedMinutes: stats.minutes,
            targetMinutes,
            topProjectName: stats.topProject,
            appUrl,
          }),
        });

        sent += 1;
        await writeLog(candidate.id, today, "sent", "email", null);
      } catch (error: unknown) {
        failed += 1;
        console.error("[teams-evening] delivery failed:", error);
        await writeLog(
          candidate.id,
          today,
          "failed",
          "none",
          error instanceof Error ? error.message.slice(0, 200) : "Erro",
        );
      }
    },
  );

  console.info("[teams_evening_run]", { sent, skipped, failed });

  return { status: "completed", reason: null, sent, skipped, failed };
}
