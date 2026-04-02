import { randomBytes } from "crypto";
import { z } from "zod";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { reminderLog } from "@/lib/db/schema";
import { sendHoursReminderBatch } from "@/lib/email";
import {
  getISOWeekPeriod,
  resolveReminderRecipients,
} from "@/lib/notifications/resolve-recipients";
import { sendReminderSchema } from "@/lib/validations/reminder.schema";

export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = sendReminderSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const { userIds, note, scope: requestedScope } = parsed.data;

  // Managers are always restricted to direct_reports
  const scope =
    actor.role === "admin"
      ? (requestedScope ?? "all")
      : "direct_reports";

  const recipients = await resolveReminderRecipients({
    actorId: actor.userId,
    scope,
    condition: "all",
    userIds,
  });

  if (recipients.length === 0) {
    return Response.json({ sent: 0, failed: 0, logId: null });
  }

  const timesheetUrl = `${getServerAppUrl()}/dashboard/time`;
  const period = getISOWeekPeriod();

  const { sent, failed } = await sendHoursReminderBatch(recipients, {
    period,
    condition: "all",
    senderName: session.user.name,
    personalNote: note,
    timesheetUrl,
  });

  const logId = randomBytes(16).toString("hex");
  try {
    await db.insert(reminderLog).values({
      id: logId,
      scheduleId: null,
      triggeredBy: "manual",
      triggeredById: actor.userId,
      personalNote: note ?? null,
      recipientCount: recipients.length,
      failedCount: failed,
    });
  } catch (dbErr) {
    console.error(
      "[POST /api/notifications/reminders] log insert failed:",
      dbErr,
    );
  }

  if (sent === 0 && failed > 0) {
    return Response.json(
      { error: "Falha ao enviar e-mails" },
      { status: 502 },
    );
  }

  return Response.json({ sent, failed, logId });
}
