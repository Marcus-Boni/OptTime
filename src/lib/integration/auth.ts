import { createRemoteJWKSet, type JWTPayload, jwtVerify } from "jose";
import { ApiError } from "./errors";

export type M2MContext = {
  clientId: string;
  scopes: string[];
  tenantId: string;
};

let jwksInstance: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksCreatedAt = 0;
const JWKS_TTL_MS = 24 * 60 * 60 * 1000;

function getJwks(): ReturnType<typeof createRemoteJWKSet> {
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  if (!tenantId) {
    throw new ApiError("INTERNAL_ERROR", "MICROSOFT_TENANT_ID is not set", 500);
  }

  const now = Date.now();
  if (!jwksInstance || now - jwksCreatedAt > JWKS_TTL_MS) {
    jwksInstance = createRemoteJWKSet(
      new URL(
        `https://login.microsoftonline.com/${tenantId}/discovery/v2.0/keys`,
      ),
    );
    jwksCreatedAt = now;
  }
  return jwksInstance;
}

export async function validateM2MToken(req: Request): Promise<M2MContext> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new ApiError(
      "UNAUTHORIZED",
      "Missing or invalid Authorization header",
      401,
    );
  }

  const token = authHeader.slice(7);

  // 1. Check for the standardized integration key
  const integrationKey = process.env.INTEGRATION_KEY;
  if (integrationKey && token === integrationKey) {
    return {
      clientId: "standardized-integration-client",
      scopes: ["opt-time.read", "opt-time.write", "opt-time.admin"],
      tenantId: "standardized",
    };
  }

  // 2. Fallback to Microsoft Entra token validation
  const tenantId = process.env.MICROSOFT_TENANT_ID;
  const audience = process.env.ENTRA_API_AUDIENCE;

  if (!tenantId || !audience) {
    throw new ApiError(
      "INTERNAL_ERROR",
      `Server configuration missing: MICROSOFT_TENANT_ID (${tenantId ? 'configured' : 'missing'}) and ENTRA_API_AUDIENCE (${audience ? 'configured' : 'missing'}) must be set`,
      500,
    );
  }

  let payload: JWTPayload;
  try {
    const result = await jwtVerify(token, getJwks(), {
      audience,
      issuer: [
        `https://sts.windows.net/${tenantId}/`,
        `https://login.microsoftonline.com/${tenantId}/v2.0`,
      ],
    });
    payload = result.payload;
  } catch (err: unknown) {
    throw new ApiError(
      "UNAUTHORIZED",
      err instanceof Error ? `Token validation failed: ${err.message}` : "Invalid or expired token",
      401,
    );
  }

  // Reject user-delegated tokens — this layer accepts M2M (client_credentials) only.
  // User tokens carry 'scp'; M2M tokens carry 'roles' from app role assignments.
  if (payload["scp"]) {
    throw new ApiError(
      "UNAUTHORIZED",
      "User tokens are not accepted here. Use application credentials (client_credentials grant).",
      401,
    );
  }

  // v1 Entra tokens expose caller app as 'appid'; v2 tokens use 'azp'
  const clientId =
    (payload["appid"] as string | undefined) ??
    (payload["azp"] as string | undefined);
  if (!clientId) {
    throw new ApiError(
      "UNAUTHORIZED",
      "Cannot identify calling application",
      401,
    );
  }

  const roles = Array.isArray(payload["roles"])
    ? (payload["roles"] as string[])
    : [];

  return { clientId, scopes: roles, tenantId };
}
