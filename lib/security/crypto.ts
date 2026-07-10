/**
 * Symmetric encryption for marketplace API credentials at rest.
 *
 * AES-256-GCM with a server-only key (CREDENTIALS_ENCRYPTION_KEY — never sent
 * to the client, never NEXT_PUBLIC_). Used to store a seller's Trendyol API
 * Key/Secret so the raw credential is never readable directly from the
 * database, only decryptable server-side when a real Trendyol call is made.
 *
 * Node-only (uses `crypto`) — import exclusively from server code (API
 * routes), never from a "use client" component.
 */

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey(): Buffer {
  const secret = process.env.CREDENTIALS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("CREDENTIALS_ENCRYPTION_KEY is not set — cannot store credentials securely.");
  }
  // Accept any-length passphrase; derive a stable 32-byte key from it.
  return scryptSync(secret, "truemargin-credentials", 32);
}

/** Returns "iv:authTag:ciphertext", all base64, colon-joined. */
export function encryptSecret(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(payload: string): string {
  const key = deriveKey();
  const [ivB64, authTagB64, dataB64] = payload.split(":");
  if (!ivB64 || !authTagB64 || !dataB64) {
    throw new Error("Malformed encrypted payload.");
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(authTagB64, "base64"));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}
