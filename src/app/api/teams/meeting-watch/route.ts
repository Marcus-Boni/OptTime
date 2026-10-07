import { getActiveSession, getActorContext } from "@/lib/access-control";
import { GraphAppError, getGrantedAppRoles } from "@/lib/graph/app-client";
import {
  instantNudgesSupported,
  readWatchHealth,
} from "@/lib/teams/meeting-watch";

export const dynamic = "force-dynamic";

const REQUIRED_ROLE = "OnlineMeetings.Read.All";

/**
 * GET - Status of instant meeting nudges for admins: whether the Entra app
 * holds OnlineMeetings.Read.All right now (fresh token), and what the last
 * subscription attempt reported.
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
    const supported = instantNudgesSupported();
    let roles: string[] = [];
    let tokenError: string | null = null;
    if (supported) {
      try {
        roles = await getGrantedAppRoles();
      } catch (error: unknown) {
        tokenError =
          error instanceof GraphAppError ? error.message : "Falha no token.";
      }
    }

    const health = await readWatchHealth().catch(() => null);

    return Response.json({
      supported,
      permissionGranted: roles.includes(REQUIRED_ROLE),
      requiredPermission: REQUIRED_ROLE,
      tokenError,
      health,
    });
  } catch (error) {
    console.error("[GET /api/teams/meeting-watch]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
