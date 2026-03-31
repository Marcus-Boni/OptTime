import { dbPool } from "@/lib/db";

type HealthPayload = {
  status: "ok" | "degraded";
  uptimeSeconds: number;
  timestamp: string;
  checks: {
    database: "up" | "down";
  };
};

export async function GET(): Promise<Response> {
  const payload: HealthPayload = {
    status: "ok",
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    checks: {
      database: "up",
    },
  };

  try {
    await dbPool.query("select 1");

    return Response.json(payload, { status: 200 });
  } catch (error) {
    console.error("[GET /api/health] database check failed", error);

    return Response.json(
      {
        ...payload,
        status: "degraded",
        checks: {
          database: "down",
        },
      },
      { status: 503 },
    );
  }
}
