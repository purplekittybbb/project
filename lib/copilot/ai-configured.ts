/**
 * Single gate: real Claude-backed Copilot answers vs. the deterministic
 * rule-based fallback in app/api/chat/route.ts.
 *
 * Server code can read ANTHROPIC_API_KEY directly. Client components cannot
 * (no NEXT_PUBLIC_ prefix — the secret stays server-only). next.config.mjs
 * mirrors presence as AI_CONFIGURED so this same function works in both, and
 * the Copilot tab can show "Rule-based response (AI not configured)" instead
 * of silently presenting a scripted answer as if it came from the model.
 */
export function isAiConfigured(): boolean {
  if (process.env.ANTHROPIC_API_KEY?.trim()) return true;
  return process.env.AI_CONFIGURED === "1";
}
