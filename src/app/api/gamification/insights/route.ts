import { getActiveSession } from "@/lib/access-control";
import {
  buildPersonalInsights,
  INSIGHT_WINDOW_WEEKS,
} from "@/lib/gamification";

const MAX_WINDOW_WEEKS = 26;

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const requested = Number.parseInt(searchParams.get("weeks") ?? "", 10);
  const weeks =
    Number.isFinite(requested) && requested >= 2
      ? Math.min(requested, MAX_WINDOW_WEEKS)
      : INSIGHT_WINDOW_WEEKS;

  try {
    const report = await buildPersonalInsights(session.user.id, weeks);
    return Response.json({ report });
  } catch (error: unknown) {
    console.error("[GET /api/gamification/insights]", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
