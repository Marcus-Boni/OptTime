import { getActiveSession, getActorContext } from "@/lib/access-control";
import { BotTokenError, getBotAccessToken } from "@/lib/teams/bot/auth";
import { getBotConfig } from "@/lib/teams/bot/config";

/**
 * POST - Checks the bot registration by requesting a real Bot Framework token
 * with the stored App ID, secret and tenant (admin only).
 */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (getActorContext(session.user).role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const { credentials } = await getBotConfig();
    if (!credentials) {
      return Response.json(
        { ok: false, error: "Preencha App ID, segredo e Tenant ID do bot." },
        { status: 400 },
      );
    }

    await getBotAccessToken(credentials, { forceRefresh: true });
    return Response.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof BotTokenError) {
      return Response.json(
        { ok: false, error: error.message },
        { status: 400 },
      );
    }
    console.error("[POST /api/teams/bot/test]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
