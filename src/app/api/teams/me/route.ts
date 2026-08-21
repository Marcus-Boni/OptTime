import { eq } from "drizzle-orm";
import { getActiveSession } from "@/lib/access-control";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";
import { saveTeamsPreferencesSchema } from "@/lib/validations/teams.schema";

interface TeamsPreferencesView {
  teamsStatusSyncEnabled: boolean;
  eveningDigestEnabled: boolean;
  hasPersonalWebhook: boolean;
  /** Non-secret preview so the user recognizes the stored URL. */
  personalWebhookPreview: string | null;
  /** Whether the login scope for presence sync is active in this deploy. */
  presenceScopeEnabled: boolean;
}

async function buildView(userId: string): Promise<TeamsPreferencesView | null> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: {
      teamsStatusSyncEnabled: true,
      eveningDigestEnabled: true,
      teamsWebhookUrl: true,
    },
  });

  if (!row) return null;

  const webhook = row.teamsWebhookUrl ? decrypt(row.teamsWebhookUrl) : "";

  return {
    teamsStatusSyncEnabled: row.teamsStatusSyncEnabled,
    eveningDigestEnabled: row.eveningDigestEnabled,
    hasPersonalWebhook: Boolean(webhook),
    personalWebhookPreview: webhook ? `${webhook.slice(0, 34)}…` : null,
    presenceScopeEnabled: process.env.TEAMS_PRESENCE_SCOPE === "true",
  };
}

/** GET - The session user's Teams preferences (masked). */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const preferences = await buildView(session.user.id);
    if (!preferences) {
      return Response.json(
        { error: "Usuário não encontrado." },
        { status: 404 },
      );
    }

    return Response.json({ preferences });
  } catch (error) {
    console.error("[GET /api/teams/me]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** PUT - Update the session user's Teams preferences. */
export async function PUT(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "JSON inválido." }, { status: 400 });
  }

  const parsed = saveTeamsPreferencesSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Payload inválido", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const { teamsStatusSyncEnabled, eveningDigestEnabled, teamsWebhookUrl } =
      parsed.data;

    await db
      .update(user)
      .set({
        ...(teamsStatusSyncEnabled !== undefined
          ? { teamsStatusSyncEnabled }
          : {}),
        ...(eveningDigestEnabled !== undefined ? { eveningDigestEnabled } : {}),
        ...(teamsWebhookUrl !== undefined
          ? {
              teamsWebhookUrl: teamsWebhookUrl
                ? encrypt(teamsWebhookUrl)
                : null,
            }
          : {}),
      })
      .where(eq(user.id, session.user.id));

    const preferences = await buildView(session.user.id);
    return Response.json({ preferences });
  } catch (error) {
    console.error("[PUT /api/teams/me]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
