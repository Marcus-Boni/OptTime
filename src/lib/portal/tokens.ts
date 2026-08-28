/**
 * Capability tokens, password hashing and viewer sessions for the Client
 * Portal.
 *
 * - The URL token is a 32-byte random capability (base64url).
 * - Passwords are scrypt-hashed ("saltHex:hashHex") and compared in constant
 *   time — never stored or logged in plaintext.
 * - After a correct password, the viewer gets a short-lived HS256 JWT cookie
 *   scoped to that single link, so the password is typed once per device.
 */

import {
  createHash,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { jwtVerify, SignJWT } from "jose";

const SCRYPT_KEYLEN = 64;
/** Viewer session lifetime after a correct password. */
const SESSION_TTL_HOURS = 12;

export const PORTAL_COOKIE_PREFIX = "optsolv_portal_";

export function generatePortalToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashPortalPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, SCRYPT_KEYLEN);
  return `${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPortalPassword(
  password: string,
  storedHash: string,
): boolean {
  const [saltHex, hashHex] = storedHash.split(":");
  if (!saltHex || !hashHex) return false;

  try {
    const expected = Buffer.from(hashHex, "hex");
    const actual = scryptSync(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      expected.length,
    );
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Signing key derived from the app secret. Isolated derivation ("portal:")
 * keeps these JWTs useless anywhere else in the system.
 */
function getPortalSigningKey(): Uint8Array {
  const secret =
    process.env.BETTER_AUTH_SECRET ?? process.env.ENCRYPTION_KEY ?? "";

  if (!secret) {
    throw new Error(
      "BETTER_AUTH_SECRET (ou ENCRYPTION_KEY) é obrigatório para sessões do portal.",
    );
  }

  return new Uint8Array(
    createHash("sha256").update(`portal:${secret}`).digest(),
  );
}

export function portalCookieName(linkId: string): string {
  // Cookie names must stay short and header-safe; the id is already opaque.
  return `${PORTAL_COOKIE_PREFIX}${createHash("sha256").update(linkId).digest("hex").slice(0, 16)}`;
}

export async function createPortalSessionJwt(linkId: string): Promise<string> {
  return new SignJWT({ linkId })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_HOURS}h`)
    .sign(getPortalSigningKey());
}

export async function verifyPortalSessionJwt(
  token: string,
  linkId: string,
): Promise<boolean> {
  try {
    const { payload } = await jwtVerify(token, getPortalSigningKey());
    return payload.linkId === linkId;
  } catch {
    return false;
  }
}

export const PORTAL_SESSION_MAX_AGE_SECONDS = SESSION_TTL_HOURS * 3600;
