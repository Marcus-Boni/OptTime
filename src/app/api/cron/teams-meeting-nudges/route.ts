import { runMeetingNudges } from "@/lib/teams/meeting-nudges";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * POST - "Sua reunião terminou — registrar?" no app do Teams.
 *
 * Triggered every 10 minutes on weekdays by GitHub Actions (see
 * .github/workflows/teams-meeting-nudges-cron.yml). The teams_meeting_nudge
 * ledger makes overlapping runs safe: each meeting is asked about once.
 *
 * Query flags for manual checks: `dryRun=1` counts what would be sent without
 * sending; `ignoreWorkingHours=1` runs outside the 08h–21h window.
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
    const url = new URL(req.url);
    const result = await runMeetingNudges({
      dryRun: url.searchParams.get("dryRun") === "1",
      ignoreWorkingHours: url.searchParams.get("ignoreWorkingHours") === "1",
    });

    console.info("[cron/teams-meeting-nudges]", result);
    return Response.json(result);
  } catch (error) {
    console.error("[POST /api/cron/teams-meeting-nudges]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
