import { getActiveSession, getActorContext } from "@/lib/access-control";
import { getTeamMural } from "@/lib/gamification";

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const mural = await getTeamMural(getActorContext(session.user));
    return Response.json({ mural });
  } catch (error: unknown) {
    console.error("[GET /api/gamification/mural]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
