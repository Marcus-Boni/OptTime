import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { user } from "@/lib/db/schema";

export type ExtensionUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

/**
 * Resolves an authenticated user from an extension Bearer token.
 * Reads the token from the `Authorization: Bearer <token>` header.
 * Returns null if the token is missing, invalid, or revoked.
 */
export async function resolveExtensionUser(
  req: Request,
): Promise<ExtensionUser | null> {
  const authHeader = req.headers.get("authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7).trim();
  if (!token) return null;

  const record = await db.query.user.findFirst({
    where: eq(user.extensionToken, token),
    columns: { id: true, name: true, email: true, role: true, isActive: true },
  });

  if (!record || !record.isActive) return null;

  return {
    id: record.id,
    name: record.name,
    email: record.email,
    role: record.role,
  };
}

/** Standard CORS headers allowing Azure DevOps origins. */
export const EXTENSION_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  Pragma: "no-cache",
  Expires: "0",
};

/** Handle CORS preflight for extension routes. */
export function extensionOptions(): Response {
  return new Response(null, { status: 204, headers: EXTENSION_CORS_HEADERS });
}

/** Wrap a JSON response with CORS headers. */
export function extensionJson(body: unknown, init?: ResponseInit): Response {
  return Response.json(body, {
    ...init,
    headers: { ...EXTENSION_CORS_HEADERS, ...(init?.headers ?? {}) },
  });
}
