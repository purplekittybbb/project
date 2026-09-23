/**
 * Sanitize post-login / post-connect return paths.
 * Only same-origin relative paths; block protocol-relative //evil.com,
 * backslashes, and encoded bypasses (/%2F%2Fevil.com).
 */

const AUTH_PATH_DENY = new Set([
  "/login",
  "/signup",
  "/sifremi-unuttum",
  "/sifre-sifirla",
]);

function decodeFully(raw: string, maxRounds = 3): string {
  let cur = raw;
  for (let i = 0; i < maxRounds; i++) {
    try {
      const next = decodeURIComponent(cur);
      if (next === cur) break;
      cur = next;
    } catch {
      break;
    }
  }
  return cur;
}

export function safeNextPath(raw: string | null | undefined, fallback = "/connect"): string {
  if (!raw) return fallback;

  const decoded = decodeFully(raw.trim());
  if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
  if (decoded.includes("\\") || decoded.includes("\0")) return fallback;
  if (/^\/[a-z][a-z0-9+.-]*:/i.test(decoded)) return fallback;

  const pathOnly = decoded.split(/[?#]/)[0] ?? decoded;
  if (AUTH_PATH_DENY.has(pathOnly)) return fallback;

  return decoded;
}
