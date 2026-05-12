import { createHmac, timingSafeEqual } from "crypto";

export function sign(body: string, secret: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

export function verify(
  body: string,
  signature: string,
  secret: string,
): boolean {
  const expected = sign(body, secret);
  try {
    // Both buffers must be the same length for timingSafeEqual
    const expectedBuf = Buffer.from(expected);
    const receivedBuf = Buffer.from(signature);
    if (expectedBuf.length !== receivedBuf.length) return false;
    return timingSafeEqual(expectedBuf, receivedBuf);
  } catch {
    return false;
  }
}
