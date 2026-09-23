import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { fetchMicrosoftUserProfile } from "@/lib/microsoft-graph";
import { getMicrosoftAccessToken } from "@/lib/microsoft-token";
import { updateProfileSchema } from "@/lib/validations/profile.schema";

const userProfileSelect = {
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
  timeAssistantEnabled: user.timeAssistantEnabled,
  timeDefaultBillable: user.timeDefaultBillable,
  timeDefaultDuration: user.timeDefaultDuration,
  timeDefaultView: user.timeDefaultView,
  timeOutlookDefaultOpen: user.timeOutlookDefaultOpen,
  timeShowWeekends: user.timeShowWeekends,
  timeSubmitMode: user.timeSubmitMode,
  updatedAt: user.updatedAt,
  weeklyCapacity: user.weeklyCapacity,
} as const;

export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const found = await db.query.user.findFirst({
      where: eq(user.id, session.user.id),
      columns: {
        azureId: true,
        createdAt: true,
        department: true,
        email: true,
        id: true,
        image: true,
        isActive: true,
        jobTitle: true,
        microsoftSyncedAt: true,
        name: true,
        officeLocation: true,
        role: true,
        timeAssistantEnabled: true,
        timeDefaultBillable: true,
        timeDefaultDuration: true,
        timeDefaultView: true,
        timeOutlookDefaultOpen: true,
        timeShowWeekends: true,
        timeSubmitMode: true,
        updatedAt: true,
        weeklyCapacity: true,
      },
    });

    if (!found) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    // Auto-sync transparently if the user has never synced from Microsoft Graph
    if (found.microsoftSyncedAt === null) {
      try {
        const token = await getMicrosoftAccessToken(
          req.headers,
          session.user.id,
        );
        if (token) {
          const msProfile = await fetchMicrosoftUserProfile(token);
          if (msProfile) {
            const updates: Partial<typeof user.$inferInsert> = {
              microsoftSyncedAt: new Date(),
              azureId: msProfile.id || found.azureId,
            };
            if (msProfile.jobTitle) {
              updates.jobTitle = msProfile.jobTitle;
              found.jobTitle = msProfile.jobTitle;
            }
            if (msProfile.department && !found.department) {
              updates.department = msProfile.department;
              found.department = msProfile.department;
            }
            if (msProfile.officeLocation && !found.officeLocation) {
              updates.officeLocation = msProfile.officeLocation;
              found.officeLocation = msProfile.officeLocation;
            }
            found.microsoftSyncedAt = updates.microsoftSyncedAt as Date;
            if (updates.azureId) found.azureId = updates.azureId;

            await db
              .update(user)
              .set(updates)
              .where(eq(user.id, session.user.id));
          }
        }
      } catch (err) {
        console.warn("[GET /api/user/profile] Auto-sync silent catch:", err);
      }
    }

    return Response.json(found);
  } catch (err) {
    console.error("[GET /api/user/profile]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = updateProfileSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const data = parsed.data;
  const updates: Partial<typeof user.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (typeof data.name !== "undefined") {
    updates.name = data.name;
  }
  if (typeof data.department !== "undefined") {
    updates.department = data.department ?? null;
  }
  if (typeof data.jobTitle !== "undefined") {
    updates.jobTitle = data.jobTitle ?? null;
  }
  if (typeof data.officeLocation !== "undefined") {
    updates.officeLocation = data.officeLocation ?? null;
  }
  if (typeof data.weeklyCapacity !== "undefined") {
    updates.weeklyCapacity = data.weeklyCapacity;
  }
  if (typeof data.timeDefaultView !== "undefined") {
    updates.timeDefaultView = data.timeDefaultView;
  }
  if (typeof data.timeDefaultDuration !== "undefined") {
    updates.timeDefaultDuration = data.timeDefaultDuration;
  }
  if (typeof data.timeSubmitMode !== "undefined") {
    updates.timeSubmitMode = data.timeSubmitMode;
  }
  if (typeof data.timeDefaultBillable !== "undefined") {
    updates.timeDefaultBillable = data.timeDefaultBillable;
  }
  if (typeof data.timeAssistantEnabled !== "undefined") {
    updates.timeAssistantEnabled = data.timeAssistantEnabled;
  }
  if (typeof data.timeOutlookDefaultOpen !== "undefined") {
    updates.timeOutlookDefaultOpen = data.timeOutlookDefaultOpen;
  }
  if (typeof data.timeShowWeekends !== "undefined") {
    updates.timeShowWeekends = data.timeShowWeekends;
  }

  try {
    const [updated] = await db
      .update(user)
      .set(updates)
      .where(eq(user.id, session.user.id))
      .returning(userProfileSelect);

    if (!updated) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err) {
    console.error("[PATCH /api/user/profile]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
