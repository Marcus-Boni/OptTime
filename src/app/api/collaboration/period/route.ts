/**
 * GET /api/collaboration/period?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The data behind Meu Tempo: the whole window folded into days, a ledger of
 * what happened to every invitation, who the time went to and which rituals
 * consumed it. Read-only.
 *
 * The Azure DevOps side lives in `/api/collaboration/actions` and the written
 * summary in `/api/collaboration/assistant`, so the page paints as soon as
 * Microsoft answers instead of waiting on the slowest integration.
 */

import { getActiveSession } from "@/lib/access-control";
import { parsePeriodRange } from "@/lib/collaboration/period-range";
import { buildCollaborationPeriod } from "@/lib/collaboration/period-service";

export const maxDuration = 45;

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = parsePeriodRange(searchParams);

  if (!parsed.ok) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  try {
    const period = await buildCollaborationPeriod({
      headers: req.headers,
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      from: parsed.range.from,
      to: parsed.range.to,
    });

    console.info("[collaboration_period]", {
      userId: session.user.id,
      from: period.from,
      to: period.to,
      meetings: period.meetings.length,
      calendar: period.sources.calendar,
      portrait: period.sources.portrait,
    });

    return Response.json({ period });
  } catch (error: unknown) {
    console.error("[GET /api/collaboration/period]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
