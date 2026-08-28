import {
  executeTeamsCommand,
  parseTeamsCommand,
  resolveTeamsUser,
} from "@/lib/teams/commands";
import {
  extractCommandText,
  type TeamsOutgoingMessage,
  verifyTeamsHmac,
} from "@/lib/teams/outgoing";
import { getTeamsSettings } from "@/lib/teams/settings";

export const dynamic = "force-dynamic";

function reply(text: string, status = 200): Response {
  return Response.json({ type: "message", text }, { status });
}

/**
 * POST - Microsoft Teams outgoing-webhook receiver.
 *
 * Teams posts here when someone mentions the webhook in a channel
 * (`@OptSolv timer start …`). The raw body is HMAC-verified against the
 * shared secret BEFORE any parsing; the sender is mapped to an app user by
 * Entra object id. The HTTP response body is the message Teams renders back.
 */
export async function POST(req: Request): Promise<Response> {
  try {
    const settings = await getTeamsSettings();

    if (!settings.enabled || !settings.outgoingSecret) {
      return reply(
        "A integração do OptSolv Time com o Teams não está habilitada.",
      );
    }

    const rawBody = await req.text();
    const authorization = req.headers.get("authorization");

    if (!verifyTeamsHmac(rawBody, authorization, settings.outgoingSecret)) {
      console.warn("[POST /api/teams/outgoing]: HMAC inválido");
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    let message: TeamsOutgoingMessage;
    try {
      message = JSON.parse(rawBody) as TeamsOutgoingMessage;
    } catch {
      return reply("Não consegui interpretar a mensagem recebida.");
    }

    const principal = await resolveTeamsUser(message.from?.aadObjectId);
    if (!principal) {
      return reply(
        `Não encontrei sua conta no OptSolv Time, ${message.from?.name ?? "colega"}. Entre uma vez pelo app com o login Microsoft para vincular seu usuário.`,
      );
    }

    const command = parseTeamsCommand(extractCommandText(message));
    const responseText = await executeTeamsCommand(principal, command);

    console.info("[teams_command]", {
      userId: principal.userId,
      kind: command.kind,
    });

    return reply(responseText);
  } catch (error) {
    console.error("[POST /api/teams/outgoing]:", error);
    return reply("⚠️ Erro interno ao processar o comando.", 200);
  }
}
