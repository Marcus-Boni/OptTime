import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { timeSuggestionFeedback } from "@/lib/db/schema";
import { clearCachedSuggestionsByPrefix } from "@/lib/time-assistant/cache";
import { createSuggestionFeedbackSchema } from "@/lib/validations/time-suggestion.schema";

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsed = createSuggestionFeedbackSchema.safeParse(await req.json());

    if (!parsed.success) {
      return Response.json(
        { error: "Dados inválidos", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const input = parsed.data;

    await db.insert(timeSuggestionFeedback).values({
      id: crypto.randomUUID(),
      userId: session.user.id,
      date: input.date,
      suggestionFingerprint: input.suggestionFingerprint,
      action: input.action,
      editedFields: input.editedFields?.join(",") ?? null,
      sourceBreakdown: input.sourceBreakdown
        ? JSON.stringify(input.sourceBreakdown)
        : null,
      score:
        input.score !== undefined
          ? Math.round(Math.max(0, Math.min(1, input.score)) * 100)
          : null,
    });

    console.info("[time_suggestion_feedback]", {
      userId: session.user.id,
      date: input.date,
      action: input.action,
      fingerprint: input.suggestionFingerprint,
    });

    clearCachedSuggestionsByPrefix(`${session.user.id}:`);

    return Response.json({ ok: true });
  } catch (error) {
    console.error("[POST /api/time-suggestions/feedback]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
