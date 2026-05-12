import { retryPendingDeliveries } from "@/lib/integration/webhook-dispatcher";

export async function POST(req: Request): Promise<Response> {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await retryPendingDeliveries();
    return Response.json({ ok: true });
  } catch (error: unknown) {
    console.error("[POST /api/cron/retry-webhooks]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
