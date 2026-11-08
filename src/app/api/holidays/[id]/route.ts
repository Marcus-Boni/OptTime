import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { companyHoliday } from "@/lib/db/schema";
import { invalidateHolidayYearCache } from "@/lib/holidays/service";
import type {
  HolidayScope,
  HolidaySource,
  HolidaySummary,
} from "@/lib/holidays/types";
import { updateHolidaySchema } from "@/lib/validations/holiday.schema";

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  let rawBody: unknown;
  try {
    rawBody = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateHolidaySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const updates: Partial<typeof companyHoliday.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.scope !== undefined) updates.scope = parsed.data.scope;
    if (parsed.data.isActive !== undefined) {
      updates.isActive = parsed.data.isActive;
    }

    const [updated] = await db
      .update(companyHoliday)
      .set(updates)
      .where(eq(companyHoliday.id, id))
      .returning();

    if (!updated) {
      return Response.json({ error: "Holiday not found" }, { status: 404 });
    }

    invalidateHolidayYearCache(Number.parseInt(updated.date.slice(0, 4), 10));

    const holiday: HolidaySummary = {
      id: updated.id,
      date: updated.date,
      name: updated.name,
      scope: updated.scope as HolidayScope,
      stateCode: updated.stateCode ?? null,
      cityName: updated.cityName ?? null,
      source: updated.source as HolidaySource,
      isActive: updated.isActive,
    };

    return Response.json({ holiday });
  } catch (err: unknown) {
    console.error("[PATCH /api/holidays/[id]]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;

  try {
    const [deleted] = await db
      .delete(companyHoliday)
      .where(eq(companyHoliday.id, id))
      .returning();

    if (!deleted) {
      return Response.json({ error: "Holiday not found" }, { status: 404 });
    }

    invalidateHolidayYearCache(Number.parseInt(deleted.date.slice(0, 4), 10));

    return Response.json({ deleted: true, id: deleted.id });
  } catch (err: unknown) {
    console.error("[DELETE /api/holidays/[id]]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
