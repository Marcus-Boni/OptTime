import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { companyHoliday } from "@/lib/db/schema";
import {
  getHolidaysInRange,
  invalidateHolidayYearCache,
} from "@/lib/holidays/service";
import type {
  HolidayScope,
  HolidaySource,
  HolidaySummary,
} from "@/lib/holidays/types";
import { createHolidaySchema } from "@/lib/validations/holiday.schema";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/holidays
 * Query params:
 *   year?: number (e.g. 2026)
 *   from?: YYYY-MM-DD
 *   to?: YYYY-MM-DD
 *   includeInactive?: "true" | "false"
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const yearParam = searchParams.get("year");
  const fromParam = searchParams.get("from");
  const toParam = searchParams.get("to");
  const includeInactive = searchParams.get("includeInactive") === "true";

  let from: string;
  let to: string;

  if (
    fromParam &&
    toParam &&
    DATE_RE.test(fromParam) &&
    DATE_RE.test(toParam)
  ) {
    from = fromParam;
    to = toParam;
  } else {
    const parsedYear = yearParam
      ? Number.parseInt(yearParam, 10)
      : new Date().getFullYear();
    const safeYear =
      Number.isFinite(parsedYear) && parsedYear >= 2020 && parsedYear <= 2100
        ? parsedYear
        : new Date().getFullYear();
    from = `${safeYear}-01-01`;
    to = `${safeYear}-12-31`;
  }

  try {
    const holidays = await getHolidaysInRange(from, to, { includeInactive });
    return Response.json({ holidays });
  } catch (err: unknown) {
    console.error("[GET /api/holidays]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * POST /api/holidays
 * Creates or updates a manual holiday or company bridge day ("emenda"/"recesso").
 * Restricted to managers and admins.
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

  const parsed = createHolidaySchema.safeParse(rawBody);
  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const { date, name, scope, stateCode, cityName, isActive } = parsed.data;
    const resolvedStateCode =
      stateCode ?? (scope === "state" || scope === "municipal" ? "ES" : null);
    const resolvedCityName =
      cityName ?? (scope === "municipal" ? "Vila Velha" : null);

    const [created] = await db
      .insert(companyHoliday)
      .values({
        id: crypto.randomUUID(),
        date,
        name,
        scope,
        stateCode: resolvedStateCode,
        cityName: resolvedCityName,
        source: "manual",
        isActive,
        createdById: actor.userId,
      })
      .onConflictDoUpdate({
        target: companyHoliday.date,
        set: {
          name,
          scope,
          stateCode: resolvedStateCode,
          cityName: resolvedCityName,
          source: "manual",
          isActive,
          updatedAt: new Date(),
        },
      })
      .returning();

    if (!created) {
      return Response.json(
        { error: "Failed to persist holiday" },
        { status: 500 },
      );
    }

    invalidateHolidayYearCache(Number.parseInt(date.slice(0, 4), 10));

    const holiday: HolidaySummary = {
      id: created.id,
      date: created.date,
      name: created.name,
      scope: created.scope as HolidayScope,
      stateCode: created.stateCode ?? null,
      cityName: created.cityName ?? null,
      source: created.source as HolidaySource,
      isActive: created.isActive,
    };

    return Response.json({ holiday }, { status: 201 });
  } catch (err: unknown) {
    console.error("[POST /api/holidays]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
