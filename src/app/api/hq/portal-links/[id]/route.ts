import { eq } from "drizzle-orm";
import {
  canManageProject,
  getActiveSession,
  getActorContext,
} from "@/lib/access-control";
import { db } from "@/lib/db";
import { portalLink } from "@/lib/db/schema";
import { updatePortalLinkSchema } from "@/lib/validations/hq.schema";

type RouteContext = { params: Promise<{ id: string }> };

async function loadAuthorizedLink(
  req: Request,
  context: RouteContext,
): Promise<
  | { response: Response }
  | { link: typeof portalLink.$inferSelect; response?: undefined }
> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return {
      response: Response.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const actor = getActorContext(session.user);
  if (actor.role !== "manager" && actor.role !== "admin") {
    return {
      response: Response.json({ error: "Sem permissão." }, { status: 403 }),
    };
  }

  const { id } = await context.params;
  const link = await db.query.portalLink.findFirst({
    where: eq(portalLink.id, id),
  });

  if (!link) {
    return {
      response: Response.json(
        { error: "Link não encontrado." },
        { status: 404 },
      ),
    };
  }

  if (!(await canManageProject(actor, link.projectId))) {
    return {
      response: Response.json(
        { error: "Você só pode gerenciar portais dos seus projetos." },
        { status: 403 },
      ),
    };
  }

  return { link };
}

/** PATCH - Revoke or update a portal link's label/visibility/expiry. */
export async function PATCH(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const result = await loadAuthorizedLink(req, context);
    if (result.response) return result.response;

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "JSON inválido." }, { status: 400 });
    }

    const parsed = updatePortalLinkSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: "Payload inválido", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    if (parsed.data.action === "revoke") {
      const [updated] = await db
        .update(portalLink)
        .set({ revokedAt: new Date() })
        .where(eq(portalLink.id, result.link.id))
        .returning();

      return Response.json({ link: updated });
    }

    const { label, showBudget, showTeam, showDescriptions, expiresInDays } =
      parsed.data;

    const [updated] = await db
      .update(portalLink)
      .set({
        ...(label !== undefined ? { label } : {}),
        ...(showBudget !== undefined ? { showBudget } : {}),
        ...(showTeam !== undefined ? { showTeam } : {}),
        ...(showDescriptions !== undefined ? { showDescriptions } : {}),
        ...(expiresInDays !== undefined
          ? {
              expiresAt:
                expiresInDays === null
                  ? null
                  : new Date(Date.now() + expiresInDays * 86_400_000),
            }
          : {}),
        updatedAt: new Date(),
      })
      .where(eq(portalLink.id, result.link.id))
      .returning();

    return Response.json({ link: updated });
  } catch (error) {
    console.error("[PATCH /api/hq/portal-links/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

/** DELETE - Permanently remove a portal link (revoking is usually enough). */
export async function DELETE(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  try {
    const result = await loadAuthorizedLink(req, context);
    if (result.response) return result.response;

    await db.delete(portalLink).where(eq(portalLink.id, result.link.id));

    return Response.json({ deleted: true });
  } catch (error) {
    console.error("[DELETE /api/hq/portal-links/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
