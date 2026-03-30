import { buildScopedUserWhere, getActiveSession, getActorContext } from "@/lib/access-control";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

/** GET /api/people — lista todos os usuários ativos (apenas manager/admin) */
export async function GET(req: Request): Promise<Response> {
  const session = await getActiveSession(req.headers);
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = getActorContext(session.user);
  const role = actor.role;
  if (role !== "admin" && role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const where = await buildScopedUserWhere(actor);
    const people = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        role: user.role,
        department: user.department,
        isActive: user.isActive,
        weeklyCapacity: user.weeklyCapacity,
        createdAt: user.createdAt,
      })
      .from(user)
      .where(where)
      .orderBy(user.name);

    return Response.json(people);
  } catch (err) {
    console.error("[GET /api/people]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
