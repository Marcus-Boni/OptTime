import { getActiveSession } from "@/lib/access-control";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";
import {
  assertDayPlannable,
  buildDayPlanForUser,
  DayPlanRejectedError,
} from "@/lib/time-assistant/day-plan";
import { reconstructDaySchema } from "@/lib/validations/reconstruct.schema";

export const maxDuration = 60;

/**
 * POST - Builds the "Preencher meu dia" plan for one date.
 *
 * Crosses Outlook calendar events, Azure DevOps activity and the user's own
 * weekday patterns into an editable full-day proposal. Every source is
 * best-effort: a missing integration degrades the plan, never the request.
 * The composition itself lives in `lib/time-assistant/day-plan`, shared with
 * the agent API.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = reconstructDaySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { date } = parsed.data;

    await assertDayPlannable(session.user.id, date);

    const microsoftAccessToken = await getMicrosoftAccessToken(
      req.headers,
      session.user.id,
    );

    const plan = await buildDayPlanForUser({
      userId: session.user.id,
      date,
      microsoftAccessToken,
      polish: true,
    });

    return Response.json({ plan });
  } catch (error) {
    if (error instanceof DayPlanRejectedError) {
      return Response.json(
        { error: error.message },
        { status: error.reason === "period_locked" ? 409 : 400 },
      );
    }

    console.error("[POST /api/time-suggestions/reconstruct]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
