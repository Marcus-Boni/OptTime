import { eq } from "drizzle-orm";
import {
  canManageUser,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import {
  activeTimer,
  session as sessionTable,
  user as userTable,
} from "@/lib/db/schema";
import { updatePersonSchema } from "@/lib/validations/people.schema";

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  const role = actor.role;
  if (role !== "admin" && role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const payload = await req.json();
    const parsed = updatePersonSchema.safeParse(payload);

    if (!parsed.success) {
      return Response.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const targetUser = await db.query.user.findFirst({
      where: eq(userTable.id, id),
    });

    if (!targetUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const allowed = await canManageUser(actor, id);
    if (!allowed) {
      return Response.json(
        { error: "Você não pode gerenciar este usuário." },
        { status: 403 },
      );
    }

    if (role === "manager") {
      if (targetUser.role === "admin") {
        return Response.json(
          { error: "Gerentes não podem alterar administradores." },
          { status: 403 },
        );
      }
      if (parsed.data.role === "admin") {
        return Response.json(
          { error: "Gerentes não podem promover para administrador." },
          { status: 403 },
        );
      }
    }

    const updated = await db
      .update(userTable)
      .set(parsed.data)
      .where(eq(userTable.id, id))
      .returning();

    return Response.json(updated[0], { status: 200 });
  } catch (err: unknown) {
    console.error("[PATCH /api/people/[id]]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  const role = actor.role;
  if (role !== "admin" && role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;

  try {
    const targetUser = await db.query.user.findFirst({
      where: eq(userTable.id, id),
    });

    if (!targetUser) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    if (session.user.id === id) {
      return Response.json(
        { error: "Você não pode desativar a própria conta por esta rota." },
        { status: 400 },
      );
    }

    const allowed = await canManageUser(actor, id);
    if (!allowed) {
      return Response.json(
        { error: "Você não pode remover este usuário do seu escopo." },
        { status: 403 },
      );
    }

    if (role === "manager" && targetUser.role === "admin") {
      return Response.json(
        { error: "Gerentes não podem excluir administradores." },
        { status: 403 },
      );
    }

    const directReports = await db.query.user.findMany({
      where: eq(userTable.managerId, id),
      columns: { id: true },
      limit: 1,
    });

    if (directReports.length > 0) {
      return Response.json(
        {
          error:
            "Reatribua os subordinados diretos antes de remover este gestor.",
        },
        { status: 409 },
      );
    }

    await db.transaction(async (tx) => {
      await tx
        .update(userTable)
        .set({
          isActive: false,
          extensionToken: null,
          updatedAt: new Date(),
        })
        .where(eq(userTable.id, id));

      await tx.delete(sessionTable).where(eq(sessionTable.userId, id));
      await tx.delete(activeTimer).where(eq(activeTimer.userId, id));
    });

    return Response.json(
      {
        success: true,
        message: "Usuário removido do acesso sem apagar o histórico.",
      },
      { status: 200 },
    );
  } catch (err: unknown) {
    console.error("[DELETE /api/people/[id]]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
