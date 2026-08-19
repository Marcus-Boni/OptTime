import { eq } from "drizzle-orm";
import { getActiveSession } from "@/lib/access-control";
import { db } from "@/lib/db";
import { userGamification } from "@/lib/db/schema";
import {
  ensureGamificationState,
  getGamificationProfile,
} from "@/lib/gamification";
import { gamificationPreferencesSchema } from "@/lib/validations/gamification.schema";

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const profile = await getGamificationProfile(session.user.id);
    return Response.json({ profile });
  } catch (error: unknown) {
    console.error("[GET /api/gamification/profile]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PATCH - update the caller's own gamification preferences. */
export async function PATCH(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = gamificationPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await ensureGamificationState(session.user.id);

    const [updated] = await db
      .update(userGamification)
      .set(parsed.data)
      .where(eq(userGamification.userId, session.user.id))
      .returning({
        publicProfile: userGamification.publicProfile,
        celebrationsEnabled: userGamification.celebrationsEnabled,
      });

    return Response.json({ preferences: updated });
  } catch (error: unknown) {
    console.error("[PATCH /api/gamification/profile]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
