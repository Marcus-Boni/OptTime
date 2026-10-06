import { getActiveSession, getActorContext } from "@/lib/access-control";
import { buildTeamsAppPackage } from "@/lib/teams/app-package/manifest";
import { getTeamsSettings } from "@/lib/teams/settings";

export const dynamic = "force-dynamic";

/**
 * GET - Teams app package (.zip: manifest + icons) for upload in the Teams
 * admin center or "Upload a custom app" (admin only).
 */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (getActorContext(session.user).role !== "admin") {
    return Response.json({ error: "Sem permissão." }, { status: 403 });
  }

  try {
    const settings = await getTeamsSettings();
    if (!settings.botAppId) {
      return Response.json(
        { error: "Configure o App ID do bot antes de gerar o pacote." },
        { status: 400 },
      );
    }

    const zip = buildTeamsAppPackage(settings.botAppId);

    return new Response(new Uint8Array(zip), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": 'attachment; filename="optsolv-time-teams.zip"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("[GET /api/teams/app-package]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
