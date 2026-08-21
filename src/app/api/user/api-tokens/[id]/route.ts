import { getActiveSession } from "@/lib/access-control";
import { revokeApiToken } from "@/lib/api-tokens";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * DELETE /api/user/api-tokens/:id
 * Revokes a personal access token. Revocation is immediate — the next agent
 * request with that token fails authentication.
 */
export async function DELETE(
  req: Request,
  context: RouteContext,
): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  try {
    const revoked = await revokeApiToken(session.user.id, id);

    if (!revoked) {
      return Response.json(
        { error: "Token não encontrado ou já revogado." },
        { status: 404 },
      );
    }

    console.info("[api-tokens] revoked", {
      userId: session.user.id,
      tokenId: id,
    });

    return Response.json({ success: true });
  } catch (error: unknown) {
    console.error("[DELETE /api/user/api-tokens/:id]:", error);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
