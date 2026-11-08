import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { companyHoliday } from "@/lib/db/schema";
import { fetchHolidaysForYear } from "@/lib/holidays/brasil-api";
import type {
  HolidayScope,
  HolidaySource,
  HolidaySummary,
  SyncHolidaysResult,
} from "@/lib/holidays/types";

const YEAR_SEED_CACHE_TTL_MS = 5 * 60 * 1000;
const seededYearsCache = new Map<number, number>();

function toHolidaySummary(
  row: typeof companyHoliday.$inferSelect,
): HolidaySummary {
  return {
    id: row.id,
    date: row.date,
    name: row.name,
    scope: row.scope as HolidayScope,
    stateCode: row.stateCode ?? null,
    cityName: row.cityName ?? null,
    source: row.source as HolidaySource,
    isActive: row.isActive,
  };
}

function extractYearsBetween(from: string, to: string): number[] {
  const startYear = Number.parseInt(from.slice(0, 4), 10);
  const endYear = Number.parseInt(to.slice(0, 4), 10);

  if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) {
    return [new Date().getFullYear()];
  }

  const minYear = Math.max(2020, Math.min(startYear, endYear));
  const maxYear = Math.min(2100, Math.max(startYear, endYear));
  const years: number[] = [];

  for (let year = minYear; year <= maxYear; year += 1) {
    years.push(year);
  }

  return years;
}

export function invalidateHolidayYearCache(year?: number): void {
  if (typeof year === "number") {
    seededYearsCache.delete(year);
    return;
  }
  seededYearsCache.clear();
}

/**
 * Ensures a given calendar year has been seeded into `company_holiday`.
 * Uses a fast in-memory TTL check plus a single DB count check on cold start.
 */
export async function ensureYearHolidaysSeeded(year: number): Promise<void> {
  if (!Number.isFinite(year) || year < 2020 || year > 2100) {
    return;
  }

  const cachedAt = seededYearsCache.get(year);
  if (cachedAt && Date.now() - cachedAt < YEAR_SEED_CACHE_TTL_MS) {
    return;
  }

  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const existing = await db
    .select({ id: companyHoliday.id })
    .from(companyHoliday)
    .where(
      and(
        gte(companyHoliday.date, yearStart),
        lte(companyHoliday.date, yearEnd),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    seededYearsCache.set(year, Date.now());
    return;
  }

  await syncHolidaysForYear(year);
}

/**
 * Synchronizes national holidays (BrasilAPI) and Vila Velha - ES holidays for `year`.
 * Idempotent: existing rows keep their `isActive` flag so admin customizations are preserved.
 */
export async function syncHolidaysForYear(
  year: number,
  actorId?: string | null,
): Promise<SyncHolidaysResult> {
  const { provider, items } = await fetchHolidaysForYear(year);

  for (const item of items) {
    await db
      .insert(companyHoliday)
      .values({
        id: crypto.randomUUID(),
        date: item.date,
        name: item.name,
        scope: item.scope,
        stateCode: item.stateCode,
        cityName: item.cityName,
        source: item.source,
        isActive: true,
        createdById: actorId ?? null,
      })
      .onConflictDoUpdate({
        target: companyHoliday.date,
        set: {
          name: sql`CASE WHEN ${companyHoliday.source} = 'manual' THEN ${companyHoliday.name} ELSE ${item.name} END`,
          scope: sql`CASE WHEN ${companyHoliday.source} = 'manual' THEN ${companyHoliday.scope} ELSE ${item.scope} END`,
          stateCode: item.stateCode,
          cityName: item.cityName,
          source: sql`CASE WHEN ${companyHoliday.source} = 'manual' THEN ${companyHoliday.source} ELSE ${item.source} END`,
          updatedAt: new Date(),
        },
      });
  }

  seededYearsCache.set(year, Date.now());

  const holidays = await getHolidaysInRange(`${year}-01-01`, `${year}-12-31`, {
    includeInactive: true,
  });

  const nationalCount = items.filter((i) => i.scope === "national").length;
  const localCount = items.filter(
    (i) => i.scope === "state" || i.scope === "municipal",
  ).length;

  return {
    year,
    total: holidays.length,
    nationalCount,
    localCount,
    provider,
    holidays,
  };
}

/**
 * Returns holidays between `from` and `to` (`YYYY-MM-DD`, inclusive).
 * Automatically seeds any unseeded year in the range.
 */
export async function getHolidaysInRange(
  from: string,
  to: string,
  options?: { includeInactive?: boolean },
): Promise<HolidaySummary[]> {
  try {
    const years = extractYearsBetween(from, to);
    for (const year of years) {
      await ensureYearHolidaysSeeded(year);
    }

    const conditions = [
      gte(companyHoliday.date, from),
      lte(companyHoliday.date, to),
    ];

    if (!options?.includeInactive) {
      conditions.push(eq(companyHoliday.isActive, true));
    }

    const rows = await db
      .select()
      .from(companyHoliday)
      .where(and(...conditions))
      .orderBy(asc(companyHoliday.date));

    return rows.map(toHolidaySummary);
  } catch (error: unknown) {
    console.error("[holidays/service] getHolidaysInRange:", error);
    return [];
  }
}

/**
 * Checks whether a single `YYYY-MM-DD` date is an active holiday.
 */
export async function isHolidayDate(
  date: string,
): Promise<HolidaySummary | null> {
  const list = await getHolidaysInRange(date, date, { includeInactive: false });
  return list[0] ?? null;
}
