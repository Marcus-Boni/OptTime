import type { HolidayScope, HolidaySeedItem } from "@/lib/holidays/types";

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * Adds `deltaDays` to a `YYYY-MM-DD` string using pure UTC date math so local
 * timezone offsets or DST never shift the calendar day.
 */
export function addCalendarDays(dateStr: string, deltaDays: number): string {
  const parts = dateStr.split("-");
  const year = Number.parseInt(parts[0] ?? "2026", 10);
  const month = Number.parseInt(parts[1] ?? "1", 10);
  const day = Number.parseInt(parts[2] ?? "1", 10);

  const utc = new Date(Date.UTC(year, month - 1, day + deltaDays));
  return `${utc.getUTCFullYear()}-${pad2(utc.getUTCMonth() + 1)}-${pad2(utc.getUTCDate())}`;
}

/**
 * Computes Easter Sunday (`YYYY-MM-DD`) for any Gregorian year using the
 * Meeus/Jones/Butcher algorithm.
 */
export function computeEasterSunday(year: number): string {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Official state (ES) and municipal (Vila Velha) holidays:
 * - Nossa Senhora da Penha: 8 days after Easter Sunday (Monday), State Law 11.010/2019 & Municipal
 * - Colonização do Solo Espírito-Santense: May 23, Municipal holiday in Vila Velha
 */
export function buildVilaVelhaHolidays(year: number): HolidaySeedItem[] {
  const easter = computeEasterSunday(year);
  const nossaSenhoraDaPenha = addCalendarDays(easter, 8);

  return [
    {
      date: nossaSenhoraDaPenha,
      name: "Dia de Nossa Senhora da Penha",
      scope: "state",
      stateCode: "ES",
      cityName: "Vila Velha",
      source: "local_rule",
    },
    {
      date: `${year}-05-23`,
      name: "Colonização do Solo Espírito-Santense",
      scope: "municipal",
      stateCode: "ES",
      cityName: "Vila Velha",
      source: "local_rule",
    },
  ];
}

/**
 * Deterministic national holidays for Brazil (including movable holidays derived
 * from Easter). Used as fallback when BrasilAPI is unreachable and to complement
 * optional national observances like Carnaval Monday.
 */
export function buildFallbackNationalHolidays(year: number): HolidaySeedItem[] {
  const easter = computeEasterSunday(year);

  const items: Array<{ date: string; name: string }> = [
    { date: `${year}-01-01`, name: "Confraternização Universal" },
    { date: addCalendarDays(easter, -48), name: "Segunda-feira de Carnaval" },
    { date: addCalendarDays(easter, -47), name: "Carnaval" },
    { date: addCalendarDays(easter, -2), name: "Sexta-feira Santa" },
    { date: `${year}-04-21`, name: "Tiradentes" },
    { date: `${year}-05-01`, name: "Dia Mundial do Trabalho" },
    { date: addCalendarDays(easter, 60), name: "Corpus Christi" },
    { date: `${year}-09-07`, name: "Independência do Brasil" },
    { date: `${year}-10-12`, name: "Nossa Senhora Aparecida" },
    { date: `${year}-11-02`, name: "Finados" },
    { date: `${year}-11-15`, name: "Proclamação da República" },
    {
      date: `${year}-11-20`,
      name: "Dia Nacional de Zumbi e da Consciência Negra",
    },
    { date: `${year}-12-25`, name: "Natal" },
  ];

  return items
    .map(
      (item): HolidaySeedItem => ({
        date: item.date,
        name: item.name,
        scope: "national",
        stateCode: null,
        cityName: null,
        source: "local_rule",
      }),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Merges national holidays with Vila Velha/ES local holidays, deduplicating by date.
 */
export function mergeHolidaySeeds(
  year: number,
  nationalItems: HolidaySeedItem[],
): HolidaySeedItem[] {
  const easter = computeEasterSunday(year);
  const carnavalMonday = addCalendarDays(easter, -48);
  const byDate = new Map<string, HolidaySeedItem>();

  for (const item of nationalItems) {
    // Skip raw Easter Sunday as a workday holiday — Sunday is already a weekend
    if (item.date === easter) {
      continue;
    }
    byDate.set(item.date, item);
  }

  // Ensure Carnaval Monday is also present alongside Carnaval Tuesday
  if (!byDate.has(carnavalMonday)) {
    byDate.set(carnavalMonday, {
      date: carnavalMonday,
      name: "Segunda-feira de Carnaval",
      scope: "national",
      stateCode: null,
      cityName: null,
      source: "local_rule",
    });
  }

  for (const localItem of buildVilaVelhaHolidays(year)) {
    byDate.set(localItem.date, localItem);
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date),
  );
}

export function getHolidayScopeLabel(scope: HolidayScope): string {
  switch (scope) {
    case "national":
      return "Nacional";
    case "state":
      return "Estadual · ES";
    case "municipal":
      return "Municipal · Vila Velha";
    case "bridge":
      return "Ponte / Empresa";
  }
}
