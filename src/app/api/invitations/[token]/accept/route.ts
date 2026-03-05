import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";
import { acceptInvitationSchema } from "@/lib/validations/invitation.schema";

/** POST /api/invitations/[token]/accept — cria conta e marca convite como aceito */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  if (!token || typeof token !== "string") {
    return Response.json({ error: "Token inválido" }, { status: 400 });
  }

  // 1. Parse & validate body
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = acceptInvitationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const { name, password } = parsed.data;

  try {
    // 2. Buscar e validar convite
    const [found] = await db
      .select()
      .from(invitation)
      .where(and(eq(invitation.token, token), eq(invitation.status, "pending")))
      .limit(1);

    if (!found) {
      return Response.json(
        { error: "Convite não encontrado ou já utilizado" },
        { status: 404 },
      );
    }

    if (new Date() > new Date(found.expiresAt)) {
      await db
        .update(invitation)
        .set({ status: "expired" })
        .where(eq(invitation.id, found.id));

      return Response.json({ error: "Convite expirado" }, { status: 410 });
    }

    // 3. Criar usuário via Better Auth (inclui hash da senha)
    const result = await auth.api.signUpEmail({
      body: {
        email: found.email,
        name,
        password,
      },
    });

    if (!result || !result.user) {
      return Response.json(
        { error: "Falha ao criar conta. Tente novamente." },
        { status: 500 },
      );
    }

    // 4. Atualizar role do usuário conforme convite
    // (Better Auth cria com role 'member' por padrão; precisamos ajustar se diferente)
    if (found.role !== "member") {
      const { user: userTable } = await import("@/lib/db/schema");
      await db
        .update(userTable)
        .set({ role: found.role })
        .where(eq(userTable.id, result.user.id));
    }

    // 5. Marcar convite como aceito
    await db
      .update(invitation)
      .set({
        status: "accepted",
        acceptedAt: new Date(),
      })
      .where(eq(invitation.id, found.id));

    return Response.json({ success: true }, { status: 201 });
  } catch (err) {
    console.error("[POST /api/invitations/[token]/accept]", err);

    // Tratar erro de email duplicado
    if (err instanceof Error && err.message.toLowerCase().includes("already")) {
      return Response.json(
        { error: "Este e-mail já está cadastrado no sistema" },
        { status: 409 },
      );
    }

    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
