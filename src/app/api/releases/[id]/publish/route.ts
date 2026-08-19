import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { getServerAppUrl } from "@/lib/app-url";
import { db } from "@/lib/db";
import { appRelease, user } from "@/lib/db/schema";
import { sendReleaseNotesBatch } from "@/lib/email";
import { publishReleaseSchema } from "@/lib/validations/release.schema";

/**
 * POST /api/releases/[id]/publish
 * Admin only. Publishes a draft release.
 * Optionally sends release notes to all active users (notifyUsers: true).
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  const parsed = publishReleaseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const existing = await db.query.appRelease.findFirst({
      where: eq(appRelease.id, id),
      with: { author: { columns: { name: true } } },
    });

    if (!existing) {
      return Response.json({ error: "Release not found" }, { status: 404 });
    }

    if (existing.status === "published") {
      return Response.json(
        { error: "Release is already published" },
        { status: 409 },
      );
    }

    const publishedAt = new Date();

    const [published] = await db
      .update(appRelease)
      .set({ status: "published", publishedAt })
      .where(eq(appRelease.id, id))
      .returning();

    let emailResult: { sent: number; failed: number } | null = null;

    if (parsed.data.notifyUsers) {
      const activeUsers = await db.query.user.findMany({
        where: eq(user.isActive, true),
        columns: { email: true, name: true },
      });

      if (activeUsers.length > 0) {
        const appUrl = getServerAppUrl();
        emailResult = await sendReleaseNotesBatch(activeUsers, {
          versionTag: published.versionTag,
          title: published.title,
          description: published.description,
          videoUrl: published.videoUrl,
          authorName: existing.author.name,
          publishedAt: publishedAt.toISOString(),
          changelogUrl: `${appUrl}/dashboard/releases`,
        });
      }
    }

    return Response.json({
      release: published,
      email: emailResult,
    });
  } catch (err) {
    console.error(`[POST /api/releases/${id}/publish]`, err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
