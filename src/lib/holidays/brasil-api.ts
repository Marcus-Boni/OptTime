import { z } from "zod";
import {
  buildFallbackNationalHolidays,
  mergeHolidaySeeds,
} from "@/lib/holidays/calendar-rules";
import type { HolidaySeedItem } from "@/lib/holidays/types";

const BRASIL_API_TIMEOUT_MS = 6000;

const brasilApiHolidaySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  name: z.string().min(1),
  type: z.string().optional(),
});

const brasilApiResponseSchema = z.array(brasilApiHolidaySchema);

export interface FetchNationalHolidaysResult {
  provider: "brasilapi" | "fallback";
  items: HolidaySeedItem[];
}

/**
 * Fetches official Brazilian national holidays from BrasilAPI (`v1`), merging
 * them with Vila Velha - ES state/municipal holidays. If BrasilAPI is offline
 * or times out, falls back seamlessly to the deterministic calculation.
 */
export async function fetchHolidaysForYear(
  year: number,
): Promise<FetchNationalHolidaysResult> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), BRASIL_API_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://brasilapi.com.br/api/feriados/v1/${year}`,
      {
        method: "GET",
        headers: { Accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      throw new Error(`BrasilAPI HTTP ${response.status}`);
    }

    const rawJson: unknown = await response.json();
    const parsed = brasilApiResponseSchema.safeParse(rawJson);

    if (!parsed.success || parsed.data.length === 0) {
      throw new Error("Invalid BrasilAPI payload");
    }

    const nationalItems: HolidaySeedItem[] = parsed.data.map((entry) => ({
      date: entry.date,
      name: entry.name.trim(),
      scope: "national",
      stateCode: null,
      cityName: null,
      source: "brasilapi",
    }));

    return {
      provider: "brasilapi",
      items: mergeHolidaySeeds(year, nationalItems),
    };
  } catch (error: unknown) {
    if (!(error instanceof Error && error.name === "AbortError")) {
      console.error("[holidays/brasil-api] fallback triggered:", error);
    }

    const fallbackItems = buildFallbackNationalHolidays(year);
    return {
      provider: "fallback",
      items: mergeHolidaySeeds(year, fallbackItems),
    };
  } finally {
    clearTimeout(timeoutId);
  }
}
