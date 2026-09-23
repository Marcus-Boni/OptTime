import { eq } from "drizzle-orm";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  fetchAllMicrosoftUsers,
  type MicrosoftUserProfile,
} from "@/lib/microsoft-graph";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";

export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const accessToken = await getMicrosoftAccessToken(
      req.headers,
      session.user.id,
    );

    if (!accessToken) {
      return Response.json(
        {
          error:
            "Não foi possível obter o token de acesso Microsoft com a permissão User.Read.All. Faça login novamente com sua conta corporativa Microsoft.",
        },
        { status: 400 },
      );
    }

    const msUsers = await fetchAllMicrosoftUsers(accessToken);
    if (msUsers.length === 0) {
      return Response.json(
        {
          error:
            "Nenhum usuário foi retornado pelo Microsoft Graph. Verifique se o consentimento de administrador para User.Read.All está ativo.",
        },
        { status: 502 },
      );
    }

    // Build fast lookup indices by email, userPrincipalName, and Entra Object ID
    const msByEmail = new Map<string, MicrosoftUserProfile>();
    const msByAzureId = new Map<string, MicrosoftUserProfile>();

    for (const msUser of msUsers) {
      if (msUser.mail) {
        msByEmail.set(msUser.mail.trim().toLowerCase(), msUser);
      }
      if (msUser.userPrincipalName) {
        msByEmail.set(msUser.userPrincipalName.trim().toLowerCase(), msUser);
      }
      if (msUser.id) {
        msByAzureId.set(msUser.id, msUser);
      }
    }

    const localUsers = await db
      .select({
        id: user.id,
        email: user.email,
        azureId: user.azureId,
        jobTitle: user.jobTitle,
        department: user.department,
        officeLocation: user.officeLocation,
      })
      .from(user);

    let matchedCount = 0;
    let updatedCount = 0;
    const now = new Date();

    for (const localUser of localUsers) {
      const normalizedEmail = localUser.email.trim().toLowerCase();
      const match =
        (localUser.azureId ? msByAzureId.get(localUser.azureId) : null) ??
        msByEmail.get(normalizedEmail);

      if (!match) continue;

      matchedCount += 1;

      const hasChanges =
        (match.jobTitle && match.jobTitle !== localUser.jobTitle) ||
        (match.department && match.department !== localUser.department) ||
        (match.officeLocation &&
          match.officeLocation !== localUser.officeLocation) ||
        (match.id && match.id !== localUser.azureId);

      const updates: Partial<typeof user.$inferInsert> = {
        microsoftSyncedAt: now,
        updatedAt: now,
      };

      if (match.id) updates.azureId = match.id;
      if (match.jobTitle) updates.jobTitle = match.jobTitle;
      if (match.department) updates.department = match.department;
      if (match.officeLocation) updates.officeLocation = match.officeLocation;

      await db.update(user).set(updates).where(eq(user.id, localUser.id));
      if (hasChanges) {
        updatedCount += 1;
      }
    }

    return Response.json({
      success: true,
      totalMicrosoftUsers: msUsers.length,
      totalLocalUsers: localUsers.length,
      matchedUsers: matchedCount,
      updatedUsers: updatedCount,
      unmappedUsers: localUsers.length - matchedCount,
    });
  } catch (error: unknown) {
    console.error("[POST /api/people/sync-microsoft]", error);
    return Response.json(
      { error: "Erro ao sincronizar colaboradores com Microsoft 365" },
      { status: 500 },
    );
  }
}
