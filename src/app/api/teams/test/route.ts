import { getActiveSession, getActorContext } from "@/lib/access-control";
import { getServerAppUrl } from "@/lib/app-url";
import { buildTestCard } from "@/lib/teams/cards";
import { postTeamsCard } from "@/lib/teams/client";
import { getTeamsSettings } from "@/lib/teams/settings";

/** POST - Send a test card to the configured channel webhook (admin only). */
export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const settings = await getTeamsSettings();

    if (!settings.channelWebhookUrl) {
      return Response.json(
        { error: "Configure a URL do webhook do canal antes de testar." },
        { status: 400 },
      );
    }

    const result = await postTeamsCard(
      settings.channelWebhookUrl,
      buildTestCard(getServerAppUrl(), session.user.name ?? "Admin"),
    );

    if (!result.ok) {
      return Response.json(
        { error: `O Teams recusou o envio: ${result.error ?? "erro"}` },
        { status: 502 },
      );
    }

    return Response.json({ sent: true });
  } catch (error) {
    console.error("[POST /api/teams/test]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
