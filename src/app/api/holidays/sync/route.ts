import { getActiveSession, getActorContext } from "@/lib/access-control";
import { syncHolidaysForYear } from "@/lib/holidays/service";
import { syncHolidaysSchema } from "@/lib/validations/holiday.schema";

/**
 * POST /api/holidays/sync
 * Synchronizes national holidays from BrasilAPI + Vila Velha/ES rules for a year.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = syncHolidaysSchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const result = await syncHolidaysForYear(parsed.data.year, actor.userId);
    return Response.json(result);
  } catch (err: unknown) {
    console.error("[POST /api/holidays/sync]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
