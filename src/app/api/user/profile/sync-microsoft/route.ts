import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import {
  fetchMicrosoftUserPhoto,
  fetchMicrosoftUserProfile,
} from "@/lib/microsoft-graph";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";

export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
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
            "Sua sessão Microsoft expirou ou a conta corporativa não está vinculada. Por favor, saia e entre novamente com sua conta Microsoft para autorizar a sincronização.",
        },
        { status: 400 },
      );
    }

    const msProfile = await fetchMicrosoftUserProfile(accessToken);
    if (!msProfile) {
      return Response.json(
        {
          error:
            "Não foi possível obter os dados cadastrais do Microsoft Entra ID. Tente novamente em instantes.",
        },
        { status: 502 },
      );
    }

    const currentUser = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        id: true,
        image: true,
        jobTitle: true,
        department: true,
      },
    });

    const updates: Partial<typeof user.$inferInsert> = {
      microsoftSyncedAt: new Date(),
      updatedAt: new Date(),
    };

    if (msProfile.id) {
      updates.azureId = msProfile.id;
    }

    if (msProfile.jobTitle) {
      updates.jobTitle = msProfile.jobTitle;
    }

    if (msProfile.department) {
      updates.department = msProfile.department;
    }

    if (msProfile.officeLocation) {
      updates.officeLocation = msProfile.officeLocation;
    }

    // If user has no avatar image yet, attempt to fetch high-res corporate photo
    let syncedPhoto = false;
    if (!currentUser?.image) {
      const photo = await fetchMicrosoftUserPhoto(accessToken, "me");
      if (photo) {
        updates.image = photo;
        syncedPhoto = true;
      }
    }

    const [updatedUser] = await db
      .update(user)
      .set(updates)
      .where(eq(user.id, session.user.id))
      .returning({
        azureId: user.azureId,
        createdAt: user.createdAt,
        department: user.department,
        email: user.email,
        id: user.id,
        image: user.image,
        isActive: user.isActive,
        jobTitle: user.jobTitle,
        microsoftSyncedAt: user.microsoftSyncedAt,
        name: user.name,
        officeLocation: user.officeLocation,
        role: user.role,
        weeklyCapacity: user.weeklyCapacity,
      });

    return Response.json({
      success: true,
      user: updatedUser,
      profile: msProfile,
      syncedFields: {
        azureId: Boolean(msProfile.id),
        department: Boolean(msProfile.department),
        jobTitle: Boolean(msProfile.jobTitle),
        officeLocation: Boolean(msProfile.officeLocation),
        photo: syncedPhoto,
      },
    });
  } catch (error: unknown) {
    console.error("[POST /api/user/profile/sync-microsoft]", error);
    return Response.json(
      { error: "Erro interno ao sincronizar perfil com o Microsoft 365" },
      { status: 500 },
    );
  }
}
