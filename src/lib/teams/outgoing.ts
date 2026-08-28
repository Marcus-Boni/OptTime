/**
 * HMAC validation for Microsoft Teams outgoing webhooks.
 *
 * Teams signs the RAW request body with HMAC-SHA256 using the base64 secret
 * generated when the outgoing webhook is created, and sends the base64
 * signature as `Authorization: HMAC <signature>`. Anything that fails to
 * verify is treated as untrusted input and rejected before parsing.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export function verifyTeamsHmac(
  rawBody: string,
  authorizationHeader: string | null,
  secretBase64: string,
): boolean {
  if (!authorizationHeader || !secretBase64) return false;

  const match = authorizationHeader.trim().match(/^HMAC\s+(.+)$/i);
  const providedSignature = match?.[1]?.trim();
  if (!providedSignature) return false;

  try {
    const secret = Buffer.from(secretBase64, "base64");
    const expected = createHmac("sha256", secret)
      .update(Buffer.from(rawBody, "utf8"))
      .digest();
    const provided = Buffer.from(providedSignature, "base64");

    return (
      provided.length === expected.length && timingSafeEqual(provided, expected)
    );
  } catch {
    return false;
  }
}

/** Payload subset Teams sends to outgoing webhooks. */
export interface TeamsOutgoingMessage {
  type?: string;
  text?: string;
  from?: {
    id?: string;
    name?: string;
    aadObjectId?: string;
  };
}

/** Strips the bot @mention and any HTML Teams embeds in the message text. */
export function extractCommandText(message: TeamsOutgoingMessage): string {
  const raw = message.text ?? "";

  return raw
    .replace(/<at[^>]*>.*?<\/at>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}
