import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { invitation, user } from "@/lib/db/schema";
import { sendInvitationEmail } from "@/lib/email";
import { createInvitationSchema } from "@/lib/validations/invitation.schema";

const INVITE_EXPIRY_HOURS = 72;

export async function POST(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = createInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const { email, role } = parsed.data;
  if (actor.role === "manager" && role === "admin") {
    return Response.json(
      { error: "Gerentes nao podem convidar administradores" },
      { status: 403 },
    );
  }

  try {
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    const id = randomBytes(16).toString("hex");

    const created = await db.transaction(async (tx) => {
      const [existingUser] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.email, email))
        .limit(1);

      if (existingUser) {
        throw new Error("USER_ALREADY_EXISTS");
      }

      const [existingInvite] = await tx
        .select({ id: invitation.id })
        .from(invitation)
        .where(
          and(eq(invitation.email, email), eq(invitation.status, "pending")),
        )
        .limit(1);

      if (existingInvite) {
        throw new Error("INVITATION_ALREADY_EXISTS");
      }

      const [newInvitation] = await tx
        .insert(invitation)
        .values({
          id,
          email,
          role,
          token,
          invitedById: actor.userId,
          status: "pending",
          expiresAt,
        })
        .returning();

      return newInvitation;
    });

    const appUrl =
      process.env.BETTER_AUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "http://localhost:3000";
    const acceptUrl = `${appUrl}/accept-invite?token=${token}`;

    try {
      await sendInvitationEmail({
        to: email,
        inviterName: session.user.name,
        inviterEmail: session.user.email,
        role,
        acceptUrl,
        expiresInHours: INVITE_EXPIRY_HOURS,
      });
    } catch (emailErr) {
      await db.delete(invitation).where(eq(invitation.id, created.id));

      console.error(
        "[POST /api/invitations] Falha ao enviar e-mail:",
        emailErr,
      );

      const message =
        emailErr instanceof Error
          ? emailErr.message
          : "Falha ao enviar e-mail de convite";

      return Response.json({ error: message }, { status: 502 });
    }

    return Response.json(
      {
        id: created.id,
        email: created.email,
        role: created.role,
        expiresAt: created.expiresAt,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "USER_ALREADY_EXISTS") {
        return Response.json(
          { error: "Este e-mail ja esta cadastrado no sistema" },
          { status: 409 },
        );
      }

      if (err.message === "INVITATION_ALREADY_EXISTS") {
        return Response.json(
          { error: "Ja existe um convite pendente para este e-mail" },
          { status: 409 },
        );
      }
    }

    console.error("[POST /api/invitations]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "admin" && actor.role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const invitations = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
        createdAt: invitation.createdAt,
        invitedById: invitation.invitedById,
      })
      .from(invitation)
      .where(
        actor.role === "admin"
          ? undefined
          : eq(invitation.invitedById, actor.userId),
      )
      .orderBy(invitation.createdAt);

    return Response.json(invitations);
  } catch (err) {
    console.error("[GET /api/invitations]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
