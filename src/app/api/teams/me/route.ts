import { eq } from "drizzle-orm";
import { getActiveSession } from "@/lib/access-control";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";
import { fetchMicrosoftObjectId } from "@/lib/microsoft-graph";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";
import { saveTeamsPreferencesSchema } from "@/lib/validations/teams.schema";

interface TeamsPreferencesView {
  teamsStatusSyncEnabled: boolean;
  eveningDigestEnabled: boolean;
  hasPersonalWebhook: boolean;
  /** Non-secret preview so the user recognizes the stored URL. */
  personalWebhookPreview: string | null;
  /** Whether the login scope for presence sync is active in this deploy. */
  presenceScopeEnabled: boolean;
  /**
   * True once the Entra object id is stored — chat commands can only resolve
   * the sender back to an app user when this is linked.
   */
  identityLinked: boolean;
}

async function buildView(userId: string): Promise<TeamsPreferencesView | null> {
  const row = await db.query.user.findFirst({
    where: eq(user.id, userId),
    columns: {
      teamsStatusSyncEnabled: true,
      eveningDigestEnabled: true,
      teamsWebhookUrl: true,
      azureId: true,
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
    identityLinked: Boolean(row.azureId),
  };
}

/**
 * Backfills `user.azureId` with the Entra object id from Graph.
 *
 * Better Auth stores the pairwise `sub` claim in `account.accountId`, which
 * never matches the `aadObjectId` Teams sends — so the link has to be resolved
 * from Graph once. Best-effort: a failure here only means chat commands stay
 * unlinked, never that the page fails to load.
 */
async function ensureIdentityLinked(
  headers: Headers,
  userId: string,
  alreadyLinked: boolean,
): Promise<boolean> {
  if (alreadyLinked) return true;

  try {
    const accessToken = await getMicrosoftAccessToken(headers, userId);
    if (!accessToken) return false;

    const objectId = await fetchMicrosoftObjectId(accessToken);
    if (!objectId) return false;

    await db.update(user).set({ azureId: objectId }).where(eq(user.id, userId));

    console.info("[teams_identity_linked]", { userId });
    return true;
  } catch (error: unknown) {
    console.error("[GET /api/teams/me] identity link:", error);
    return false;
  }
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

    // Opening this page is the natural moment to bind the Teams identity.
    const identityLinked = await ensureIdentityLinked(
      req.headers,
      session.user.id,
      preferences.identityLinked,
    );

    return Response.json({ preferences: { ...preferences, identityLinked } });
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
