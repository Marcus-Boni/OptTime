/**
 * Encryption keys for Microsoft Graph rich notifications.
 *
 * The app owns its key pair end to end: generated on first use, stored in
 * `system_setting` with the private key encrypted (AES-256-GCM, the same
 * ENCRYPTION_KEY as the other secrets), and rotated yearly. The previous key
 * is kept so notifications for subscriptions created before a rotation still
 * decrypt. Nobody has to create, upload or renew a certificate.
 */

import { generateKeyPairSync, randomUUID } from "node:crypto";
import { db } from "@/lib/db";
import { systemSetting } from "@/lib/db/schema";
import { decrypt, encrypt } from "@/lib/encryption";
import { createSelfSignedCertificate } from "@/lib/graph/x509";

export const GRAPH_KEYS_SETTING = "graph_notification_keys";

const KEY_MAX_AGE_MS = 330 * 24 * 60 * 60_000;
const CERTIFICATE_VALIDITY_MS = 2 * 365 * 24 * 60 * 60_000;
const KEYS_KEPT = 2;

export interface NotificationKey {
  /** Sent as encryptionCertificateId; echoed in every notification. */
  id: string;
  /** Base64 DER certificate (public key only), sent to Graph. */
  certificate: string;
  /** PEM private key, decrypted in memory only. */
  privateKeyPem: string;
  createdAt: string;
}

interface StoredKey {
  id: string;
  certificate: string;
  privateKey: string; // encrypted PEM
  createdAt: string;
}

function generateKey(now: Date): StoredKey {
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const certificate = createSelfSignedCertificate({
    privateKey,
    commonName: "OptSolv Time - Graph notifications",
    notBefore: new Date(now.getTime() - 60 * 60_000),
    notAfter: new Date(now.getTime() + CERTIFICATE_VALIDITY_MS),
  });
  const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

  return {
    id: `optsolv-time-${randomUUID()}`,
    certificate: certificate.toString("base64"),
    privateKey: encrypt(pem),
    createdAt: now.toISOString(),
  };
}

async function readStored(): Promise<StoredKey[]> {
  const row = await db.query.systemSetting.findFirst({
    where: (fields, { eq }) => eq(fields.key, GRAPH_KEYS_SETTING),
  });
  if (!row) return [];
  try {
    const parsed = JSON.parse(row.value) as { keys?: StoredKey[] };
    return parsed.keys ?? [];
  } catch {
    return [];
  }
}

async function writeStored(keys: StoredKey[]): Promise<void> {
  const value = JSON.stringify({ keys });
  await db
    .insert(systemSetting)
    .values({ key: GRAPH_KEYS_SETTING, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: systemSetting.key,
      set: { value, updatedAt: new Date() },
    });
}

function toKey(stored: StoredKey): NotificationKey {
  return {
    id: stored.id,
    certificate: stored.certificate,
    privateKeyPem: decrypt(stored.privateKey),
    createdAt: stored.createdAt,
  };
}

/** Key for new subscriptions; creates or rotates it when due. */
export async function getCurrentNotificationKey(
  now = new Date(),
): Promise<NotificationKey> {
  const keys = await readStored();
  const current = keys.at(-1);

  if (
    current &&
    now.getTime() - Date.parse(current.createdAt) < KEY_MAX_AGE_MS
  ) {
    return toKey(current);
  }

  const fresh = generateKey(now);
  await writeStored([...keys, fresh].slice(-KEYS_KEPT));
  // Re-read: a concurrent writer may have won; use whatever is stored.
  const stored = (await readStored()).at(-1) ?? fresh;
  return toKey(stored);
}

/** Every key that may still have encrypted notifications in flight. */
export async function getNotificationKeys(): Promise<NotificationKey[]> {
  return (await readStored()).map(toKey);
}
