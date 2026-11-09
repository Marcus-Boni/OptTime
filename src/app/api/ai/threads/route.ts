import { z } from "zod";
import { getActiveSession } from "@/lib/access-control";
import {
  listUserTimeBotThreads,
  syncUserTimeBotThreads,
} from "@/lib/ai/threads-service";
import { syncTimeBotThreadsSchema } from "@/lib/validations/ai.schema";

/**
 * GET /api/ai/threads
 * Returns the signed-in user's persisted TimeBot conversation threads, active
 * thread id, and executed operator action/plan keys.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const state = await listUserTimeBotThreads(session.user.id);
    return Response.json(state);
  } catch (error: unknown) {
    console.error("[GET /api/ai/threads]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * PUT /api/ai/threads
 * Synchronizes the signed-in user's TimeBot conversation threads and executed
 * operator action keys with PostgreSQL.
 */
export async function PUT(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = syncTimeBotThreadsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const state = await syncUserTimeBotThreads(session.user.id, parsed.data);
    return Response.json(state);
  } catch (error: unknown) {
    console.error("[PUT /api/ai/threads]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
