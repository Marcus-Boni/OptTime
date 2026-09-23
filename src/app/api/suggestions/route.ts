import { desc, eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { suggestion, suggestionAttachment } from "@/lib/db/schema";
import { createSuggestionSchema } from "@/lib/validations/suggestion.schema";

/**
 * GET /api/suggestions
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  try {
    const suggestions = await db.query.suggestion.findMany({
      where:
        actor.role === "admin"
          ? undefined
          : eq(suggestion.userId, actor.userId),
      with: {
        user: {
          columns: { id: true, name: true, email: true, image: true },
        },
        reviewedBy: {
          columns: { id: true, name: true },
        },
        attachments: true,
      },
      orderBy: [desc(suggestion.createdAt)],
    });

    return Response.json({ suggestions });
  } catch (err) {
    console.error("[GET /api/suggestions]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/suggestions
 * Any authenticated user can submit a suggestion with optional image attachments.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);

  const parsed = createSuggestionSchema.safeParse(await req.json());
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const suggestionId = crypto.randomUUID();
    const [created] = await db
      .insert(suggestion)
      .values({
        id: suggestionId,
        userId: actor.userId,
        title: parsed.data.title,
        description: parsed.data.description,
        status: "pending",
      })
      .returning();

    let createdAttachments: Array<typeof suggestionAttachment.$inferSelect> =
      [];
    if (parsed.data.attachments && parsed.data.attachments.length > 0) {
      createdAttachments = await db
        .insert(suggestionAttachment)
        .values(
          parsed.data.attachments.map((att) => ({
            id: crypto.randomUUID(),
            suggestionId,
            fileName: att.fileName,
            fileSize: att.fileSize,
            contentType: att.contentType,
            url: att.url,
          })),
        )
        .returning();
    }

    return Response.json(
      {
        suggestion: {
          ...created,
          attachments: createdAttachments,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("[POST /api/suggestions]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
