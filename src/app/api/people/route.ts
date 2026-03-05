import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

/** GET /api/people — lista todos os usuários ativos (apenas manager/admin) */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = session.user.role as string;
  if (role !== "admin" && role !== "manager") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const people = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        department: user.department,
        isActive: user.isActive,
        weeklyCapacity: user.weeklyCapacity,
        createdAt: user.createdAt,
      })
      .from(user)
      .orderBy(user.name);

    return Response.json(people);
  } catch (err) {
    console.error("[GET /api/people]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
