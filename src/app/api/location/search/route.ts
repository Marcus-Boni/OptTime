import { z } from "zod";
import { getActiveSession } from "@/lib/access-control";
import {
  detectLocationViaIp,
  reverseGeocodeOpenStreetMap,
  searchOpenStreetMap,
} from "@/lib/location/openstreetmap";

const querySchema = z
  .object({
    q: z.string().trim().max(100).optional(),
    lat: z.coerce.number().min(-90).max(90).optional(),
    lon: z.coerce.number().min(-180).max(180).optional(),
    detect: z.enum(["ip", "auto"]).optional(),
  })
  .refine(
    (data) =>
      Boolean(data.q) ||
      Boolean(data.detect) ||
      (typeof data.lat === "number" && typeof data.lon === "number"),
    {
      message:
        "Forneça o termo de busca (q), coordenadas (lat e lon) ou detecção (detect).",
    },
  );

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const parsed = querySchema.safeParse({
    q: searchParams.get("q") ?? undefined,
    lat: searchParams.get("lat") ?? undefined,
    lon: searchParams.get("lon") ?? undefined,
    detect: searchParams.get("detect") ?? undefined,
  });

  if (!parsed.success) {
    return Response.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { q, lat, lon, detect } = parsed.data;

  try {
    if (detect === "ip" || detect === "auto") {
      const location = await detectLocationViaIp();
      if (!location) {
        return Response.json(
          { error: "Não foi possível detectar a localização por IP." },
          { status: 404 },
        );
      }
      return Response.json({ location });
    }

    if (typeof lat === "number" && typeof lon === "number") {
      const location = await reverseGeocodeOpenStreetMap(lat, lon);
      if (!location) {
        return Response.json(
          { error: "Nenhum endereço encontrado para essas coordenadas." },
          { status: 404 },
        );
      }
      return Response.json({ location });
    }

    if (q) {
      const results = await searchOpenStreetMap(q);
      return Response.json({ results });
    }

    return Response.json({ results: [] });
  } catch (err: unknown) {
    console.error("[GET /api/location/search]", err);
    return Response.json(
      { error: "Erro ao consultar a API do OpenStreetMap." },
      { status: 502 },
    );
  }
}
