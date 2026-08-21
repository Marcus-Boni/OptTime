import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import {
  API_TOKEN_PREFIX,
  API_TOKEN_SCOPES,
  type ApiTokenClientKind,
  type ApiTokenScope,
  type ApiTokenSummary,
  looksLikeApiToken,
  maskApiToken,
  parseScopes,
} from "@/lib/api-tokens.shared";
import { db } from "@/lib/db";
import { apiToken, user } from "@/lib/db/schema";

/**
 * Personal Access Tokens (PAT) — server half.
 *
 * Minted from the settings screen and consumed by the MCP server, the CLI and
 * the Azure DevOps extension. The plaintext never touches the database: we
 * store a SHA-256 digest and look tokens up by that digest, which keeps the hot
 * path a single indexed read while making a database leak useless on its own.
 *
 * Scope names, presets and formatting live in `api-tokens.shared` so client
 * components can import them without pulling the database driver into the
 * browser bundle. They are re-exported here for server-side convenience.
 */

export type {
  ApiTokenClientKind,
  ApiTokenPreset,
  ApiTokenScope,
  ApiTokenSummary,
} from "@/lib/api-tokens.shared";
export {
  API_TOKEN_CLIENTS,
  API_TOKEN_PREFIX,
  API_TOKEN_PRESETS,
  API_TOKEN_SCOPES,
  isApiTokenScope,
  looksLikeApiToken,
  maskApiToken,
  parseScopes,
} from "@/lib/api-tokens.shared";

/** Bytes of entropy in the secret half of a token (192 bits). */
const TOKEN_ENTROPY_BYTES = 24;

/** How stale `lastUsedAt` may get before we spend a write refreshing it. */
const LAST_USED_THROTTLE_MS = 5 * 60 * 1000;

/** In-process throttle for `lastUsedAt` writes, keyed by token id. */
const lastTouchedAt = new Map<string, number>();

export function hashApiToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}

export interface GeneratedApiToken {
  plaintext: string;
  tokenHash: string;
  prefix: string;
  last4: string;
}

/**
 * Mints a token shaped `opt_tok_<8 hex>_<48 hex>`. The middle segment is public
 * — it is what the UI renders and what audit trails reference — while the
 * trailing segment is the secret.
 */
export function generateApiToken(): GeneratedApiToken {
  const publicId = randomBytes(4).toString("hex");
  const secret = randomBytes(TOKEN_ENTROPY_BYTES).toString("hex");
  const plaintext = `${API_TOKEN_PREFIX}${publicId}_${secret}`;

  return {
    plaintext,
    tokenHash: hashApiToken(plaintext),
    prefix: `${API_TOKEN_PREFIX}${publicId}`,
    last4: plaintext.slice(-4),
  };
}

function toSummary(row: typeof apiToken.$inferSelect): ApiTokenSummary {
  return {
    id: row.id,
    name: row.name,
    masked: maskApiToken(row.prefix, row.last4),
    scopes: parseScopes(row.scopes),
    client: row.client,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    lastUsedFrom: row.lastUsedFrom ?? null,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    isExpired: row.expiresAt ? row.expiresAt.getTime() < Date.now() : false,
  };
}

export async function listApiTokens(
  userId: string,
): Promise<ApiTokenSummary[]> {
  const rows = await db.query.apiToken.findMany({
    where: and(eq(apiToken.userId, userId), isNull(apiToken.revokedAt)),
    orderBy: [desc(apiToken.createdAt)],
  });

  return rows.map(toSummary);
}

export interface CreateApiTokenInput {
  userId: string;
  name: string;
  scopes: ApiTokenScope[];
  client?: ApiTokenClientKind;
  /** `null` or `undefined` mints a token that never expires. */
  expiresInDays?: number | null;
}

export async function createApiToken(input: CreateApiTokenInput): Promise<{
  plaintext: string;
  token: ApiTokenSummary;
}> {
  const generated = generateApiToken();
  const expiresAt =
    input.expiresInDays && input.expiresInDays > 0
      ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const [row] = await db
    .insert(apiToken)
    .values({
      id: crypto.randomUUID(),
      userId: input.userId,
      name: input.name,
      tokenHash: generated.tokenHash,
      prefix: generated.prefix,
      last4: generated.last4,
      scopes: JSON.stringify(input.scopes),
      client: input.client ?? "mcp",
      expiresAt,
    })
    .returning();

  return { plaintext: generated.plaintext, token: toSummary(row) };
}

