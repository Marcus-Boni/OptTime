import { z } from "zod";
import { getActiveSession } from "@/lib/access-control";
import {
  deleteUserTimeBotThread,
  patchUserTimeBotThread,
} from "@/lib/ai/threads-service";
import { patchTimeBotThreadSchema } from "@/lib/validations/ai.schema";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/ai/threads/[id]
 * Updates the title and/or active state of a single TimeBot thread.
 */
export async function PATCH(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || id.length > 128) {
    return Response.json({ error: "ID de conversa inválido" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = patchTimeBotThreadSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  try {
    const thread = await patchUserTimeBotThread(
      session.user.id,
      id,
      parsed.data,
    );
    if (!thread) {
      return Response.json(
        { error: "Conversa não encontrada" },
        { status: 404 },
      );
    }

    return Response.json({ thread });
  } catch (error: unknown) {
    console.error("[PATCH /api/ai/threads/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/**
 * DELETE /api/ai/threads/[id]
 * Deletes a single TimeBot conversation thread owned by the signed-in user.
 */
export async function DELETE(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  if (!id || id.length > 128) {
    return Response.json({ error: "ID de conversa inválido" }, { status: 400 });
  }

  try {
    const deleted = await deleteUserTimeBotThread(session.user.id, id);
    return Response.json({ deleted });
  } catch (error: unknown) {
    console.error("[DELETE /api/ai/threads/[id]]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
