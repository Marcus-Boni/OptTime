import { desc, eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { resolveTodayInTimeZone } from "@/lib/ai/context";
import { db } from "@/lib/db";
import { digestLog, user } from "@/lib/db/schema";
import { presentDigest } from "@/lib/digest/presenter";
import { buildDigestBundle } from "@/lib/digest/send";
import type { DigestAudience } from "@/lib/digest/types";

/** Building the digest runs several queries plus an AI call. */
export const maxDuration = 60;

function resolveAudience(raw: string | null): DigestAudience {
  return raw === "manager" ? "manager" : "member";
}

/**
 * GET - The current user's own digest, rendered but not sent.
 *
 * Lets people see exactly what Monday's e-mail will say before it goes out, and
 * gives managers a way to read the team view on demand. Nothing is recorded in
 * `digest_log`, so a preview never consumes the week's send slot.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = getActorContext(session.user);
    const { searchParams } = new URL(req.url);
    const audience = resolveAudience(searchParams.get("audience"));

    if (audience === "manager" && actor.role === "member") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const timeZone =
      searchParams.get("timezone") ??
      req.headers.get("x-timezone") ??
      "America/Sao_Paulo";
    const today = resolveTodayInTimeZone(timeZone);

    const profile = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        name: true,
        email: true,
        weeklyCapacity: true,
        digestEnabled: true,
      },
    });

    if (!profile) {
      return Response.json(
        { error: "Usuário não encontrado" },
        { status: 404 },
      );
    }

    const bundle = await buildDigestBundle(
      {
        userId: session.user.id,
        name: profile.name,
        email: profile.email,
        role: actor.role,
        weeklyCapacity: profile.weeklyCapacity,
      },
      audience,
      today,
    );

    if (!bundle) {
      return Response.json({
        audience,
        available: false,
        reason:
          audience === "manager"
            ? "Você não tem colaboradores no seu escopo."
            : "Não há dados para o período.",
      });
    }

    const lastSent = await db.query.digestLog.findFirst({
      where: eq(digestLog.userId, session.user.id),
      orderBy: [desc(digestLog.createdAt)],
      columns: { period: true, status: true, createdAt: true },
    });

    return Response.json({
      audience,
      available: true,
      digestEnabled: profile.digestEnabled,
      digest: bundle.digest,
      narrative: bundle.narrative,
      presentation: presentDigest(bundle.digest),
      lastSent: lastSent
        ? {
            period: lastSent.period,
            status: lastSent.status,
            at: lastSent.createdAt.toISOString(),
          }
        : null,
    });
  } catch (error) {
    console.error("[GET /api/digest/preview]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
