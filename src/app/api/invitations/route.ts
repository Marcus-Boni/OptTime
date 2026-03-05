import { randomBytes } from "crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation, user } from "@/lib/db/schema";
import { sendInvitationEmail } from "@/lib/email";
import { createInvitationSchema } from "@/lib/validations/invitation.schema";

const INVITE_EXPIRY_HOURS = 72;

export async function POST(req: Request): Promise<Response> {
  // 1. Auth check
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. RBAC — apenas manager ou admin podem convidar
  const inviterRole = session.user.role as string;
  if (inviterRole !== "admin" && inviterRole !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  // 3. Parse & validate body
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

  // 4. Manager não pode convidar admin
  if (inviterRole === "manager" && role === "admin") {
    return Response.json(
      { error: "Gerentes não podem convidar administradores" },
      { status: 403 },
    );
  }

  try {
    // 5. Verificar se usuário já existe
    const [existingUser] = await db
      .select({ id: user.id })
      .from(user)
      .where(eq(user.email, email))
      .limit(1);

    if (existingUser) {
      return Response.json(
        { error: "Este e-mail já está cadastrado no sistema" },
        { status: 409 },
      );
    }

    // 6. Verificar se já existe convite pendente para este email
    const [existingInvite] = await db
      .select({ id: invitation.id })
      .from(invitation)
      .where(and(eq(invitation.email, email), eq(invitation.status, "pending")))
      .limit(1);

    if (existingInvite) {
      return Response.json(
        { error: "Já existe um convite pendente para este e-mail" },
        { status: 409 },
      );
    }

    // 7. Gerar token seguro e criar convite
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(
      Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000,
    );
    const id = randomBytes(16).toString("hex");

    const [created] = await db
      .insert(invitation)
      .values({
        id,
        email,
        role,
        token,
        invitedById: session.user.id,
        status: "pending",
        expiresAt,
      })
      .returning();

    // 8. Enviar email — se falhar, reverte o convite para não deixar registro órfão
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
      // Rollback: remove convite criado para permitir nova tentativa
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
    console.error("[POST /api/invitations]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function GET(req: Request): Promise<Response> {
  // Lista convites pendentes (apenas manager/admin)
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inviterRole = session.user.role as string;
  if (inviterRole !== "admin" && inviterRole !== "manager") {
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
      .orderBy(invitation.createdAt);

    return Response.json(invitations);
  } catch (err) {
    console.error("[GET /api/invitations]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
