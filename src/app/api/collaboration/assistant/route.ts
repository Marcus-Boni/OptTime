/**
 * POST /api/collaboration/assistant
 *
 * The written summary at the top of Meu Tempo. Rebuilds the period server-side
 * rather than trusting a posted payload, computes the deterministic findings
 * and hands a fact sheet to the model — which is only allowed to rephrase it.
 *
 * Separate from the period endpoint because it is the only part that can take
 * seconds and the only part that can be absent: with no AI provider configured
 * it still answers, with the deterministic writer.
 */

import { getActiveSession } from "@/lib/access-control";
import { buildPeriodInsights } from "@/lib/collaboration/insights";
import { buildPeriodNarrative } from "@/lib/collaboration/narrative";
import { validatePeriodRange } from "@/lib/collaboration/period-range";
import { buildCollaborationPeriod } from "@/lib/collaboration/period-service";
import { periodAssistantSchema } from "@/lib/validations/collaboration.schema";

export const maxDuration = 60;

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

  const parsed = periodAssistantSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const range = validatePeriodRange(parsed.data.from, parsed.data.to);
  if (!range.ok) {
    return Response.json({ error: range.error }, { status: 400 });
  }

  try {
    const period = await buildCollaborationPeriod({
      headers: req.headers,
      userId: session.user.id,
      userEmail: session.user.email ?? null,
      from: range.range.from,
      to: range.range.to,
    });

    const delivery = parsed.data.delivery ?? null;
    const insights = buildPeriodInsights({ period, delivery });
    const narrative = await buildPeriodNarrative({
      period,
      insights,
      delivery,
    });

    console.info("[collaboration_assistant]", {
      userId: session.user.id,
      from: period.from,
      to: period.to,
      insights: insights.length,
      narrative: narrative.source,
    });

    return Response.json({
      result: {
        from: period.from,
        to: period.to,
        insights,
        narrative,
      },
    });
  } catch (error: unknown) {
    console.error("[POST /api/collaboration/assistant]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
