import { desc, eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { appRelease } from "@/lib/db/schema";
import { createReleaseSchema } from "@/lib/validations/release.schema";

/**
 * GET /api/releases
 * - All authenticated users: published releases.
 * - Admins: all releases (draft + published).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  try {
    const releases = await db.query.appRelease.findMany({
      where:
        actor.role === "admin" ? undefined : eq(appRelease.status, "published"),
      with: {
        author: { columns: { id: true, name: true, image: true } },
      },
      orderBy: [desc(appRelease.publishedAt), desc(appRelease.createdAt)],
    });

    return Response.json({ releases });
  } catch (err) {
    console.error("[GET /api/releases]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/releases
 * Admin only. Creates a new release draft.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = createReleaseSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const [created] = await db
      .insert(appRelease)
      .values({
        id: crypto.randomUUID(),
        versionTag: parsed.data.versionTag,
        title: parsed.data.title,
        description: parsed.data.description,
        videoUrl: parsed.data.videoUrl ?? null,
        status: "draft",
        authorId: actor.userId,
      })
      .returning();

    return Response.json({ release: created }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/releases]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
