import { and, eq, gte, inArray, like, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { timeSuggestionFeedback } from "@/lib/db/schema";

/** Accepted evidence stays consumed even if its editable description changes. */
export async function getAcceptedCallIds(
  userId: string,
  from: string,
  to: string,
): Promise<Set<string>> {
  const feedback = await db
    .select({ fingerprint: timeSuggestionFeedback.suggestionFingerprint })
    .from(timeSuggestionFeedback)
    .where(
      and(
        eq(timeSuggestionFeedback.userId, userId),
        gte(timeSuggestionFeedback.date, from),
        lte(timeSuggestionFeedback.date, to),
        inArray(timeSuggestionFeedback.action, ["accepted", "edited"]),
        like(timeSuggestionFeedback.suggestionFingerprint, "teams_call:%"),
      ),
    );
  return new Set(
    feedback.map((row) => row.fingerprint.slice("teams_call:".length)),
  );
}
