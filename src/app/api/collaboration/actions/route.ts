/**
 * GET /api/collaboration/actions?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * The Azure DevOps half of the Meu Tempo timeline: pull requests merged,
 * commits pushed and work items moved inside the window. Meetings come from
 * the period endpoint and are merged client-side.
 *
 * Deliberately separate: this is the slowest read in the product (one request
 * per repository, per project) and nothing else on the page depends on it.
 */

import {
  getAccessibleProjectIds,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { buildPeriodActions } from "@/lib/collaboration/actions-service";
import { parsePeriodRange } from "@/lib/collaboration/period-range";

export const maxDuration = 60;

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
    const actor = getActorContext(session.user);
    const accessibleProjectIds = await getAccessibleProjectIds(actor);

    const result = await buildPeriodActions({
      userId: session.user.id,
      from: parsed.range.from,
      to: parsed.range.to,
      accessibleProjectIds,
    });

    console.info("[collaboration_actions]", {
      userId: session.user.id,
      from: result.from,
      to: result.to,
      actions: result.actions.length,
      azureDevOps: result.sources.azureDevOps,
    });

    return Response.json({ result });
  } catch (error: unknown) {
    console.error("[GET /api/collaboration/actions]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
