export interface LocationResult {
  id: string;
  label: string;
  city: string;
  state: string;
  country: string;
  displayName: string;
}

interface NominatimAddress {
  city?: string;
  town?: string;
  municipality?: string;
  village?: string;
  suburb?: string;
  city_district?: string;
  state?: string;
  state_code?: string;
  "ISO3166-2-lvl4"?: string;
  country?: string;
  country_code?: string;
}

interface NominatimItem {
  place_id: number;
  osm_id: number;
  lat: string;
  lon: string;
  name: string;
  display_name: string;
  address?: NominatimAddress;
}

const USER_AGENT = "OptSolv-TimeTracker/1.0 (internal-app)";

export function formatLocationName(
  address: NominatimAddress | undefined,
  fallbackName: string,
): string {
  if (!address) {
    return fallbackName.slice(0, 80);
  }

  const city =
    address.city ||
    address.town ||
    address.municipality ||
    address.village ||
    address.suburb ||
    address.city_district ||
    fallbackName;

  const stateCode =
    address["ISO3166-2-lvl4"]?.replace(/^[A-Z]{2}-/, "") ||
    address.state_code ||
    address.state ||
    "";

  const country = address.country || "";

  if (city && stateCode) {
    return country === "Brasil"
      ? `${city}, ${stateCode}`
      : `${city}, ${stateCode} - ${country}`;
  }

  if (city && country) {
    return `${city} - ${country}`;
  }

  return (city || stateCode || fallbackName).slice(0, 80);
}

export async function searchOpenStreetMap(
  query: string,
): Promise<LocationResult[]> {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    trimmed,
  )}&format=json&addressdetails=1&limit=6&accept-language=pt-BR`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`OpenStreetMap Nominatim falhou com status ${res.status}`);
  }

  const data = (await res.json()) as NominatimItem[];

  const seen = new Set<string>();
  const results: LocationResult[] = [];

  for (const item of data) {
    const label = formatLocationName(item.address, item.name);
    if (seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());

    results.push({
      id: String(item.place_id),
      label,
      city:
        item.address?.city ||
        item.address?.town ||
        item.address?.municipality ||
        item.name ||
        "",
      state:
        item.address?.["ISO3166-2-lvl4"]?.replace(/^[A-Z]{2}-/, "") ||
        item.address?.state ||
        "",
      country: item.address?.country || "",
      displayName: item.display_name,
    });
  }

  return results;
}

export async function reverseGeocodeOpenStreetMap(
  lat: number,
  lon: number,
): Promise<LocationResult | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&addressdetails=1&accept-language=pt-BR`;

  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "application/json",
    },
    next: { revalidate: 3600 },
  });

  if (!res.ok) {
    throw new Error(`OpenStreetMap reverse falhou com status ${res.status}`);
  }

  const item = (await res.json()) as NominatimItem;
  if (!item || !item.place_id) return null;

  const label = formatLocationName(item.address, item.name);

  return {
    id: String(item.place_id),
    label,
    city:
      item.address?.city ||
      item.address?.town ||
      item.address?.municipality ||
      item.name ||
      "",
    state:
      item.address?.["ISO3166-2-lvl4"]?.replace(/^[A-Z]{2}-/, "") ||
      item.address?.state ||
      "",
    country: item.address?.country || "",
    displayName: item.display_name,
  };
}

export async function detectLocationViaIp(): Promise<LocationResult | null> {
  try {
    const res = await fetch("https://freeipapi.com/api/json", {
      headers: { Accept: "application/json" },
      next: { revalidate: 300 },
    });

    if (!res.ok) return null;

    const data = (await res.json()) as {
      cityName?: string;
      regionName?: string;
      regionCode?: string;
      countryName?: string;
      latitude?: number;
      longitude?: number;
    };

    if (
      typeof data.latitude === "number" &&
      typeof data.longitude === "number"
    ) {
      const osmResult = await reverseGeocodeOpenStreetMap(
        data.latitude,
        data.longitude,
      );
      if (osmResult) return osmResult;
    }

    if (data.cityName) {
      const city = data.cityName;
      const state = data.regionCode || data.regionName || "";
      const country = data.countryName || "Brasil";
      const label = state ? `${city}, ${state}` : `${city} - ${country}`;

      return {
        id: "ip-detected",
        label,
        city,
        state,
        country,
        displayName: `${city}, ${data.regionName || state}, ${country}`,
      };
    }
  } catch (err: unknown) {
    console.error("[detectLocationViaIp] Error:", err);
  }
  return null;
}
