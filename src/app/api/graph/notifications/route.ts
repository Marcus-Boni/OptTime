import { after } from "next/server";
import type { ChangeNotificationCollection } from "@/lib/graph/change-notifications";
import { handleNotificationBatch } from "@/lib/teams/meeting-watch";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Graph sends the handshake token as a query parameter and wants it back. */
function validationResponse(req: Request): Response | null {
  const token = new URL(req.url).searchParams.get("validationToken");
  if (token === null) return null;
  return new Response(token, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

/**
 * POST - Microsoft Graph change notifications (meeting call events) and
 * subscription lifecycle events.
 *
 * Public by design: Graph cannot authenticate with a session. Authenticity
 * is established inside `handleNotificationBatch` — per-subscription
 * clientState plus the Microsoft-signed validation tokens — after the 202,
 * as Graph recommends, so a forged request learns nothing from the response.
 */
export async function POST(req: Request): Promise<Response> {
  const handshake = validationResponse(req);
  if (handshake) return handshake;

  let body: ChangeNotificationCollection;
  try {
    body = (await req.json()) as ChangeNotificationCollection;
  } catch {
    return new Response(null, { status: 400 });
  }

  after(async () => {
    try {
      await handleNotificationBatch(body);
    } catch (error) {
      console.error("[POST /api/graph/notifications]:", error);
    }
  });

  return new Response(null, { status: 202 });
}

/** GET - Some Graph validation flows probe the URL with GET. */
export async function GET(req: Request): Promise<Response> {
  return validationResponse(req) ?? new Response(null, { status: 405 });
}
