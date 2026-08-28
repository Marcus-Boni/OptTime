import { getActiveSession, getActorContext } from "@/lib/access-control";
import {
  getTeamsSettings,
  maskTeamsSettings,
  saveTeamsSettings,
} from "@/lib/teams/settings";
import { saveTeamsSettingsSchema } from "@/lib/validations/teams.schema";

/** GET - Masked organization-level Teams settings (admin only). */
export async function GET(req: Request): Promise<Response> {
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
    return Response.json({ settings: maskTeamsSettings(settings) });
  } catch (error) {
    console.error("[GET /api/teams/settings]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PUT - Save organization-level Teams settings (admin only). */
export async function PUT(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = saveTeamsSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    await saveTeamsSettings(parsed.data, session.user.id);
    const settings = await getTeamsSettings();

    console.info("[teams_settings_saved]", {
      userId: session.user.id,
      enabled: parsed.data.enabled,
    });

    return Response.json({ settings: maskTeamsSettings(settings) });
  } catch (error) {
    console.error("[PUT /api/teams/settings]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
