import { getActiveSession, getActorContext } from "@/lib/access-control";
import { getPeoplePerformance } from "@/lib/people/performance";

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const performance = await getPeoplePerformance(actor);
    return Response.json(performance);
  } catch (error) {
    console.error("[GET /api/people/performance]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
