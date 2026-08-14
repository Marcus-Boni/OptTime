import { eq } from "drizzle-orm";
import { resolveTodayInTimeZone } from "@/lib/ai/context";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { type DigestRecipient, sendDigest } from "@/lib/digest/send";
import type { DigestAudience } from "@/lib/digest/types";

/** Sending N digests with an AI narrative each needs a generous budget. */
export const maxDuration = 300;

const DEFAULT_TIMEZONE = "America/Sao_Paulo";
/** Monday. The digest always covers the week that just ended. */
const DIGEST_WEEKDAY = 1;
/** Recipients processed at a time, to stay friendly with the mail provider. */
const BATCH_SIZE = 4;

function normalizeRole(role: string): DigestRecipient["role"] {
  return role === "admin" || role === "manager" ? role : "member";
}

function currentWeekdayIn(timeZone: string): number {
  const label = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(new Date());

  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  return map[label] ?? -1;
}

/**
 * POST - Sends the weekly AI digest.
 *
 * Guarded by CRON_SECRET and safe to call repeatedly: delivery is deduplicated
 * per user, ISO week and audience by `digest_log`. Managers receive two
 * digests — their own hours and their team's.
 *
 * Query params:
 *   `force=true`  ignore the Monday check (for manual runs)
 *   `userId=<id>` restrict the run to a single user (for testing)
 */
export async function POST(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || token !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";
    const onlyUserId = searchParams.get("userId");
    const timeZone = searchParams.get("timezone") ?? DEFAULT_TIMEZONE;

    if (!force && currentWeekdayIn(timeZone) !== DIGEST_WEEKDAY) {
      return Response.json({
        sent: 0,
        skipped: 0,
        message: "Fora da janela de envio (apenas segunda-feira).",
      });
    }

    const today = resolveTodayInTimeZone(timeZone);

    const recipients = await db.query.user.findMany({
      where: onlyUserId ? eq(user.id, onlyUserId) : eq(user.isActive, true),
      columns: {
        id: true,
        name: true,
        email: true,
        role: true,
        weeklyCapacity: true,
        isActive: true,
        digestEnabled: true,
      },
    });

    const eligible: DigestRecipient[] = recipients
      .filter((row) => row.isActive && row.digestEnabled)
      .map((row) => ({
        userId: row.id,
        name: row.name,
        email: row.email,
        role: normalizeRole(row.role),
        weeklyCapacity: row.weeklyCapacity,
      }));

    // Every recipient gets their own digest; leaders also get the team view.
    const jobs: Array<{
      recipient: DigestRecipient;
      audience: DigestAudience;
    }> = [];

    for (const recipient of eligible) {
      jobs.push({ recipient, audience: "member" });

      if (recipient.role === "manager" || recipient.role === "admin") {
        jobs.push({ recipient, audience: "manager" });
      }
    }

    let sent = 0;
    let skipped = 0;
    let failed = 0;
    const failures: string[] = [];

    for (let index = 0; index < jobs.length; index += BATCH_SIZE) {
      const batch = jobs.slice(index, index + BATCH_SIZE);

      const outcomes = await Promise.all(
        batch.map((job) => sendDigest(job.recipient, job.audience, today)),
      );

      outcomes.forEach((outcome, offset) => {
        const job = batch[offset];

        if (outcome.status === "sent") {
          sent += 1;
        } else if (outcome.status === "skipped") {
          skipped += 1;
        } else {
          failed += 1;
          if (job) {
            failures.push(
              `${job.recipient.email} (${job.audience}): ${outcome.reason}`,
            );
          }
        }
      });
    }

    console.info("[cron/weekly-digest]", {
      today,
      candidates: jobs.length,
      sent,
      skipped,
      failed,
    });

    return Response.json({
      today,
      candidates: jobs.length,
      sent,
      skipped,
      failed,
      failures: failures.slice(0, 10),
    });
  } catch (error) {
    console.error("[POST /api/cron/weekly-digest]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
