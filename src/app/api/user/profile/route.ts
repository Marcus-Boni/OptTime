import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";
import { updateProfileSchema } from "@/lib/validations/profile.schema";

export async function PATCH(req: Request): Promise<Response> {
  // 1. Auth check
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Parse & validate body
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

  const { name, department, weeklyCapacity } = parsed.data;

  // 3. Business logic → DB write
  try {
    const [updated] = await db
      .update(user)
      .set({
        name,
        department: department ?? null,
        weeklyCapacity,
        updatedAt: new Date(),
      })
      .where(eq(user.id, session.user.id))
      .returning({
        id: user.id,
        name: user.name,
        email: user.email,
        department: user.department,
        weeklyCapacity: user.weeklyCapacity,
        role: user.role,
        updatedAt: user.updatedAt,
      });

    if (!updated) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    return Response.json(updated);
  } catch (err) {
    console.error("[PATCH /api/user/profile]", err);
    return Response.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
