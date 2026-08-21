import { runStandupDigest } from "@/lib/teams/standup";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * POST - Morning Standup Squad Digest.
 *
 * Triggered by GitHub Actions on weekday mornings (see
 * .github/workflows/teams-standup-cron.yml). Idempotent per calendar day via
 * the teams_notification_log unique index, so retries are harmless.
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
    const result = await runStandupDigest();

    console.info("[cron/teams-standup]", result);

    return Response.json(result);
  } catch (error) {
    console.error("[POST /api/cron/teams-standup]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
