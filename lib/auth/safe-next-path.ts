/**
 * Sanitize post-login / post-connect return paths.
 * Only same-origin relative paths; block protocol-relative //evil.com.
 */

export function safeNextPath(raw: string | null | undefined, fallback = "/connect"): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  // Block backslash tricks and encoded schemes
  if (raw.includes("\\") || /^\/[a-z]+:/i.test(raw)) return fallback;
  return raw;
}
