import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { suggestion } from "@/lib/db/schema";
import { updateSuggestionStatusSchema } from "@/lib/validations/suggestion.schema";

/**
 * PATCH /api/suggestions/[id]
 * Admin-only: update suggestion status and optional admin notes.
 */
export async function PATCH(
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

  const parsed = updateSuggestionStatusSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const existing = await db.query.suggestion.findFirst({
      where: eq(suggestion.id, id),
    });

    if (!existing) {
      return Response.json({ error: "Not Found" }, { status: 404 });
    }

    const [updated] = await db
      .update(suggestion)
      .set({
        status: parsed.data.status,
        adminNotes: parsed.data.adminNotes ?? existing.adminNotes,
        reviewedById: actor.userId,
        reviewedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(suggestion.id, id))
      .returning();

    return Response.json({ suggestion: updated });
  } catch (err) {
    console.error("[PATCH /api/suggestions/:id]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
