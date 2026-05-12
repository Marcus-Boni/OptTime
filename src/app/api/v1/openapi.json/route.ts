import { openapiSpec } from "@/lib/integration/openapi-spec";

export async function GET(): Promise<Response> {
  return Response.json(openapiSpec, {
    headers: {
      "Cache-Control": "public, max-age=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
