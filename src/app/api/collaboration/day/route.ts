/**
 * GET /api/collaboration/day?date=YYYY-MM-DD[&includeLogged=1]
 *
 * The day panel behind "O que você fez hoje": meetings normalized out of the
 * calendar plus the Viva Insights portrait. Read-only — turning a meeting into
 * a time entry goes through the reconstructor's apply route, which already
 * owns timesheet locking and Azure DevOps sync.
 */

import { getActiveSession } from "@/lib/access-control";
import { buildCollaborationDay } from "@/lib/collaboration/service";
import { todayInAppTimeZone } from "@/lib/timezone";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
/** Matches the manual-entry rule: nothing older than 30 days. */
const MAX_PAST_DAYS = 30;

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const date = searchParams.get("date") ?? todayInAppTimeZone();
  // The picker inside the entry form shows the whole day marked; the day panel
  // shows only what is left to log.
  const includeLogged = searchParams.get("includeLogged") === "1";

  if (!DATE_PATTERN.test(date)) {
    return Response.json(
      { error: "Parâmetro 'date' deve estar no formato YYYY-MM-DD." },
      { status: 400 },
    );
  }

  const today = todayInAppTimeZone();

  if (date > today) {
    return Response.json(
      { error: "Não é possível analisar um dia futuro." },
      { status: 400 },
    );
  }

  const ageDays = Math.round(
    (new Date(`${today}T00:00:00Z`).getTime() -
      new Date(`${date}T00:00:00Z`).getTime()) /
      86_400_000,
  );

  if (ageDays > MAX_PAST_DAYS) {
    return Response.json(
      { error: `Só é possível analisar os últimos ${MAX_PAST_DAYS} dias.` },
      { status: 400 },
    );
  }

  try {
    const day = await buildCollaborationDay({
      headers: req.headers,
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      date,
      keepLogged: includeLogged,
    });

    console.info("[collaboration_day]", {
      userId: session.user.id,
      date,
      meetings: day.meetings.length,
      exclusions: day.exclusions.length,
      portrait: day.portrait?.availability ?? "skipped",
    });

    return Response.json({ day });
  } catch (error: unknown) {
    console.error("[GET /api/collaboration/day]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
