/**
 * Microsoft Graph rich change notifications: authenticity and decryption.
 *
 * Follows https://learn.microsoft.com/graph/change-notifications-with-resource-data
 * - every `validationTokens` JWT must be signed by the Microsoft identity
 *   platform, issued to our app (aud) in our tenant, and published by the
 *   Graph change-notification service (azp/appid 0bf30f3b-…);
 * - `dataKey` is RSA-OAEP(SHA-1) encrypted with our public key; the symmetric
 *   key signs `data` with HMAC-SHA256 and decrypts it with AES-CBC/PKCS7,
 *   the IV being the key's first 16 bytes.
 */

import {
  constants,
  createDecipheriv,
  createHmac,
  privateDecrypt,
  timingSafeEqual,
} from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";

/** Microsoft Graph Change Tracking service principal. */
export const GRAPH_CHANGE_TRACKING_APP_ID =
  "0bf30f3b-4a52-48df-9a82-234910c4a086";

const MICROSOFT_KEYS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys"),
  { cacheMaxAge: 12 * 60 * 60_000 },
);

export interface EncryptedContent {
  data: string;
  dataSignature: string;
  dataKey: string;
  encryptionCertificateId: string;
  encryptionCertificateThumbprint?: string;
}

export interface ChangeNotification {
  subscriptionId: string;
  clientState?: string | null;
  changeType?: string;
  tenantId?: string;
  resource?: string;
  lifecycleEvent?: "reauthorizationRequired" | "subscriptionRemoved" | "missed";
  encryptedContent?: EncryptedContent;
}

export interface ChangeNotificationCollection {
  value?: ChangeNotification[];
  validationTokens?: string[] | null;
}

export class NotificationDecryptionError extends Error {}

/** Decrypts one item; throws on a signature mismatch (tampered payload). */
export function decryptNotificationContent(
  content: EncryptedContent,
  privateKeyPem: string,
): unknown {
  const symmetricKey = privateDecrypt(
    {
      key: privateKeyPem,
      padding: constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha1",
    },
    Buffer.from(content.dataKey, "base64"),
  );

  const expected = Buffer.from(content.dataSignature, "base64");
  const actual = createHmac("sha256", symmetricKey)
    .update(Buffer.from(content.data, "base64"))
    .digest();
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new NotificationDecryptionError("Assinatura do conteúdo inválida.");
  }

  const algorithm = `aes-${symmetricKey.length * 8}-cbc`;
  const decipher = createDecipheriv(
    algorithm,
    symmetricKey,
    symmetricKey.subarray(0, 16),
  );
  const plain = Buffer.concat([
    decipher.update(Buffer.from(content.data, "base64")),
    decipher.final(),
  ]).toString("utf8");

  return JSON.parse(plain);
}

/**
 * True when every validation token proves the batch came from Graph for our
 * app and tenant. An empty or null list is invalid: rich notifications always
 * carry tokens when the app is configured correctly.
 */
export async function verifyValidationTokens(
  tokens: string[] | null | undefined,
  expected: { appId: string; tenantId: string },
): Promise<boolean> {
  if (!tokens || tokens.length === 0) return false;

  try {
    for (const token of tokens) {
      const { payload } = await jwtVerify(token, MICROSOFT_KEYS, {
        audience: expected.appId,
        clockTolerance: 300,
      });

      const issuer = String(payload.iss ?? "");
      const tenant = expected.tenantId.toLowerCase();
      const issuerOk =
        issuer.toLowerCase() === `https://sts.windows.net/${tenant}/` ||
        issuer.toLowerCase() ===
          `https://login.microsoftonline.com/${tenant}/v2.0`;
      if (!issuerOk) return false;

      const publisher = payload.ver === "1.0" ? payload.appid : payload.azp;
      if (publisher !== GRAPH_CHANGE_TRACKING_APP_ID) return false;
    }
    return true;
  } catch (error: unknown) {
    console.warn(
      "[graph-notifications] validation token rejected:",
      error instanceof Error ? error.message : error,
    );
    return false;
  }
}
