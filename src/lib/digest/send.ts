/**
 * Digest delivery.
 *
 * The `digest_log` unique index on (user, period, audience) is what makes this
 * safe to run repeatedly: the row is reserved before the e-mail goes out, so a
 * second cron tick in the same ISO week cannot send a duplicate. A row left in
 * `failed` is picked up again on the next run.
 */

import { and, eq } from "drizzle-orm";
import type { AppRole } from "@/lib/access-control";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { digestLog } from "@/lib/db/schema";
import { sendWeeklyDigestBatch } from "@/lib/email";
import { buildManagerDigest, buildMemberDigest } from "./build";
import { buildDigestNarrative } from "./narrative";
import { presentDigest } from "./presenter";
import type { Digest, DigestAudience, DigestBundle } from "./types";

export interface DigestRecipient {
  userId: string;
  name: string;
  email: string;
  role: AppRole;
  weeklyCapacity: number;
}

export type DigestSendOutcome =
  | { status: "sent"; audience: DigestAudience }
  | { status: "skipped"; audience: DigestAudience; reason: string }
  | { status: "failed"; audience: DigestAudience; reason: string };

/** Builds the digest plus its narrative, without sending or recording anything. */
export async function buildDigestBundle(
  recipient: DigestRecipient,
  audience: DigestAudience,
  today: string,
): Promise<DigestBundle | null> {
  const digest: Digest | null =
    audience === "manager"
      ? await buildManagerDigest(
          {
            userId: recipient.userId,
            name: recipient.name,
            email: recipient.email,
            role: recipient.role,
          },
          today,
        )
      : await buildMemberDigest(recipient, today);

  if (!digest) return null;

  const narrative = await buildDigestNarrative(digest);
  return { digest, narrative };
}

/**
 * Reserves this week's slot. Returns the row id when the caller should proceed,
 * or null when the digest was already delivered.
 */
async function reserveSlot(
  userId: string,
  period: string,
  audience: DigestAudience,
): Promise<string | null> {
  const id = crypto.randomUUID();

  const [inserted] = await db
    .insert(digestLog)
    .values({
      id,
      userId,
      period,
      audience,
      status: "pending",
    })
    .onConflictDoNothing()
    .returning({ id: digestLog.id });

  if (inserted) return inserted.id;

  // Someone already holds the slot: only a previous failure may be retried.
  const existing = await db.query.digestLog.findFirst({
    where: and(
      eq(digestLog.userId, userId),
      eq(digestLog.period, period),
      eq(digestLog.audience, audience),
    ),
    columns: { id: true, status: true },
  });

  if (!existing || existing.status !== "failed") return null;

  await db
    .update(digestLog)
    .set({ status: "pending", errorMessage: null })
    .where(eq(digestLog.id, existing.id));

  return existing.id;
}

/**
 * Builds, records and mails one digest. Never throws: the outcome is returned
 * so a batch run can keep going for the remaining recipients.
 */
export async function sendDigest(
  recipient: DigestRecipient,
  audience: DigestAudience,
  today: string,
): Promise<DigestSendOutcome> {
  let logId: string | null = null;

  try {
    const bundle = await buildDigestBundle(recipient, audience, today);

    if (!bundle) {
      return {
        status: "skipped",
        audience,
        reason: "sem dados para este público",
      };
    }

    const { digest, narrative } = bundle;

    // A member with a completely empty week gets nothing — a digest saying
    // "you logged zero hours" every Monday would train people to ignore it.
    if (digest.audience === "member" && digest.totalMinutes === 0) {
      return { status: "skipped", audience, reason: "semana sem lançamentos" };
    }

    if (digest.audience === "manager" && digest.teamTotalMinutes === 0) {
      return { status: "skipped", audience, reason: "equipe sem lançamentos" };
    }

    logId = await reserveSlot(recipient.userId, digest.period.period, audience);

    if (!logId) {
      return { status: "skipped", audience, reason: "já enviado nesta semana" };
    }

    const presentation = presentDigest(digest);
    const totalMinutes =
      digest.audience === "member"
        ? digest.totalMinutes
        : digest.teamTotalMinutes;

    const { sent, failed } = await sendWeeklyDigestBatch([
      {
        to: recipient.email,
        subject: presentation.subject,
        data: {
          to: recipient.email,
          recipientName: recipient.name,
          periodLabel: presentation.periodLabel,
          headline: presentation.headline,
          narrative: narrative.text,
          metrics: presentation.metrics,
          bars: presentation.bars,
          attention: presentation.attention,
          appUrl: `${getServerAppUrl()}${
            audience === "manager" ? "/dashboard/team-hours" : "/dashboard/time"
          }`,
          audience,
        },
      },
    ]);

    if (sent === 0) {
      await db
        .update(digestLog)
        .set({
          status: "failed",
          errorMessage: `Envio recusado pelo provedor (${failed} falha(s))`,
        })
        .where(eq(digestLog.id, logId));

      return { status: "failed", audience, reason: "falha no envio do e-mail" };
    }

    await db
      .update(digestLog)
      .set({
        status: "sent",
        narrative: narrative.text,
        provider: narrative.provider,
        stats: JSON.stringify(digest),
        totalMinutes,
        errorMessage: null,
      })
      .where(eq(digestLog.id, logId));

    return { status: "sent", audience };
  } catch (error: unknown) {
    const reason =
      error instanceof Error ? error.message : "erro inesperado no digest";

    console.error(
      `[digest] failed for ${recipient.userId} (${audience}):`,
      error,
    );

    if (logId) {
      await db
        .update(digestLog)
        .set({ status: "failed", errorMessage: reason.slice(0, 400) })
        .where(eq(digestLog.id, logId))
        .catch(() => undefined);
    }

    return { status: "failed", audience, reason };
  }
}
