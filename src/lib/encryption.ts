import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "crypto";

const ALGORITHM = "aes-256-gcm";

function getEncryptionKey(): Buffer {
  const secret = process.env.ENCRYPTION_KEY?.trim();
  if (!secret) {
    throw new Error(
      "ENCRYPTION_KEY is required. Define it in the environment before encrypting or decrypting Azure DevOps credentials.",
    );
  }
  // Hash the secret to ensure it's exactly 32 bytes for AES-256
  return createHash("sha256").update(secret).digest();
}

/**
 * Encrypts a string using AES-256-GCM.
 * Used for safely storing tokens like Azure DevOps PAT in the database.
 */
export function encrypt(text: string): string {
  if (!text) return text;

  const key = getEncryptionKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag().toString("hex");

  // Format: iv:authTag:encryptedValue
  return `${iv.toString("hex")}:${authTag}:${encrypted}`;
}

/**
 * Decrypts a string that was encrypted with `encrypt()`.
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText || !encryptedText.includes(":")) return encryptedText;

  const key = getEncryptionKey();

  try {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(":");

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error("Invalid encrypted text format");
    }

    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");

    return decrypted;
  } catch (error) {
    console.error("[Decryption Failed]:", error);
    return ""; // Return empty string on failure instead of throwing to prevent crashing the app
  }
}
