import { getActiveSession, getActorContext } from "@/lib/access-control";
import { isRankingEnabled, setRankingEnabled } from "@/lib/gamification";
import { gamificationSettingsSchema } from "@/lib/validations/gamification.schema";

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return Response.json({ rankingEnabled: await isRankingEnabled() });
  } catch (error: unknown) {
    console.error("[GET /api/gamification/settings]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PUT - org-wide switches. Admin only. */
export async function PUT(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const parsed = gamificationSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Dados inválidos.", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await setRankingEnabled(parsed.data.rankingEnabled, actor.userId);
    return Response.json({ rankingEnabled: parsed.data.rankingEnabled });
  } catch (error: unknown) {
    console.error("[PUT /api/gamification/settings]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
