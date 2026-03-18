import { randomBytes } from "crypto";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

/**
 * GET /api/user/extension-token
 * Returns whether the user has an extension token, plus a masked preview.
 */
export async function GET(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const record = await db.query.user.findFirst({
    where: eq(user.id, session.user.id),
    columns: { extensionToken: true },
  });

  const token = record?.extensionToken ?? null;
  return Response.json({
    hasToken: !!token,
    // Show only the last 6 chars as a preview (safe to expose)
    tokenPreview: token ? `...${token.slice(-6)}` : null,
  });
}

/**
 * POST /api/user/extension-token
 * Generates (or regenerates) the extension token.
 * Returns the full token exactly once — the user must copy it now.
 */
export async function POST(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  const newToken = randomBytes(32).toString("hex");

  await db
    .update(user)
    .set({ extensionToken: newToken, updatedAt: new Date() })
    .where(eq(user.id, session.user.id));

  return Response.json({ token: newToken });
}

/**
 * DELETE /api/user/extension-token
 * Revokes the extension token.
 */
export async function DELETE(req: Request): Promise<Response> {
  const session = await auth.api.getSession({ headers: req.headers });
  if (!session)
    return Response.json({ error: "Unauthorized" }, { status: 401 });

  await db
    .update(user)
    .set({ extensionToken: null, updatedAt: new Date() })
    .where(eq(user.id, session.user.id));

  return Response.json({ success: true });
}