/** Soft-revokes a token. Returns false when it does not belong to the user. */
export async function revokeApiToken(
  userId: string,
  tokenId: string,
): Promise<boolean> {
  const [row] = await db
    .update(apiToken)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(apiToken.id, tokenId),
        eq(apiToken.userId, userId),
        isNull(apiToken.revokedAt),
      ),
    )
    .returning({ id: apiToken.id });

  return !!row;
}

export type ApiTokenAuthFailure =
  | "missing"
  | "malformed"
  | "unknown"
  | "revoked"
  | "expired"
  | "inactive_user";

export interface ApiTokenPrincipal {
  userId: string;
  name: string;
  email: string;
  role: "admin" | "manager" | "member";
  scopes: ApiTokenScope[];
  tokenId: string | null;
  tokenName: string;
  /** True when authenticated through the legacy single-token column. */
  legacy: boolean;
}

export type ApiTokenAuthResult =
  | { ok: true; principal: ApiTokenPrincipal }
  | { ok: false; reason: ApiTokenAuthFailure };

function normalizeRole(role: string): "admin" | "manager" | "member" {
  return role === "admin" || role === "manager" ? role : "member";
}

/**
 * Resolves a raw bearer token into a principal.
 *
 * Falls back to the legacy `user.extension_token` column so tokens minted for
 * the Azure DevOps extension keep working against the agent API — those grant
 * the full scope set, matching the access they already had.
 */
export async function authenticateApiToken(
  rawToken: string | null | undefined,
): Promise<ApiTokenAuthResult> {
  const token = rawToken?.trim();
  if (!token) return { ok: false, reason: "missing" };

  if (looksLikeApiToken(token)) {
    const row = await db.query.apiToken.findFirst({
      where: eq(apiToken.tokenHash, hashApiToken(token)),
      with: {
        user: {
          columns: {
            id: true,
            name: true,
            email: true,
            role: true,
            isActive: true,
          },
        },
      },
    });

    if (!row) return { ok: false, reason: "unknown" };
    if (row.revokedAt) return { ok: false, reason: "revoked" };
    if (row.expiresAt && row.expiresAt.getTime() < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    if (!row.user?.isActive) return { ok: false, reason: "inactive_user" };

    return {
      ok: true,
      principal: {
        userId: row.user.id,
        name: row.user.name,
        email: row.user.email,
        role: normalizeRole(row.user.role),
        scopes: parseScopes(row.scopes),
        tokenId: row.id,
        tokenName: row.name,
        legacy: false,
      },
    };
  }

  // Legacy extension tokens are plain hex strings with no prefix.
  if (!/^[0-9a-f]{32,128}$/i.test(token)) {
    return { ok: false, reason: "malformed" };
  }

  const legacyUser = await db.query.user.findFirst({
    where: eq(user.extensionToken, token),
    columns: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      extensionToken: true,
    },
  });

  if (!legacyUser?.extensionToken) return { ok: false, reason: "unknown" };

  // Defence in depth: the lookup above is already exact, but comparing in
  // constant time keeps this honest if the query ever becomes fuzzy.
  const provided = Buffer.from(token);
  const stored = Buffer.from(legacyUser.extensionToken);
  if (provided.length !== stored.length || !timingSafeEqual(provided, stored)) {
    return { ok: false, reason: "unknown" };
  }

  if (!legacyUser.isActive) return { ok: false, reason: "inactive_user" };

  return {
    ok: true,
    principal: {
      userId: legacyUser.id,
      name: legacyUser.name,
      email: legacyUser.email,
      role: normalizeRole(legacyUser.role),
      scopes: [...API_TOKEN_SCOPES],
      tokenId: null,
      tokenName: "Token da extensão (legado)",
      legacy: true,
    },
  };
}

/**
 * Records that a token was used. Throttled to at most one write per token every
 * five minutes so a chatty agent does not turn every read into a write.
 */
export function touchApiToken(
  tokenId: string | null,
  userAgent: string | null,
): void {
  if (!tokenId) return;

  const now = Date.now();
  const last = lastTouchedAt.get(tokenId);
  if (last && now - last < LAST_USED_THROTTLE_MS) return;
  lastTouchedAt.set(tokenId, now);

  void db
    .update(apiToken)
    .set({
      lastUsedAt: new Date(),
      lastUsedFrom: userAgent?.slice(0, 200) ?? null,
    })
    .where(eq(apiToken.id, tokenId))
    .catch((error: unknown) => {
      console.error("[api-tokens] touchApiToken:", error);
    });
}
