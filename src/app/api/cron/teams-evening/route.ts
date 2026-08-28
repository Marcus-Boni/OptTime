import { runEveningDigest } from "@/lib/teams/evening";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST - Lembrete Vespertino Interativo (17h30, dias úteis).
 *
 * Triggered by GitHub Actions (see .github/workflows/teams-evening-cron.yml).
 * One teams_notification_log row per user per day keeps re-runs from
 * double-notifying anyone.
 */
export async function POST(req: Request): Promise<Response> {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return Response.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token || token !== cronSecret) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runEveningDigest();

    console.info("[cron/teams-evening]", result);

    return Response.json(result);
  } catch (error) {
    console.error("[POST /api/cron/teams-evening]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
