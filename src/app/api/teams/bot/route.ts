import { after } from "next/server";
import { verifyInboundRequest } from "@/lib/teams/bot/auth";
import { getBotConfig } from "@/lib/teams/bot/config";
import { sendToConversation } from "@/lib/teams/bot/connector";
import { handleActivity, handleInvoke } from "@/lib/teams/bot/handlers";
import type { BotActivity } from "@/lib/teams/bot/types";

export const dynamic = "force-dynamic";
/** Background work scheduled with `after()` shares this budget. */
export const maxDuration = 60;

function isActivity(value: unknown): value is BotActivity {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<BotActivity>;
  return (
    typeof candidate.type === "string" &&
    typeof candidate.serviceUrl === "string" &&
    typeof candidate.conversation?.id === "string" &&
    typeof candidate.from?.id === "string"
  );
}

/**
 * POST - Messaging endpoint of the OptSolv Time Teams app (Azure Bot).
 *
 * Every request is authenticated with the Bot Connector JWT before anything
 * else happens. Invokes (card buttons, message-extension dialogs) answer in
 * the response body; messages and conversation events are acknowledged at
 * once and processed after the response, replying through the Connector.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    return await processActivity(req);
  } catch (error) {
    console.error("[POST /api/teams/bot]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

async function processActivity(req: Request): Promise<Response> {
  const config = await getBotConfig();
  if (!config.credentials) {
    return Response.json({ error: "Bot não configurado." }, { status: 503 });
  }
  const credentials = config.credentials;

  let activity: unknown;
  try {
    activity = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }
  if (!isActivity(activity)) {
    return Response.json({ error: "Atividade inválida." }, { status: 400 });
  }

  const auth = await verifyInboundRequest(
    req.headers.get("authorization"),
    activity,
    credentials.appId,
  );
  if (!auth.ok) {
    console.warn("[POST /api/teams/bot] unauthorized:", auth.reason);
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!config.enabled) {
    if (activity.type === "message") {
      after(() =>
        sendToConversation(
          credentials,
          activity.serviceUrl,
          activity.conversation.id,
          {
            type: "message",
            text: "A integração do OptSolv Time com o Teams está desligada no momento.",
          },
        ).catch(() => undefined),
      );
    }
    return new Response(null, { status: 200 });
  }

  if (activity.type === "invoke") {
    const result = await handleInvoke(activity, credentials);
    return result.body === undefined
      ? new Response(null, { status: result.status })
      : Response.json(result.body, { status: result.status });
  }

  after(() => handleActivity(activity, credentials));
  return new Response(null, { status: 200 });
}
