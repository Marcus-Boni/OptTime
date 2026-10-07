/**
 * Minimal self-signed X.509 v3 certificate, DER-encoded.
 *
 * Microsoft Graph only uses the certificate to read the RSA public key it
 * encrypts rich notifications with — it never checks the issuer — so a
 * self-signed certificate is the documented choice. Building the handful of
 * ASN.1 structures by hand avoids an openssl step or a PKI dependency.
 */

import {
  createPrivateKey,
  createPublicKey,
  type KeyObject,
  randomBytes,
  sign,
} from "node:crypto";

// ─── DER primitives ──────────────────────────────────────────────────

function length(size: number): Buffer {
  if (size < 0x80) return Buffer.from([size]);
  const bytes: number[] = [];
  let rest = size;
  while (rest > 0) {
    bytes.unshift(rest & 0xff);
    rest >>= 8;
  }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function tlv(tag: number, content: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), length(content.length), content]);
}

const sequence = (...items: Buffer[]): Buffer =>
  tlv(0x30, Buffer.concat(items));
const set = (...items: Buffer[]): Buffer => tlv(0x31, Buffer.concat(items));
const nullValue = (): Buffer => Buffer.from([0x05, 0x00]);

function integer(bytes: Buffer): Buffer {
  // A leading 1 bit would read as negative; DER pads with a zero byte.
  const value =
    (bytes[0] ?? 0) & 0x80 ? Buffer.concat([Buffer.from([0]), bytes]) : bytes;
  return tlv(0x02, value);
}

function oid(dotted: string): Buffer {
  const parts = dotted.split(".").map(Number);
  const [first = 0, second = 0, ...rest] = parts;
  const bytes = [first * 40 + second];
  for (const part of rest) {
    const chunk: number[] = [part & 0x7f];
    let value = part >> 7;
    while (value > 0) {
      chunk.unshift((value & 0x7f) | 0x80);
      value >>= 7;
    }
    bytes.push(...chunk);
  }
  return tlv(0x06, Buffer.from(bytes));
}

function utcTime(date: Date): Buffer {
  const pad = (value: number): string => String(value).padStart(2, "0");
  const text = `${pad(date.getUTCFullYear() % 100)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
  return tlv(0x17, Buffer.from(text, "ascii"));
}

function bitString(bytes: Buffer): Buffer {
  return tlv(0x03, Buffer.concat([Buffer.from([0]), bytes]));
}

const SHA256_WITH_RSA = "1.2.840.113549.1.1.11";
const COMMON_NAME = "2.5.4.3";

function name(commonName: string): Buffer {
  return sequence(
    set(sequence(oid(COMMON_NAME), tlv(0x0c, Buffer.from(commonName, "utf8")))),
  );
}

// ─── Certificate ─────────────────────────────────────────────────────

export interface SelfSignedCertificateInput {
  privateKey: KeyObject;
  commonName: string;
  notBefore: Date;
  notAfter: Date;
}

/** DER bytes of a self-signed certificate for the key pair. */
export function createSelfSignedCertificate(
  input: SelfSignedCertificateInput,
): Buffer {
  const publicKey = createPublicKey(input.privateKey);
  const subjectPublicKeyInfo = publicKey.export({
    type: "spki",
    format: "der",
  });
  const algorithm = sequence(oid(SHA256_WITH_RSA), nullValue());
  const subject = name(input.commonName);

  const serial = randomBytes(16);
  serial[0] = (serial[0] ?? 0) & 0x7f;

  const tbsCertificate = sequence(
    tlv(0xa0, integer(Buffer.from([2]))), // [0] version: v3
    integer(serial),
    algorithm,
    subject, // issuer = subject: self-signed
    sequence(utcTime(input.notBefore), utcTime(input.notAfter)),
    subject,
    subjectPublicKeyInfo,
  );

  const signature = sign("sha256", tbsCertificate, input.privateKey);
  return sequence(tbsCertificate, algorithm, bitString(signature));
}

/** Re-hydrates a PEM private key (as stored) into a KeyObject. */
export function loadPrivateKey(pem: string): KeyObject {
  return createPrivateKey(pem);
}
