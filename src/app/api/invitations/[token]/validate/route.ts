import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { invitation } from "@/lib/db/schema";

/** GET /api/invitations/[token]/validate — público, valida se token é válido */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<Response> {
  const { token } = await params;

  if (!token || typeof token !== "string") {
    return Response.json({ error: "Token inválido" }, { status: 400 });
  }

  try {
    const [found] = await db
      .select({
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        status: invitation.status,
        expiresAt: invitation.expiresAt,
      })
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
      // Marca como expirado em background
      void db
        .update(invitation)
        .set({ status: "expired" })
        .where(eq(invitation.id, found.id));

      return Response.json({ error: "Convite expirado" }, { status: 410 });
    }

    return Response.json({
      email: found.email,
      role: found.role,
    });
  } catch (err) {
    console.error("[GET /api/invitations/[token]/validate]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
