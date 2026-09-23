import { afterEach, describe, expect, it } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/security/crypto";

/**
 * Security unit tests — marketplace credentials at rest.
 *
 * TrueMargin encrypts with Node AES-256-GCM (lib/security/crypto.ts), NOT
 * Postgres pgcrypto. Keys live only in CREDENTIALS_ENCRYPTION_KEY (server env);
 * ciphertext shape is iv:authTag:ciphertext (base64). Decrypt happens in
 * async sync paths (marketplace-resync), never in client bundles.
 */

describe("CREDENTIALS_ENCRYPTION_KEY + AES-256-GCM", () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it("refuses to encrypt when CREDENTIALS_ENCRYPTION_KEY is missing", () => {
    delete process.env.CREDENTIALS_ENCRYPTION_KEY;
    expect(() => encryptSecret("trendyol-api-key")).toThrow(/CREDENTIALS_ENCRYPTION_KEY/);
  });

  it("round-trips plaintext ↔ ciphertext (AES-256-GCM)", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "unit-test-credentials-secret-v1";
    const plain = "ty-supplier-secret-abc123";
    const enc = encryptSecret(plain);
    expect(enc).not.toContain(plain);
    expect(enc.split(":")).toHaveLength(3);
    expect(decryptSecret(enc)).toBe(plain);
  });

  it("never stores plaintext-looking payloads (no raw key substring)", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "unit-test-credentials-secret-v1";
    const plain = "SUPER_SECRET_API_KEY_XYZ";
    const enc = encryptSecret(plain);
    expect(enc.includes(plain)).toBe(false);
    expect(enc.toLowerCase().includes("super_secret")).toBe(false);
  });

  it("rejects malformed ciphertext", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "unit-test-credentials-secret-v1";
    expect(() => decryptSecret("not-a-valid-payload")).toThrow(/Malformed/);
  });

  it("fails closed when decrypting with a different env key", () => {
    process.env.CREDENTIALS_ENCRYPTION_KEY = "key-alpha";
    const enc = encryptSecret("payload");
    process.env.CREDENTIALS_ENCRYPTION_KEY = "key-beta-different";
    expect(() => decryptSecret(enc)).toThrow();
  });

  it("documents that encryption is app-layer AES-GCM (not pgcrypto SQL)", () => {
    // marketplace_credentials.api_key_encrypted columns hold Node crypto output.
    // user_settings holds prefs only — no API keys there.
    process.env.CREDENTIALS_ENCRYPTION_KEY = "unit-test-credentials-secret-v1";
    const enc = encryptSecret("x");
    // GCM payload: three base64 segments
    expect(enc.split(":").every((p) => /^[A-Za-z0-9+/=]*$/.test(p))).toBe(true);
  });
});
