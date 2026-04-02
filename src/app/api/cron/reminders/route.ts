import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { reminderLog, reminderSchedule } from "@/lib/db/schema";
import { sendHoursReminderBatch } from "@/lib/email";
import {
  getISOWeekPeriod,
  resolveReminderRecipients,
} from "@/lib/notifications/resolve-recipients";

/** Returns current day-of-week (0=Sun…6=Sat), hour, minute in a given timezone. */
function getLocalTime(tz: string): {
  dayOfWeek: number;
  hour: number;
  minute: number;
} {
  const now = new Date();
  const dayFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "short",
  });
  const timeFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const dayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const dayStr = dayFormatter.format(now);
  const dayOfWeek = dayMap[dayStr] ?? 0;

  const parts = timeFormatter.formatToParts(now);
  const rawHour = parts.find((p) => p.type === "hour")?.value ?? "0";
  // hour12: false can produce "24" for midnight in some environments; normalize
  const hour = parseInt(rawHour) % 24;
  const minute = parseInt(
    parts.find((p) => p.type === "minute")?.value ?? "0",
  );

  return { dayOfWeek, hour, minute };
}

export async function POST(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;

  if (!token || token !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const schedule = await db.query.reminderSchedule.findFirst({
    where: eq(reminderSchedule.enabled, true),
  });

  if (!schedule) {
    return Response.json({
      triggered: 0,
      skipped: 1,
      message: "No enabled schedule",
    });
  }

  // Idempotency: skip if triggered in the last 50 minutes
  if (schedule.lastTriggeredAt) {
    const diffMs = Date.now() - schedule.lastTriggeredAt.getTime();
    if (diffMs < 50 * 60 * 1000) {
      return Response.json({
        triggered: 0,
        skipped: 1,
        message: "Already triggered recently",
      });
    }
  }

  const { dayOfWeek, hour, minute } = getLocalTime(schedule.timezone);

  const dayMatch = (schedule.daysOfWeek as number[]).includes(dayOfWeek);
  const hourMatch = schedule.hour === hour;
  // Allow ±5 minute window
  const minuteMatch = Math.abs(schedule.minute - minute) <= 5;

  if (!dayMatch || !hourMatch || !minuteMatch) {
    return Response.json({
      triggered: 0,
      skipped: 1,
      message: "Not scheduled for this time",
    });
  }

  const recipients = await resolveReminderRecipients({
    actorId: schedule.createdById,
    scope: schedule.targetScope as "all" | "direct_reports",
    condition: schedule.condition as "all" | "not_submitted",
  });

  if (recipients.length === 0) {
    return Response.json({
      triggered: 1,
      skipped: 0,
      totalSent: 0,
      totalFailed: 0,
    });
  }

  const timesheetUrl = `${getServerAppUrl()}/dashboard/time`;
  const period = getISOWeekPeriod();

  const { sent, failed } = await sendHoursReminderBatch(recipients, {
    period,
    condition: schedule.condition as "all" | "not_submitted",
    senderName: "OptSolv Time",
    timesheetUrl,
  });

  // Update lastTriggeredAt and insert log
  await db
    .update(reminderSchedule)
    .set({ lastTriggeredAt: new Date() })
    .where(eq(reminderSchedule.id, schedule.id));

  const logId = randomBytes(16).toString("hex");
  await db.insert(reminderLog).values({
    id: logId,
    scheduleId: schedule.id,
    triggeredBy: "schedule",
    triggeredById: null,
    personalNote: null,
    recipientCount: recipients.length,
    failedCount: failed,
  });

  return Response.json({
    triggered: 1,
    skipped: 0,
    totalSent: sent,
    totalFailed: failed,
  });
}
